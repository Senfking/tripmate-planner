import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BudgetLevel = "budget" | "mid-range" | "premium";
type Pace = "packed" | "balanced" | "relaxed";

interface TripBuilderRequest {
  trip_id?: string | null;
  destination: string;
  start_date: string;
  end_date: string;
  group_size: number;
  budget_level: BudgetLevel;
  interests: string[];
  dietary: string[];
  pace: Pace;
  notes?: string | null;
}

/** Calculate the number of days between two YYYY-MM-DD date strings (inclusive). */
function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / 86_400_000) + 1; // inclusive
}

/** Build a deterministic cache key from the request parameters. */
function buildCacheKey(r: TripBuilderRequest): string {
  const parts = [
    r.destination.toLowerCase().trim(),
    r.start_date,
    r.end_date,
    String(r.group_size),
    r.budget_level,
    [...r.interests].sort().join(","),
    [...r.dietary].sort().join(","),
    r.pace,
  ];
  return parts.join("|");
}

/** Estimate cost in USD based on model and token counts. Sonnet 4 pricing. */
function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  // Claude Sonnet 4: $3/M input, $15/M output
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Auth check ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authErr,
    } = await authClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    // ---- Parse & validate input ----
    const body: TripBuilderRequest = await req.json();
    const {
      trip_id = null,
      destination,
      start_date,
      end_date,
      group_size,
      budget_level,
      interests = [],
      dietary = [],
      pace,
      notes = null,
    } = body;

    if (!destination || !destination.trim()) {
      return jsonResponse({ success: false, error: "destination is required" }, 400);
    }
    if (!start_date || !end_date) {
      return jsonResponse({ success: false, error: "start_date and end_date are required" }, 400);
    }
    const numDays = daysBetween(start_date, end_date);
    if (numDays < 1) {
      return jsonResponse({ success: false, error: "end_date must be on or after start_date" }, 400);
    }
    if (numDays > 21) {
      return jsonResponse(
        { success: false, error: "Trip duration cannot exceed 21 days" },
        400,
      );
    }
    if (!group_size || group_size < 1 || group_size > 20) {
      return jsonResponse(
        { success: false, error: "group_size must be between 1 and 20" },
        400,
      );
    }
    const validBudgets: BudgetLevel[] = ["budget", "mid-range", "premium"];
    if (!validBudgets.includes(budget_level)) {
      return jsonResponse(
        { success: false, error: "budget_level must be budget, mid-range, or premium" },
        400,
      );
    }
    const validPaces: Pace[] = ["packed", "balanced", "relaxed"];
    if (!validPaces.includes(pace)) {
      return jsonResponse(
        { success: false, error: "pace must be packed, balanced, or relaxed" },
        400,
      );
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Cache check ----
    const cacheKey = buildCacheKey(body);
    try {
      const { data: cached } = await svcClient
        .from("ai_response_cache")
        .select("response, created_at")
        .eq("cache_key", cacheKey)
        .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached?.response) {
        console.log("Cache hit for trip builder:", cacheKey.slice(0, 60));
        // Track cache hit
        await svcClient.from("analytics_events").insert({
          event_name: "ai_trip_builder",
          user_id: user.id,
          properties: { source: "cache", destination: destination.trim() },
        });
        return jsonResponse({ success: true, ...cached.response });
      }
    } catch {
      // ai_response_cache table may not exist yet — continue without cache
      console.log("Cache lookup skipped (table may not exist)");
    }

    // ---- Fetch Vibe Board data if trip_id provided ----
    let vibeContext = "";
    if (trip_id) {
      try {
        const { data: vibeAgg } = await svcClient.rpc("get_vibe_aggregates", {
          _trip_id: trip_id,
        });
        if (vibeAgg && vibeAgg.length > 0) {
          const grouped: Record<string, string[]> = {};
          for (const row of vibeAgg) {
            const key = row.question_key as string;
            const val = `${row.answer_value} (${row.response_count} votes)`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(val);
          }
          const lines = Object.entries(grouped)
            .map(([k, vals]) => `  ${k}: ${vals.join(", ")}`)
            .join("\n");
          vibeContext = `\n\nGROUP VIBE BOARD RESULTS (from trip members voting):\n${lines}\nUse these preferences to guide your choices. For example, if most voted "Full send" for energy, plan more intense activities. If "Slow & easy" won, keep it relaxed regardless of the pace parameter.`;
        }
      } catch (e) {
        console.error("Failed to fetch vibe data:", e);
        // Non-fatal — continue without vibe context
      }
    }

    // ---- Build AI prompt ----
    const paceGuide: Record<Pace, string> = {
      packed: "4-5 activities per day. The group wants to see and do everything.",
      balanced: "3-4 activities per day. Mix active exploration with downtime.",
      relaxed: "2-3 activities per day. Plenty of free time and slow mornings.",
    };

    const budgetGuide: Record<BudgetLevel, string> = {
      budget:
        "Street food, local eateries, hostels, budget guesthouses. Activities: free walking tours, public beaches, markets, temples. Transport: public transit, shared rides.",
      "mid-range":
        "Mid-tier restaurants, 3-star hotels, boutique stays. Activities: guided tours, cooking classes, snorkeling trips. Transport: private transfers for longer distances.",
      premium:
        "Fine dining, luxury resorts, 5-star hotels. Activities: private tours, spa treatments, yacht charters, exclusive experiences. Transport: private car/driver.",
    };

    const dietaryNote =
      dietary.length > 0 && !dietary.every((d) => d === "none")
        ? `\n\nDIETARY REQUIREMENTS: ${dietary.filter((d) => d !== "none").join(", ")}. For EVERY restaurant/food activity, include a dietary_notes field explaining how this venue accommodates these requirements. If a venue cannot accommodate them, choose a different venue.`
        : "";

    const accessibilityNote = notes
      ? `\n\nSPECIAL NOTES FROM THE GROUP: "${notes}". Factor these into every recommendation. If accessibility is mentioned, avoid venues with stairs-only access, long hikes, etc.`
      : "";

    const systemPrompt = `You are an expert travel planner for Junto, a group trip planning app. You create detailed, realistic, map-ready itineraries using REAL venues and places that actually exist.

CRITICAL RULES:
1. Use REAL, SPECIFIC venue names that actually exist in ${destination.trim()}. Never use generic descriptions like "a nice beachside restaurant" — instead use the actual name like "La Brisa Beach Club, Canggu". Every venue must be a real place someone can find on Google Maps.
2. Include realistic latitude/longitude coordinates for each venue. You know approximate locations of real places — use that knowledge. Coordinates should place a map pin within a few hundred meters of the actual venue.
3. Schedule realistically: include travel time between locations, proper meal times (breakfast 7-9am, lunch 12-2pm, dinner 7-9pm). Don't schedule an activity in the north of a city at 10am and another in the south at 10:30am.
4. Each day should flow naturally: morning activity -> lunch -> afternoon -> dinner -> optional evening activity.
5. Balance different group interests across the trip. Don't cluster all culture on one day and all food on another — weave them together.
6. The google_maps_query should be specific enough to find the exact venue (e.g. "Ku De Ta Seminyak Bali" not just "restaurant Bali").
7. The google_maps_url must be a valid Google Maps search URL: https://www.google.com/maps/search/?api=1&query=<URL-encoded query>

PACE: ${paceGuide[pace]}

BUDGET LEVEL (${budget_level}): ${budgetGuide[budget_level]}

GROUP SIZE: ${group_size} people. Ensure venues can accommodate this group size. For large groups (8+), prefer venues with group seating or reservable spaces.

INTERESTS: ${interests.length > 0 ? interests.join(", ") : "general sightseeing"}. Prioritize these but also include essential activities (meals, transport) that may not match an interest category.${dietaryNote}${accessibilityNote}${vibeContext}

BOOKING URLS — generate affiliate-ready URLs using these patterns:
- Hotels/accommodation: https://www.booking.com/search.html?ss=<venue+name+location, URL-encoded>&aid=PLACEHOLDER_AID
- Bookable activities/tours: https://www.viator.com/searchResults/all?text=<activity+name+location, URL-encoded>&mcid=PLACEHOLDER_MCID
- Restaurants: null (no affiliate)
- Free attractions (temples, beaches, parks, markets): null

OUTPUT FORMAT: Return ONLY valid JSON matching the exact schema below. No markdown, no code fences, no explanation — just the raw JSON object.

{
  "trip_summary": "2-3 sentence overview of the trip plan",
  "map_center": { "latitude": number, "longitude": number },
  "map_zoom": number (13 for a city, 10 for a region/island),
  "daily_budget_estimate": { "amount": number, "currency": "USD" },
  "packing_suggestions": ["item1", "item2", ...] (5-8 practical items specific to this destination and activities),
  "days": [
    {
      "date": "YYYY-MM-DD",
      "theme": "Creative theme for the day (e.g. 'Beach Day & Sunset Vibes')",
      "activities": [
        {
          "title": "Specific Real Venue Name",
          "description": "2-3 vivid sentences describing the experience at this specific venue",
          "category": "food" | "culture" | "nature" | "nightlife" | "adventure" | "relaxation" | "transport" | "accommodation",
          "start_time": "HH:MM",
          "duration_minutes": number,
          "estimated_cost_per_person": number,
          "currency": "local currency code",
          "location_name": "Exact venue name as on Google Maps",
          "location_address": "Street address or area",
          "latitude": number,
          "longitude": number,
          "google_maps_query": "search query to find this exact place",
          "google_maps_url": "https://www.google.com/maps/search/?api=1&query=...",
          "photo_query": "search query for a representative photo",
          "booking_url": "affiliate URL or null",
          "tips": "One practical insider tip",
          "dietary_notes": "Dietary info or null"
        }
      ]
    }
  ]
}`;

    const userPrompt = `Plan a ${numDays}-day group trip to ${destination.trim()} for ${group_size} people.

Dates: ${start_date} to ${end_date}
Budget: ${budget_level}
Pace: ${pace}
Interests: ${interests.length > 0 ? interests.join(", ") : "general"}
Dietary: ${dietary.length > 0 ? dietary.join(", ") : "none"}
${notes ? `Notes: ${notes}` : ""}

Generate the complete itinerary as JSON.`;

    // ---- Call Anthropic API ----
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errText);
      return jsonResponse(
        { success: false, error: `AI generation failed (${anthropicRes.status})` },
        500,
      );
    }

    const anthropicData = await anthropicRes.json();
    const textContent =
      anthropicData.content?.find((c: { type: string }) => c.type === "text")?.text || "";
    const inputTokens: number = anthropicData.usage?.input_tokens ?? 0;
    const outputTokens: number = anthropicData.usage?.output_tokens ?? 0;

    // ---- Parse JSON response ----
    let itinerary: Record<string, unknown>;
    try {
      // Handle possible markdown code fences
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const raw = jsonMatch ? jsonMatch[1].trim() : textContent.trim();
      itinerary = JSON.parse(raw);
    } catch {
      console.error("Failed to parse AI response:", textContent.slice(0, 500));
      return jsonResponse(
        { success: false, error: "Failed to parse AI-generated itinerary" },
        500,
      );
    }

    // ---- Log request to ai_request_log (if table exists) ----
    try {
      await svcClient.from("ai_request_log").insert({
        user_id: user.id,
        feature: "trip_builder",
        model: "claude-sonnet-4-20250514",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: estimateCostUsd(inputTokens, outputTokens),
      });
    } catch {
      // Table may not exist — log to analytics instead
      console.log("ai_request_log insert skipped (table may not exist)");
    }

    // ---- Cache the response ----
    try {
      await svcClient.from("ai_response_cache").insert({
        cache_key: cacheKey,
        feature: "trip_builder",
        response: itinerary,
      });
    } catch {
      console.log("ai_response_cache insert skipped (table may not exist)");
    }

    // ---- Track usage in analytics_events ----
    await svcClient.from("analytics_events").insert({
      event_name: "ai_trip_builder",
      user_id: user.id,
      properties: {
        source: "generated",
        destination: destination.trim(),
        days: numDays,
        group_size,
        budget_level,
        pace,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    });

    return jsonResponse({ success: true, ...itinerary });
  } catch (e) {
    console.error("generate-trip-itinerary error:", e);
    return jsonResponse(
      { success: false, error: (e as Error).message || "Internal error" },
      500,
    );
  }
});

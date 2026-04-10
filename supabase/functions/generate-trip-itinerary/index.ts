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
  destination?: string | null;
  surprise_me?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  flexible?: boolean;
  duration_days?: number | null;
  group_size?: number;
  budget_level?: BudgetLevel;
  vibes?: string[];
  interests?: string[];
  dietary?: string[];
  pace?: Pace;
  notes?: string | null;
  free_text?: string | null;
  alternatives_mode?: boolean;
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

function buildCacheKey(r: TripBuilderRequest, dest: string, numDays: number): string {
  const interests = r.vibes || r.interests || [];
  const parts = [
    dest.toLowerCase().trim(),
    String(numDays),
    String(r.group_size || 1),
    r.budget_level || "mid-range",
    [...interests].sort().join(","),
    [...(r.dietary || [])].sort().join(","),
    r.pace || "balanced",
  ];
  return parts.join("|");
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
}

/** Generate fake start/end dates for flexible trips */
function generateFlexDates(durationDays: number): { start: string; end: string } {
  const start = new Date();
  start.setDate(start.getDate() + 30); // 30 days from now
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays - 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(start), end: fmt(end) };
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

    // Handle alternatives mode separately
    if (body.alternatives_mode) {
      // TODO: implement alternatives generation
      return jsonResponse({ success: true, alternatives: [] });
    }

    const {
      trip_id = null,
      destination: rawDest,
      surprise_me = false,
      start_date: rawStart,
      end_date: rawEnd,
      flexible = false,
      duration_days: rawDuration,
      group_size = 1,
      budget_level = "mid-range",
      vibes = [],
      interests: rawInterests = [],
      dietary = [],
      pace = "balanced",
      notes = null,
      free_text = null,
    } = body;

    // Resolve destination
    const destination = surprise_me ? "a surprise destination (you choose an amazing, underrated destination)" : (rawDest || "").trim();
    if (!destination) {
      return jsonResponse({ success: false, error: "destination is required (or set surprise_me=true)" }, 400);
    }

    // Resolve dates
    let startDate: string;
    let endDate: string;

    if (flexible || (!rawStart && !rawEnd)) {
      const dur = rawDuration && rawDuration > 0 ? Math.min(rawDuration, 21) : 7;
      const flexDates = generateFlexDates(dur);
      startDate = flexDates.start;
      endDate = flexDates.end;
    } else {
      if (!rawStart || !rawEnd) {
        return jsonResponse({ success: false, error: "start_date and end_date are required when not using flexible dates" }, 400);
      }
      startDate = rawStart;
      endDate = rawEnd;
    }

    const numDays = daysBetween(startDate, endDate);
    if (numDays < 1) {
      return jsonResponse({ success: false, error: "end_date must be on or after start_date" }, 400);
    }
    if (numDays > 21) {
      return jsonResponse({ success: false, error: "Trip duration cannot exceed 21 days" }, 400);
    }

    const clampedGroupSize = Math.max(1, Math.min(group_size, 20));

    const validBudgets: BudgetLevel[] = ["budget", "mid-range", "premium"];
    const safeBudget = validBudgets.includes(budget_level) ? budget_level : "mid-range";

    const validPaces: Pace[] = ["packed", "balanced", "relaxed"];
    const safePace = validPaces.includes(pace) ? pace : "balanced";

    // Merge vibes and interests
    const allInterests = [...new Set([...vibes, ...rawInterests])].filter(Boolean);

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Cache check ----
    const cacheKey = buildCacheKey(body, destination, numDays);
    try {
      const { data: cached } = await svcClient
        .from("ai_response_cache")
        .select("response_json, created_at")
        .eq("cache_key", cacheKey)
        .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached?.response_json) {
        console.log("Cache hit for trip builder:", cacheKey.slice(0, 60));
        await svcClient.from("analytics_events").insert({
          event_name: "ai_trip_builder",
          user_id: user.id,
          properties: { source: "cache", destination: destination.trim() },
        });
        return jsonResponse({ success: true, ...cached.response_json as Record<string, unknown> });
      }
    } catch {
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
          vibeContext = `\n\nGROUP VIBE BOARD RESULTS (from trip members voting):\n${lines}\nUse these preferences to guide your choices.`;
        }
      } catch (e) {
        console.error("Failed to fetch vibe data:", e);
      }
    }

    // ---- Build AI prompt ----
    const paceGuide: Record<Pace, string> = {
      packed: "4-5 activities per day. The group wants to see and do everything.",
      balanced: "3-4 activities per day. Mix active exploration with downtime.",
      relaxed: "2-3 activities per day. Plenty of free time and slow mornings.",
    };

    const budgetGuide: Record<BudgetLevel, string> = {
      budget: "Street food, local eateries, hostels, budget guesthouses. Activities: free walking tours, public beaches, markets, temples. Transport: public transit, shared rides.",
      "mid-range": "Mid-tier restaurants, 3-star hotels, boutique stays. Activities: guided tours, cooking classes, snorkeling trips. Transport: private transfers for longer distances.",
      premium: "Fine dining, luxury resorts, 5-star hotels. Activities: private tours, spa treatments, yacht charters, exclusive experiences. Transport: private car/driver.",
    };

    const dietaryNote =
      dietary.length > 0 && !dietary.every((d) => d === "none" || d === "No restrictions")
        ? `\n\nDIETARY REQUIREMENTS: ${dietary.filter((d) => d !== "none" && d !== "No restrictions").join(", ")}. For EVERY restaurant/food activity, include a dietary_notes field explaining how this venue accommodates these requirements.`
        : "";

    const notesSection = [];
    if (notes) notesSection.push(`SPECIAL NOTES: "${notes}"`);
    if (free_text) notesSection.push(`FREE-TEXT DESCRIPTION FROM USER: "${free_text}"`);
    const accessibilityNote = notesSection.length > 0 ? `\n\n${notesSection.join("\n\n")}. Factor these into every recommendation.` : "";

    const systemPrompt = `You are an expert travel planner for Junto, a group trip planning app. You create detailed, realistic, map-ready itineraries using REAL venues and places that actually exist.

CRITICAL RULES:
1. Use REAL, SPECIFIC venue names that actually exist in ${destination.trim()}. Never use generic descriptions.
2. Include realistic latitude/longitude coordinates for each venue.
3. Schedule realistically: include travel time between locations, proper meal times.
4. Each day should flow naturally: morning activity -> lunch -> afternoon -> dinner -> optional evening.
5. Balance different group interests across the trip.
6. The google_maps_url must be a valid Google Maps search URL: https://www.google.com/maps/search/?api=1&query=<URL-encoded query>

PACE: ${paceGuide[safePace]}

BUDGET LEVEL (${safeBudget}): ${budgetGuide[safeBudget]}

GROUP SIZE: ${clampedGroupSize} people.

INTERESTS: ${allInterests.length > 0 ? allInterests.join(", ") : "general sightseeing"}.${dietaryNote}${accessibilityNote}${vibeContext}

OUTPUT FORMAT: Return ONLY valid JSON matching the exact schema below. No markdown, no code fences — just the raw JSON object.

{
  "trip_title": "Catchy trip title (e.g. '7-Day Bali Beach & Culture Adventure')",
  "trip_summary": "2-3 sentence overview of the trip plan",
  "destinations": [
    {
      "name": "Destination Name",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "intro": "2-3 vivid sentences about this destination",
      "days": [
        {
          "date": "YYYY-MM-DD",
          "day_number": 1,
          "theme": "Creative theme for the day",
          "activities": [
            {
              "title": "Specific Real Venue Name",
              "description": "2-3 vivid sentences",
              "category": "food|culture|nature|nightlife|adventure|relaxation|transport|accommodation",
              "start_time": "HH:MM",
              "duration_minutes": 60,
              "estimated_cost_per_person": 15,
              "currency": "USD",
              "location_name": "Exact venue name",
              "latitude": -8.65,
              "longitude": 115.16,
              "google_maps_url": "https://www.google.com/maps/search/?api=1&query=...",
              "booking_url": null,
              "photo_query": "search query for photo",
              "tips": "One practical insider tip",
              "dietary_notes": null,
              "travel_time_from_previous": "15 min walk",
              "travel_mode_from_previous": "walk"
            }
          ]
        }
      ],
      "accommodation": {
        "name": "Hotel Name",
        "stars": 4,
        "price_per_night": 120,
        "currency": "USD",
        "booking_url": "https://www.booking.com/search.html?ss=..."
      },
      "transport_to_next": null
    }
  ],
  "map_center": { "lat": -8.65, "lng": 115.16 },
  "map_zoom": 12,
  "daily_budget_estimate": 85,
  "currency": "USD",
  "packing_suggestions": ["item1", "item2"],
  "total_activities": 24
}

For multi-city trips, include transport_to_next between destinations:
"transport_to_next": { "mode": "flight", "duration": "1h 30m", "from": "City A", "to": "City B" }`;

    const userPrompt = `Plan a ${numDays}-day group trip to ${destination.trim()} for ${clampedGroupSize} people.

Dates: ${startDate} to ${endDate}${flexible ? " (flexible — dates are approximate)" : ""}
Budget: ${safeBudget}
Pace: ${safePace}
Interests: ${allInterests.length > 0 ? allInterests.join(", ") : "general"}
Dietary: ${dietary.length > 0 ? dietary.join(", ") : "none"}
${notes ? `Notes: ${notes}` : ""}
${free_text ? `User description: ${free_text}` : ""}

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
        max_tokens: 8000,
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

    // ---- DIAGNOSTIC LOGGING (temporary) ----
    const stopReason = anthropicData.stop_reason ?? "unknown";
    console.log("[DIAG] AI response stop_reason:", stopReason);
    console.log("[DIAG] AI response token usage — input:", inputTokens, "output:", outputTokens);
    console.log("[DIAG] AI response text length:", textContent.length, "chars");
    console.log("[DIAG] AI response first 500 chars:", textContent.slice(0, 500));
    console.log("[DIAG] AI response last 200 chars:", textContent.slice(-200));
    if (stopReason === "max_tokens") {
      console.warn("[DIAG] WARNING: Response was truncated — hit max_tokens limit. JSON is likely incomplete.");
    }
    const startsWithBrace = textContent.trimStart().startsWith("{");
    const startsWithCodeFence = textContent.trimStart().startsWith("```");
    console.log("[DIAG] Starts with '{':", startsWithBrace, "| Starts with code fence:", startsWithCodeFence);
    // ---- END DIAGNOSTIC LOGGING ----

    // ---- Parse JSON response ----
    let itinerary: Record<string, unknown>;
    try {
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const raw = jsonMatch ? jsonMatch[1].trim() : textContent.trim();
      console.log("[DIAG] jsonMatch found code block:", !!jsonMatch);
      console.log("[DIAG] raw JSON to parse — first 300 chars:", raw.slice(0, 300));
      console.log("[DIAG] raw JSON to parse — last 200 chars:", raw.slice(-200));
      itinerary = JSON.parse(raw);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", textContent.slice(0, 500));
      console.error("[DIAG] Parse error details:", (parseErr as Error).message);
      console.error("[DIAG] stop_reason was:", stopReason);
      console.error("[DIAG] output_tokens:", outputTokens, "/ max_tokens: 8000");
      return jsonResponse(
        { success: false, error: "Failed to parse AI-generated itinerary" },
        500,
      );
    }

    // ---- Log request ----
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
      console.log("ai_request_log insert skipped");
    }

    // ---- Cache the response ----
    try {
      await svcClient.from("ai_response_cache").insert({
        cache_key: cacheKey,
        response_json: itinerary,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
    } catch {
      console.log("ai_response_cache insert skipped");
    }

    // ---- Track usage ----
    await svcClient.from("analytics_events").insert({
      event_name: "ai_trip_builder",
      user_id: user.id,
      properties: {
        source: "generated",
        destination: destination.trim(),
        days: numDays,
        group_size: clampedGroupSize,
        budget_level: safeBudget,
        pace: safePace,
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

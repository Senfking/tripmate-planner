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
  user_description?: string | null;
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

/** Generate fake start/end dates for flexible trips */
function generateFlexDates(durationDays: number): { start: string; end: string } {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays - 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(start), end: fmt(end) };
}

// ---------------------------------------------------------------------------
// Lovable AI Gateway call
// ---------------------------------------------------------------------------

interface AIResult {
  itinerary: Record<string, unknown> | null;
  inputTokens: number;
  outputTokens: number;
}

async function callLovableAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  toolSchema: Record<string, unknown>,
): Promise<AIResult> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: toolSchema,
        },
      ],
      tool_choice: { type: "function", function: { name: toolSchema.name } },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("AI Gateway error:", res.status, errText);
    if (res.status === 429) {
      throw new Error("AI rate limit exceeded. Please try again in a moment.");
    }
    if (res.status === 402) {
      throw new Error("AI credits exhausted. Please add funds.");
    }
    throw new Error(`AI gateway error ${res.status}`);
  }

  const data = await res.json();
  const usage = data.usage || {};
  const choice = data.choices?.[0];

  // Extract from tool call
  const toolCall = choice?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      return {
        itinerary: parsed,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      };
    } catch (e) {
      console.error("Failed to parse tool call arguments:", (e as Error).message);
    }
  }

  // Fallback: try content as JSON
  const content = choice?.message?.content;
  if (content) {
    try {
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1));
        return {
          itinerary: parsed,
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        };
      }
    } catch {
      console.error("Fallback content parse failed");
    }
  }

  return { itinerary: null, inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0 };
}

// ---------------------------------------------------------------------------
// Post-processing / normalization
// ---------------------------------------------------------------------------

const MAX_ACTIVITY_DURATION = 480;

const DURATION_DEFAULTS_BY_CATEGORY: Record<string, number> = {
  accommodation: 60,
  food: 90,
  culture: 120,
  nightlife: 180,
  relaxation: 180,
  transport: 30,
};

function defaultDurationForCategory(category: unknown): number {
  if (typeof category === "string" && category in DURATION_DEFAULTS_BY_CATEGORY) {
    return DURATION_DEFAULTS_BY_CATEGORY[category];
  }
  return 120;
}

function normalizeActivity(activity: Record<string, unknown>): Record<string, unknown> {
  const rawDuration = activity.duration_minutes;
  const duration = typeof rawDuration === "number" && Number.isFinite(rawDuration) ? rawDuration : NaN;
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_ACTIVITY_DURATION) {
    activity.duration_minutes = defaultDurationForCategory(activity.category);
  }

  const rawCost = activity.estimated_cost_per_person;
  if (typeof rawCost !== "number" || !Number.isFinite(rawCost)) {
    activity.estimated_cost_per_person = 0;
  }

  return activity;
}

function normalizeAIResponse(itinerary: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!itinerary) return itinerary;

  const destinations = (itinerary as any).destinations;
  if (Array.isArray(destinations)) {
    for (const dest of destinations) {
      const days = dest?.days;
      if (!Array.isArray(days)) continue;
      for (const day of days) {
        const activities = day?.activities;
        if (!Array.isArray(activities)) continue;
        for (const activity of activities) {
          if (activity && typeof activity === "object") {
            normalizeActivity(activity as Record<string, unknown>);
          }
        }
      }
    }
  }

  const alternatives = (itinerary as any).alternatives;
  if (Array.isArray(alternatives)) {
    for (const activity of alternatives) {
      if (activity && typeof activity === "object") {
        normalizeActivity(activity as Record<string, unknown>);
      }
    }
  }

  return itinerary;
}

// ---------------------------------------------------------------------------
// Tool schema for structured output
// ---------------------------------------------------------------------------

function buildToolSchema(hasDietary: boolean) {
  const activityProps: Record<string, unknown> = {
    title: { type: "string", description: "Specific real venue name" },
    description: { type: "string", description: "1-2 sentence description" },
    category: { type: "string", enum: ["food", "culture", "nature", "nightlife", "adventure", "relaxation", "transport", "accommodation"] },
    start_time: { type: "string", description: "HH:MM format" },
    duration_minutes: { type: "number" },
    estimated_cost_per_person: { type: "number" },
    currency: { type: "string" },
    location_name: { type: "string" },
    latitude: { type: "number" },
    longitude: { type: "number" },
    google_maps_url: { type: "string" },
    booking_url: { type: ["string", "null"] },
    photo_query: { type: "string" },
    tips: { type: "string" },
    travel_time_from_previous: { type: "string" },
    travel_mode_from_previous: { type: "string" },
  };

  if (hasDietary) {
    activityProps.dietary_notes = { type: "string", description: "How this venue handles dietary needs" };
  }

  return {
    name: "generate_itinerary",
    description: "Generate a complete trip itinerary as structured data",
    parameters: {
      type: "object",
      properties: {
        trip_title: { type: "string" },
        trip_summary: { type: "string" },
        destinations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              start_date: { type: "string" },
              end_date: { type: "string" },
              intro: { type: "string" },
              days: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string" },
                    day_number: { type: "number" },
                    theme: { type: "string" },
                    activities: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: activityProps,
                        required: ["title", "category", "start_time", "duration_minutes", "latitude", "longitude"],
                      },
                    },
                  },
                  required: ["date", "day_number", "theme", "activities"],
                },
              },
              accommodation: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  stars: { type: "number" },
                  price_per_night: { type: "number" },
                  currency: { type: "string" },
                  booking_url: { type: "string" },
                },
              },
              transport_to_next: {
                type: ["object", "null"],
                properties: {
                  mode: { type: "string" },
                  duration: { type: "string" },
                  from: { type: "string" },
                  to: { type: "string" },
                },
              },
            },
            required: ["name", "start_date", "end_date", "days"],
          },
        },
        map_center: {
          type: "object",
          properties: {
            lat: { type: "number" },
            lng: { type: "number" },
          },
          required: ["lat", "lng"],
        },
        map_zoom: { type: "number" },
        daily_budget_estimate: { type: "number" },
        currency: { type: "string" },
        packing_suggestions: { type: "array", items: { type: "string" } },
        total_activities: { type: "number" },
      },
      required: ["trip_title", "trip_summary", "destinations", "map_center", "daily_budget_estimate", "currency"],
    },
  };
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

    if (body.alternatives_mode) {
      const altNotes = body.notes || "";
      const userDescription = body.user_description?.trim() || "";
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableApiKey) {
        return jsonResponse({ success: false, error: "LOVABLE_API_KEY not configured" }, 500);
      }

      const altToolSchema = {
        name: "suggest_alternatives",
        description: "Return 3 alternative activities",
        parameters: {
          type: "object",
          properties: {
            alternatives: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  category: { type: "string" },
                  start_time: { type: "string" },
                  duration_minutes: { type: "number" },
                  estimated_cost_per_person: { type: "number" },
                  currency: { type: "string" },
                  location_name: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  google_maps_url: { type: "string" },
                  booking_url: { type: ["string", "null"] },
                  photo_query: { type: "string" },
                  tips: { type: "string" },
                },
                required: ["title", "category", "start_time", "duration_minutes", "latitude", "longitude"],
              },
            },
          },
          required: ["alternatives"],
        },
      };

      const altSystemPrompt = userDescription
        ? "You are an expert travel planner. Suggest 3 real alternative activities that match the user's description. Use REAL venue names that actually exist. Include realistic coordinates."
        : "You are an expert travel planner. Suggest 3 real alternative activities. Use REAL venue names that actually exist. Include realistic coordinates.";

      const altUserPrompt = userDescription
        ? `${altNotes}\n\nThe user wants alternatives matching this description: '${userDescription}'. Suggest 3 alternative activities that match the user's description while fitting the day's schedule.`
        : altNotes;

      try {
        const altResult = await callLovableAI(
          lovableApiKey,
          altSystemPrompt,
          altUserPrompt,
          altToolSchema,
        );
        const normalizedAlt = normalizeAIResponse(altResult.itinerary);
        const alts = (normalizedAlt as any)?.alternatives || [];
        return jsonResponse({ success: true, alternatives: alts });
      } catch (e) {
        console.error("Alternatives generation failed:", e);
        return jsonResponse({ success: true, alternatives: [] });
      }
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

    const destination = surprise_me ? "a surprise destination (you choose an amazing, underrated destination)" : (rawDest || "").trim();
    if (!destination) {
      return jsonResponse({ success: false, error: "destination is required (or set surprise_me=true)" }, 400);
    }

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
    const allInterests = [...new Set([...vibes, ...rawInterests])].filter(Boolean);

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return jsonResponse({ success: false, error: "LOVABLE_API_KEY not configured" }, 500);
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

    const hasDietaryReqs =
      dietary.length > 0 && !dietary.every((d) => d === "none" || d === "No restrictions");
    const activeDietary = dietary.filter((d) => d !== "none" && d !== "No restrictions");
    const dietaryNote = hasDietaryReqs
      ? `\n\nDIETARY REQUIREMENTS: ${activeDietary.join(", ")}. For EVERY restaurant/food activity, include a dietary_notes field explaining how this venue accommodates these requirements.`
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
6. The google_maps_url must be a valid Google Maps search URL.
7. Keep descriptions to 1-2 sentences max. Keep tips to one short sentence. Be concise.

DURATION GUIDANCE: duration_minutes should be the time spent AT the activity, not the total stay. Hotel check-in: 30-60 min. Restaurant meal: 60-120 min. Museum visit: 90-180 min. Bar/club: 120-180 min. Walking tour: 120-240 min. Beach/pool: 120-240 min. Never exceed 480 minutes for a single activity.

PACE: ${paceGuide[safePace]}

BUDGET LEVEL (${safeBudget}): ${budgetGuide[safeBudget]}

GROUP SIZE: ${clampedGroupSize} people.

INTERESTS: ${allInterests.length > 0 ? allInterests.join(", ") : "general sightseeing"}.${dietaryNote}${accessibilityNote}${vibeContext}`;

    const userPrompt = `Plan a ${numDays}-day group trip to ${destination.trim()} for ${clampedGroupSize} people.

Dates: ${startDate} to ${endDate}${flexible ? " (flexible — dates are approximate)" : ""}
Budget: ${safeBudget}
Pace: ${safePace}
Interests: ${allInterests.length > 0 ? allInterests.join(", ") : "general"}
Dietary: ${dietary.length > 0 ? dietary.join(", ") : "none"}
${notes ? `Notes: ${notes}` : ""}
${free_text ? `User description: ${free_text}` : ""}

Generate the complete itinerary.`;

    // ---- Call Lovable AI Gateway ----
    const toolSchema = buildToolSchema(hasDietaryReqs);
    
    let aiResult: AIResult;
    try {
      aiResult = await callLovableAI(lovableApiKey, systemPrompt, userPrompt, toolSchema);
    } catch (apiErr) {
      console.error("AI Gateway error:", (apiErr as Error).message);
      return jsonResponse({ success: false, error: (apiErr as Error).message }, 500);
    }

    if (!aiResult.itinerary) {
      return jsonResponse({ success: false, error: "Failed to parse AI-generated itinerary" }, 500);
    }

    const itinerary = normalizeAIResponse(aiResult.itinerary)!;
    const inputTokens = aiResult.inputTokens;
    const outputTokens = aiResult.outputTokens;

    // ---- Log request ----
    try {
      await svcClient.from("ai_request_log").insert({
        user_id: user.id,
        feature: "trip_builder",
        model: "google/gemini-2.5-flash",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: 0, // Lovable AI pricing handled externally
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

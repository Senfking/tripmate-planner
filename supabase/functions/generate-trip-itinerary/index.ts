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

interface AnthropicResult {
  textContent: string;
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}

// ---------------------------------------------------------------------------
// JSON extraction & salvage helpers
// ---------------------------------------------------------------------------

/** Try to extract valid JSON from an AI response that may contain preamble,
 *  code fences, or trailing text. */
function extractJsonString(text: string): string {
  // 1. Try ```json ... ``` code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    console.log("[DIAG] extractJsonString: found code fence block");
    return fenceMatch[1].trim();
  }

  // 2. Find the first "{" and last "}" — handles preamble and trailing text
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = text.slice(firstBrace, lastBrace + 1);
    if (firstBrace > 0) {
      console.log("[DIAG] extractJsonString: stripped preamble —", JSON.stringify(text.slice(0, firstBrace).trim().slice(0, 100)));
    }
    return extracted;
  }

  // 3. Last resort: return trimmed text as-is
  console.log("[DIAG] extractJsonString: no braces found, returning raw text");
  return text.trim();
}

/** Attempt to salvage truncated JSON by closing open structures.
 *  Looks for the last complete day object and closes the JSON. */
function salvageTruncatedJson(text: string): Record<string, unknown> | null {
  const raw = extractJsonString(text);
  console.log("[DIAG] Attempting to salvage truncated JSON, length:", raw.length);

  // Strategy: find the last occurrence of a pattern that indicates a complete
  // activity block, then close all open structures.
  // Look for the last complete activity: ends with }
  // within a complete day: "activities": [...]
  // We search backwards for the last `}]` that closes an activities array,
  // then close the remaining open structures.

  // Find the last "}]" which likely closes an activities array
  const lastActivitiesClose = raw.lastIndexOf("}]");
  if (lastActivitiesClose === -1) return null;

  // Take everything up to and including that "}]"
  let salvaged = raw.slice(0, lastActivitiesClose + 2);

  // Count open structures (skip characters inside JSON strings)
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;
  for (const ch of salvaged) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") openBraces++;
    else if (ch === "}") openBraces--;
    else if (ch === "[") openBrackets++;
    else if (ch === "]") openBrackets--;
  }

  // Close the remaining structures: each open day/destination/root object
  // Typical nesting after activities: }] closes activities, then we need:
  //   } close day, ] close days array, } close destination, ] close destinations,
  //   then close root with remaining fields
  // We'll add minimal closers and dummy required fields for a valid root.
  // Close any remaining open arrays/objects
  while (openBrackets > 0) { salvaged += "]"; openBrackets--; }
  while (openBraces > 0) { salvaged += "}"; openBraces--; }

  try {
    const parsed = JSON.parse(salvaged);
    console.log("[DIAG] Salvage succeeded — parsed truncated JSON");
    parsed._truncated = true;
    return parsed;
  } catch (e) {
    console.error("[DIAG] Salvage failed:", (e as Error).message);
    return null;
  }
}

/** Parse an AI response into a JSON object, handling preamble, code fences,
 *  and truncation from max_tokens. Returns null if all extraction fails. */
function parseAiResponse(result: AnthropicResult): Record<string, unknown> | null {
  const { textContent, stopReason } = result;

  // 1. Try robust JSON extraction + parse
  const raw = extractJsonString(textContent);
  console.log("[DIAG] parseAiResponse — raw first 300 chars:", raw.slice(0, 300));
  console.log("[DIAG] parseAiResponse — raw last 200 chars:", raw.slice(-200));

  try {
    return JSON.parse(raw);
  } catch (parseErr) {
    console.error("[DIAG] JSON.parse failed:", (parseErr as Error).message);
  }

  // 2. If truncated, try to salvage
  if (stopReason === "max_tokens") {
    console.warn("[DIAG] Response truncated (max_tokens). Attempting salvage...");
    const salvaged = salvageTruncatedJson(textContent);
    if (salvaged) return salvaged;
  }

  console.error("[DIAG] All parsing strategies failed. stop_reason:", stopReason,
    "output_tokens:", result.outputTokens);
  return null;
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
// Anthropic API call helper
// ---------------------------------------------------------------------------

async function callAnthropicApi(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<AnthropicResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return {
    textContent: data.content?.find((c: { type: string }) => c.type === "text")?.text || "",
    stopReason: data.stop_reason ?? "unknown",
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

/** Merge two partial itineraries (from split API calls) into one. */
function mergeItineraries(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...first };

  // Merge destination days
  const firstDests = (first.destinations || []) as Array<Record<string, unknown>>;
  const secondDests = (second.destinations || []) as Array<Record<string, unknown>>;

  if (firstDests.length > 0 && secondDests.length > 0) {
    const lastFirst = firstDests[firstDests.length - 1];
    const firstSecond = secondDests[0];

    // If they're the same destination, merge days
    if (lastFirst.name === firstSecond.name) {
      const mergedDays = [
        ...((lastFirst.days || []) as unknown[]),
        ...((firstSecond.days || []) as unknown[]),
      ];
      lastFirst.days = mergedDays;
      lastFirst.end_date = firstSecond.end_date;
      // Append any remaining destinations from the second half
      merged.destinations = [...firstDests, ...secondDests.slice(1)];
    } else {
      merged.destinations = [...firstDests, ...secondDests];
    }
  }

  // Sum totals
  const firstTotal = (first.total_activities as number) || 0;
  const secondTotal = (second.total_activities as number) || 0;
  merged.total_activities = firstTotal + secondTotal;

  // Merge packing suggestions
  const firstPacking = (first.packing_suggestions || []) as string[];
  const secondPacking = (second.packing_suggestions || []) as string[];
  merged.packing_suggestions = [...new Set([...firstPacking, ...secondPacking])];

  // Use the second half's title/summary only if first didn't have one
  if (!merged.trip_title && second.trip_title) merged.trip_title = second.trip_title;
  if (!merged.trip_summary && second.trip_summary) merged.trip_summary = second.trip_summary;

  return merged;
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

    // Conditionally include dietary_notes in schema only when user has dietary reqs
    const activitySchema = hasDietaryReqs
      ? `{
              "title": "Specific Real Venue Name",
              "description": "1-2 sentence description",
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
              "tips": "One short tip",
              "dietary_notes": "How this venue handles dietary needs",
              "travel_time_from_previous": "15 min walk",
              "travel_mode_from_previous": "walk"
            }`
      : `{
              "title": "Specific Real Venue Name",
              "description": "1-2 sentence description",
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
              "tips": "One short tip",
              "travel_time_from_previous": "15 min walk",
              "travel_mode_from_previous": "walk"
            }`;

    const systemPrompt = `You are an expert travel planner for Junto, a group trip planning app. You create detailed, realistic, map-ready itineraries using REAL venues and places that actually exist.

CRITICAL RULES:
1. Use REAL, SPECIFIC venue names that actually exist in ${destination.trim()}. Never use generic descriptions.
2. Include realistic latitude/longitude coordinates for each venue.
3. Schedule realistically: include travel time between locations, proper meal times.
4. Each day should flow naturally: morning activity -> lunch -> afternoon -> dinner -> optional evening.
5. Balance different group interests across the trip.
6. The google_maps_url must be a valid Google Maps search URL: https://www.google.com/maps/search/?api=1&query=<URL-encoded query>
7. Keep descriptions to 1-2 sentences max. Keep tips to one short sentence. Be concise.

PACE: ${paceGuide[safePace]}

BUDGET LEVEL (${safeBudget}): ${budgetGuide[safeBudget]}

GROUP SIZE: ${clampedGroupSize} people.

INTERESTS: ${allInterests.length > 0 ? allInterests.join(", ") : "general sightseeing"}.${dietaryNote}${accessibilityNote}${vibeContext}

OUTPUT FORMAT: Return ONLY valid JSON — no markdown, no code fences, no preamble text. Start your response with { and end with }.

{
  "trip_title": "Catchy trip title",
  "trip_summary": "2-3 sentence overview",
  "destinations": [
    {
      "name": "Destination Name",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "intro": "1-2 sentences about this destination",
      "days": [
        {
          "date": "YYYY-MM-DD",
          "day_number": 1,
          "theme": "Creative theme for the day",
          "activities": [
            ${activitySchema}
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

    // ---- Call Anthropic API (with split for long trips) ----
    let itinerary: Record<string, unknown>;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const shouldSplit = numDays > 10;

    if (shouldSplit) {
      // Split into two halves to stay within token limits
      const midDay = Math.ceil(numDays / 2);
      const midDate = new Date(startDate);
      midDate.setDate(midDate.getDate() + midDay);
      const midDateStr = midDate.toISOString().split("T")[0];
      const midDateMinus1 = new Date(midDate);
      midDateMinus1.setDate(midDateMinus1.getDate() - 1);
      const midDateMinus1Str = midDateMinus1.toISOString().split("T")[0];

      console.log(`[DIAG] Splitting ${numDays}-day trip: days 1-${midDay} and days ${midDay + 1}-${numDays}`);

      const firstHalfPrompt = `Plan days 1–${midDay} of a ${numDays}-day group trip to ${destination.trim()} for ${clampedGroupSize} people.

Dates for THIS PART: ${startDate} to ${midDateMinus1Str}${flexible ? " (flexible)" : ""}
Budget: ${safeBudget}
Pace: ${safePace}
Interests: ${allInterests.length > 0 ? allInterests.join(", ") : "general"}
Dietary: ${dietary.length > 0 ? dietary.join(", ") : "none"}
${notes ? `Notes: ${notes}` : ""}

Generate the itinerary JSON for these days only. Use day_number starting from 1.`;

      const secondHalfPrompt = `Plan days ${midDay + 1}–${numDays} of a ${numDays}-day group trip to ${destination.trim()} for ${clampedGroupSize} people.

Dates for THIS PART: ${midDateStr} to ${endDate}${flexible ? " (flexible)" : ""}
Budget: ${safeBudget}
Pace: ${safePace}
Interests: ${allInterests.length > 0 ? allInterests.join(", ") : "general"}
Dietary: ${dietary.length > 0 ? dietary.join(", ") : "none"}
${notes ? `Notes: ${notes}` : ""}

Generate the itinerary JSON for these days only. Use day_number starting from ${midDay + 1}. Include trip_title and trip_summary as if for the full trip.`;

      // Run both API calls in parallel
      const [firstResult, secondResult] = await Promise.all([
        callAnthropicApi(anthropicKey, systemPrompt, firstHalfPrompt, 12000),
        callAnthropicApi(anthropicKey, systemPrompt, secondHalfPrompt, 12000),
      ]);

      totalInputTokens = firstResult.inputTokens + secondResult.inputTokens;
      totalOutputTokens = firstResult.outputTokens + secondResult.outputTokens;

      console.log("[DIAG] Split call 1 — stop_reason:", firstResult.stopReason,
        "tokens:", firstResult.outputTokens, "len:", firstResult.textContent.length);
      console.log("[DIAG] Split call 2 — stop_reason:", secondResult.stopReason,
        "tokens:", secondResult.outputTokens, "len:", secondResult.textContent.length);

      const firstItinerary = parseAiResponse(firstResult);
      const secondItinerary = parseAiResponse(secondResult);

      if (!firstItinerary || !secondItinerary) {
        return jsonResponse(
          { success: false, error: "Failed to parse AI-generated itinerary (split mode)" },
          500,
        );
      }

      itinerary = mergeItineraries(firstItinerary, secondItinerary);
    } else {
      // Single API call for trips ≤ 10 days
      let result: AnthropicResult;
      try {
        result = await callAnthropicApi(anthropicKey, systemPrompt, userPrompt, 16000);
      } catch (apiErr) {
        console.error("Anthropic API error:", (apiErr as Error).message);
        return jsonResponse(
          { success: false, error: `AI generation failed` },
          500,
        );
      }

      totalInputTokens = result.inputTokens;
      totalOutputTokens = result.outputTokens;

      // ---- DIAGNOSTIC LOGGING (temporary) ----
      console.log("[DIAG] AI response stop_reason:", result.stopReason);
      console.log("[DIAG] AI response token usage — input:", result.inputTokens, "output:", result.outputTokens);
      console.log("[DIAG] AI response text length:", result.textContent.length, "chars");
      console.log("[DIAG] AI response first 500 chars:", result.textContent.slice(0, 500));
      console.log("[DIAG] AI response last 200 chars:", result.textContent.slice(-200));
      const startsWithBrace = result.textContent.trimStart().startsWith("{");
      const startsWithCodeFence = result.textContent.trimStart().startsWith("```");
      console.log("[DIAG] Starts with '{':", startsWithBrace, "| Starts with code fence:", startsWithCodeFence);
      // ---- END DIAGNOSTIC LOGGING ----

      // Try to parse, with truncation handling
      const parsed = parseAiResponse(result);

      if (!parsed) {
        // Try salvage regardless of stop_reason — response may be truncated
        console.log("[DIAG] Parsing failed, attempting salvage. stop_reason:", result.stopReason);
        const salvagedFallback = salvageTruncatedJson(result.textContent);
        if (salvagedFallback) {
          itinerary = salvagedFallback;
        } else if (result.stopReason === "max_tokens") {
        // Retry with condensed prompt
        console.log("[DIAG] Retrying with condensed prompt after max_tokens truncation");
        const condensedUserPrompt = `Plan a ${numDays}-day group trip to ${destination.trim()} for ${clampedGroupSize} people.

Dates: ${startDate} to ${endDate}${flexible ? " (flexible)" : ""}
Budget: ${safeBudget}
Pace: ${safePace}
Interests: ${allInterests.length > 0 ? allInterests.join(", ") : "general"}
Dietary: ${dietary.length > 0 ? dietary.join(", ") : "none"}
${notes ? `Notes: ${notes}` : ""}

IMPORTANT: Generate a CONDENSED itinerary — max 3 activities per day, 1-sentence descriptions, minimal tips. Keep the JSON compact.`;

        try {
          const retryResult = await callAnthropicApi(anthropicKey, systemPrompt, condensedUserPrompt, 16000);
          totalInputTokens += retryResult.inputTokens;
          totalOutputTokens += retryResult.outputTokens;
          console.log("[DIAG] Retry — stop_reason:", retryResult.stopReason,
            "tokens:", retryResult.outputTokens);
          const retryParsed = parseAiResponse(retryResult);
          if (retryParsed) {
            itinerary = retryParsed;
          } else {
            return jsonResponse(
              { success: false, error: "Failed to parse AI-generated itinerary after retry" },
              500,
            );
          }
        } catch (retryErr) {
          console.error("Retry API call failed:", (retryErr as Error).message);
          return jsonResponse(
            { success: false, error: "AI generation failed on retry" },
            500,
          );
        }
      } else {
        return jsonResponse(
          { success: false, error: "Failed to parse AI-generated itinerary" },
          500,
        );
      }
      } else {
        itinerary = parsed;
      }
    }

    const inputTokens = totalInputTokens;
    const outputTokens = totalOutputTokens;

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

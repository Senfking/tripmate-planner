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
// Haversine distance (km) between two lat/lng points
// ---------------------------------------------------------------------------
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Check if free-text query is time-sensitive
// ---------------------------------------------------------------------------
function isTimeSensitiveQuery(query: string): boolean {
  const patterns =
    /\b(tonight|today|this week|this weekend|what'?s on|event|festival|concert|show|live music|happening now|current|opening|closing)\b/i;
  return patterns.test(query);
}

// ---------------------------------------------------------------------------
// Check if structured "when" filter is time-sensitive
// ---------------------------------------------------------------------------
function isTimeSensitiveWhen(when?: string): boolean {
  if (!when) return false;
  return /\b(now|tonight|today|tomorrow|this weekend)\b/i.test(when);
}

// ---------------------------------------------------------------------------
// Build a synthetic query string from structured filters (for caching/history)
// ---------------------------------------------------------------------------
function buildQueryFromFilters(
  category: string,
  destination: string,
  when?: string | string[],
  vibe?: string | string[],
  budget?: string | string[],
): string {
  const parts = [category];
  const vibeArr = Array.isArray(vibe) ? vibe : vibe ? [vibe] : [];
  const whenArr = Array.isArray(when) ? when : when ? [when] : [];
  const budgetArr = Array.isArray(budget) ? budget : budget ? [budget] : [];
  if (vibeArr.length) parts.push(vibeArr.join(" or "));
  if (whenArr.length) parts.push(whenArr.join(" or ").toLowerCase());
  parts.push(`in ${destination}`);
  if (budgetArr.length) parts.push(`(${budgetArr.join(" or ")})`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Resolve "when" filter to a concrete date, time-of-day, and day-of-week
// ---------------------------------------------------------------------------
function resolveWhen(
  when: string,
): { date: string; timeOfDay: string; dayOfWeek: string } {
  const now = new Date();
  let target: Date;
  let timeOfDay: string;

  switch (when.toLowerCase()) {
    case "now":
      target = now;
      timeOfDay = now.getHours() < 12
        ? "morning"
        : now.getHours() < 17
          ? "afternoon"
          : "evening";
      break;
    case "tonight":
      target = now;
      timeOfDay = "night";
      break;
    case "tomorrow": {
      target = new Date(now);
      target.setDate(target.getDate() + 1);
      timeOfDay = "any time";
      break;
    }
    case "this weekend": {
      target = new Date(now);
      const dow = target.getDay();
      if (dow !== 0 && dow !== 6) {
        target.setDate(target.getDate() + (6 - dow));
      }
      timeOfDay = "any time";
      break;
    }
    default:
      target = now;
      timeOfDay = "any time";
  }

  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return {
    date: `${yyyy}-${mm}-${dd}`,
    timeOfDay,
    dayOfWeek: days[target.getDay()],
  };
}

// ---------------------------------------------------------------------------
// Map structured category ID to a descriptive label
// ---------------------------------------------------------------------------
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  eat: "restaurants and food spots",
  drink: "bars and drinking spots",
  party: "nightlife, clubs, and party venues",
  explore: "attractions and things to see",
  relax: "relaxation and wellness spots",
  workout: "gyms and fitness activities",
  events: "events, festivals, concerts, and happenings",
  surprise: "unique and unexpected experiences",
};

// ---------------------------------------------------------------------------
// Suggestion JSON schema (shared between structured & free-text prompts)
// ---------------------------------------------------------------------------
function suggestionJsonSchema(destination: string): string {
  return `{
  "summary": "Brief one-liner response to their query",
  "suggestions": [
    {
      "name": "Venue Name",
      "category": "food|nightlife|culture|relaxation|activity|wellness|shopping|events",
      "why": "One sentence why this fits their request",
      "best_time": "7pm-11pm",
      "search_query": "Venue Name ${destination}",
      "estimated_cost_per_person": 150000,
      "currency": "IDR",
      "is_event": false,
      "event_details": null
    }
  ]
}

Rules for is_event and event_details:
- Set is_event to true ONLY for time-specific happenings (a DJ set, a festival night, a market, a concert) — NOT for permanent venues.
- When is_event is true, event_details MUST be a short string like "DJ Set by [name], 10pm-3am, IDR 200k cover" or "Night Market, 6pm-midnight, free entry".
- When is_event is false, event_details should be null.`;
}

// ---------------------------------------------------------------------------
// Build event-search instructions for time-sensitive requests
// ---------------------------------------------------------------------------
function eventSearchInstructions(
  destination: string,
  category: string | undefined,
  dateStr: string,
  whenLabel: string,
  dayOfWeek: string,
): string {
  const catLabel = category
    ? CATEGORY_DESCRIPTIONS[category] || category
    : "things to do";
  return `

CRITICAL — EVENT SEARCH REQUIRED:
When the query involves a specific time, you MUST search the web for current events, parties, and happenings. Prioritize time-sensitive results (specific events happening on that date) over generic venue recommendations. Include event names, performers, times, and cover charges.

Search for these specifically:
- "${destination} events ${dateStr}"
- "${destination} ${catLabel} ${whenLabel}"
- "${destination} live music/DJ/party ${dayOfWeek}"

At least 1-2 of your suggestions MUST be specific events happening on that date/time rather than permanent venues. Mark those with is_event: true and fill in event_details.`;
}

// ---------------------------------------------------------------------------
// Google Places lookup — replicates get-place-details inline
// ---------------------------------------------------------------------------
async function lookupPlace(
  searchQuery: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const empty = {
    photo_url: null,
    rating: null,
    totalRatings: null,
    googleMapsUrl: null,
    address: null,
    lat: null,
    lng: null,
    priceLevel: null,
  };

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.rating,places.userRatingCount,places.photos,places.googleMapsUri,places.formattedAddress,places.location,places.priceLevel",
        },
        body: JSON.stringify({ textQuery: searchQuery }),
      },
    );

    if (!res.ok) return empty;

    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return empty;

    let photo_url: string | null = null;
    if (
      Array.isArray(place.photos) &&
      place.photos.length > 0 &&
      place.photos[0].name
    ) {
      photo_url = `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxWidthPx=800&key=${apiKey}`;
    }

    return {
      photo_url,
      rating: place.rating ?? null,
      totalRatings: place.userRatingCount ?? null,
      googleMapsUrl: place.googleMapsUri ?? null,
      address: place.formattedAddress ?? null,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      priceLevel: place.priceLevel ?? null,
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // ---- Parse body ----
    const body = await req.json();
    const { trip_id, context } = body as {
      trip_id: string;
      context: {
        destination: string;
        date?: string;
        time_of_day?: string;
        group_size?: number;
        budget_level?: string;
        preferences?: string[];
        hotel_location?: { name: string; lat: number; lng: number };
      };
    };

    // Determine request type: structured filters vs free text
    const isStructured = !!body.category && !body.query;
    const structCategory: string | undefined = body.category;
    const structWhen: string | string[] | undefined = body.when;
    const structVibe: string | string[] | undefined = body.vibe;
    const structBudget: string | string[] | undefined = body.budget;
    // Normalize to arrays for multi-select support
    const whenArr = Array.isArray(structWhen) ? structWhen : structWhen ? [structWhen] : [];
    const vibeArr = Array.isArray(structVibe) ? structVibe : structVibe ? [structVibe] : [];
    const budgetArr = Array.isArray(structBudget) ? structBudget : structBudget ? [structBudget] : [];

    // Build query string (real query for free-text, synthetic for structured)
    const query: string = isStructured
      ? buildQueryFromFilters(
          structCategory!,
          context?.destination || "",
          structWhen,
          structVibe,
          structBudget,
        )
      : body.query;

    if (!trip_id || (!body.query && !isStructured) || !context?.destination) {
      return jsonResponse(
        {
          error:
            "trip_id, query (or category), and context.destination are required",
        },
        400,
      );
    }

    // ---- Trip membership check ----
    const { data: isMember } = await supabase.rpc("is_trip_member", {
      _trip_id: trip_id,
      _user_id: user.id,
    });
    if (!isMember) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // ---- Check cache for non-time-sensitive queries ----
    const timeSensitive =
      isTimeSensitiveQuery(query) ||
      whenArr.some(w => isTimeSensitiveWhen(w)) ||
      structCategory === "events";

    if (!timeSensitive) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from("concierge_messages")
        .select("content, suggestions")
        .eq("trip_id", trip_id)
        .eq("role", "assistant")
        .gte("created_at", oneHourAgo)
        .order("created_at", { ascending: false })
        .limit(20);

      if (cached && cached.length > 0) {
        const normalise = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normQuery = normalise(query);
        const normDest = normalise(context.destination);

        const hit = cached.find((row) => {
          const sugStr = JSON.stringify(row.suggestions ?? "").toLowerCase();
          return (
            sugStr.includes(normDest) &&
            sugStr.includes(normQuery.slice(0, 10))
          );
        });

        if (hit) {
          await supabase.from("concierge_messages").insert({
            trip_id,
            user_id: user.id,
            role: "user",
            content: query,
          });

          return jsonResponse({
            summary: hit.content,
            suggestions: hit.suggestions ?? [],
            cached: true,
          });
        }
      }
    }

    // ---- Save user message ----
    const { error: insertUserErr } = await supabase
      .from("concierge_messages")
      .insert({
        trip_id,
        user_id: user.id,
        role: "user",
        content: query,
      });
    if (insertUserErr) {
      console.error("[concierge-suggest] insert user msg:", insertUserErr);
    }

    // ---- API keys ----
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);
    }
    const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY");

    // ---- Build system prompt ----
    const groupSize = context.group_size ?? 2;
    const budgetLevel = structBudget || context.budget_level || "mid-range";
    const vibes =
      context.preferences && context.preferences.length > 0
        ? context.preferences.join(", ")
        : "open to anything";

    const hotelNote = context.hotel_location
      ? `They are staying at ${context.hotel_location.name}.`
      : "";

    // Resolve dates for event search
    let dateStr: string;
    let timeOfDay: string;
    let dayOfWeek: string;
    let whenLabel: string;

    if (isStructured && structWhen) {
      const resolved = resolveWhen(structWhen);
      dateStr = resolved.date;
      timeOfDay = resolved.timeOfDay;
      dayOfWeek = resolved.dayOfWeek;
      whenLabel = structWhen.toLowerCase();
    } else {
      dateStr = context.date ?? new Date().toISOString().split("T")[0];
      timeOfDay = context.time_of_day ?? "any time";
      const d = new Date(dateStr + "T12:00:00");
      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      dayOfWeek = dayNames[d.getDay()] || "Saturday";
      whenLabel = timeOfDay;
    }

    let systemPrompt: string;

    if (isStructured) {
      // -- Structured request: skip interpretation, use filters directly --
      const categoryDesc =
        CATEGORY_DESCRIPTIONS[structCategory!] || structCategory;
      const vibeNote = structVibe ? `- Preferred vibe: ${structVibe}` : "";

      systemPrompt = `You are Junto's concierge for a group of ${groupSize} traveling in ${context.destination}.

Find the best ${categoryDesc} using these exact filters:
- Timing: ${structWhen || "any time"} (${dateStr}, ${dayOfWeek})
- Budget: ${budgetLevel}
${vibeNote}
- Group vibes: ${vibes}
${hotelNote}

Suggest 3-5 specific, real venues or activities. Consider:
- Time appropriateness for ${timeOfDay} (don't suggest nightclubs for morning, don't suggest breakfast spots for evening)
- Their budget and vibe preferences
- Mix popular spots with hidden gems
- Only suggest real, existing places (not generic descriptions)

Respond in this exact JSON format:
${suggestionJsonSchema(context.destination)}

Return ONLY valid JSON, no other text.`;
    } else {
      // -- Free-text request: AI interprets intent --
      systemPrompt = `You are Junto's concierge for a group of ${groupSize} traveling in ${context.destination}. Budget level: ${budgetLevel}. Vibes: ${vibes}.

The user is asking about activities for ${dateStr} (${timeOfDay}).
${hotelNote}

Suggest 3-5 specific, real venues or activities that match their query. Consider:
- Time of day (don't suggest nightclubs for morning, don't suggest breakfast spots for evening)
- Their budget and vibe preferences
- Mix popular spots with hidden gems
- Only suggest real, existing places (not generic descriptions)

Respond in this exact JSON format:
${suggestionJsonSchema(context.destination)}

Return ONLY valid JSON, no other text.`;
    }

    // -- Add aggressive event search instructions for time-sensitive requests --
    if (timeSensitive) {
      systemPrompt += eventSearchInstructions(
        context.destination,
        structCategory,
        dateStr,
        whenLabel,
        dayOfWeek,
      );
    }

    // ---- Call Lovable AI Gateway ----
    const userMessage = isStructured
      ? `Find me ${CATEGORY_DESCRIPTIONS[structCategory!] || structCategory}${structWhen ? ` for ${structWhen.toLowerCase()}` : ""}${structVibe ? `, ${structVibe.toLowerCase()} vibe` : ""} in ${context.destination}`
      : query;

    const aiBody: Record<string, unknown> = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 2048,
    };

    if (timeSensitive) {
      aiBody.tools = [{ google_search: {} }];
    }

    const callAiGateway = (body: Record<string, unknown>) =>
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
        },
        body: JSON.stringify(body),
      });

    let aiRes = await callAiGateway(aiBody);

    if (!aiRes.ok && timeSensitive && "tools" in aiBody) {
      const fallbackBody = { ...aiBody };
      delete fallbackBody.tools;
      aiRes = await callAiGateway(fallbackBody);
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error(
        "[concierge-suggest] AI Gateway error:",
        aiRes.status,
        errText,
      );
      if (aiRes.status === 429) {
        return jsonResponse(
          { error: "Rate limit exceeded, please try again shortly." },
          429,
        );
      }
      if (aiRes.status === 402) {
        return jsonResponse(
          { error: "AI credits exhausted. Please add funds in Settings." },
          402,
        );
      }
      throw new Error(`AI Gateway error ${aiRes.status}: ${errText}`);
    }

    const aiData = await aiRes.json();
    const textContent = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [
      null,
      textContent,
    ];
    let parsed: { summary: string; suggestions: Record<string, unknown>[] };
    try {
      parsed = JSON.parse(jsonMatch[1].trim());
    } catch {
      // Try to find raw JSON object
      const rawJson = textContent.match(/\{[\s\S]*\}/);
      if (rawJson) {
        parsed = JSON.parse(rawJson[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      throw new Error("AI response missing suggestions array");
    }

    // ---- Enrich suggestions with Google Places data ----
    const enriched = await Promise.all(
      parsed.suggestions.map(async (s: Record<string, unknown>) => {
        const searchQuery =
          (s.search_query as string) || `${s.name} ${context.destination}`;

        let placeData: Record<string, unknown> = {
          photo_url: null,
          rating: null,
          totalRatings: null,
          googleMapsUrl: null,
          address: null,
          lat: null,
          lng: null,
          priceLevel: null,
        };

        if (googleKey) {
          placeData = await lookupPlace(searchQuery, googleKey);
        }

        // Compute distance from hotel if both positions are known
        let distance_km: number | null = null;
        if (
          context.hotel_location &&
          typeof placeData.lat === "number" &&
          typeof placeData.lng === "number"
        ) {
          distance_km =
            Math.round(
              haversineKm(
                context.hotel_location.lat,
                context.hotel_location.lng,
                placeData.lat as number,
                placeData.lng as number,
              ) * 10,
            ) / 10; // 1 decimal place
        }

        return {
          name: s.name,
          category: s.category,
          why: s.why,
          best_time: s.best_time,
          estimated_cost_per_person: s.estimated_cost_per_person ?? null,
          currency: s.currency ?? null,
          is_event: s.is_event ?? false,
          event_details: s.event_details ?? null,
          // Google Places enrichment
          photo_url: placeData.photo_url,
          rating: placeData.rating,
          totalRatings: placeData.totalRatings,
          googleMapsUrl: placeData.googleMapsUrl,
          address: placeData.address,
          lat: placeData.lat,
          lng: placeData.lng,
          priceLevel: placeData.priceLevel,
          // Computed
          distance_km,
        };
      }),
    );

    // ---- Save assistant message ----
    const { error: insertAssistantErr } = await supabase
      .from("concierge_messages")
      .insert({
        trip_id,
        user_id: null,
        role: "assistant",
        content: parsed.summary,
        suggestions: enriched,
      });
    if (insertAssistantErr) {
      console.error(
        "[concierge-suggest] insert assistant msg:",
        insertAssistantErr,
      );
    }

    return jsonResponse({
      summary: parsed.summary,
      suggestions: enriched,
      cached: false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[concierge-suggest] error:", err);
    return jsonResponse({ error: message }, 500);
  }
});

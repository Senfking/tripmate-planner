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
// Check if query is time-sensitive (events, "tonight", festivals, etc.)
// ---------------------------------------------------------------------------
function isTimeSensitiveQuery(query: string): boolean {
  const patterns =
    /\b(tonight|today|this week|this weekend|what'?s on|event|festival|concert|show|live music|happening now|current|opening|closing)\b/i;
  return patterns.test(query);
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
    if (Array.isArray(place.photos) && place.photos.length > 0 && place.photos[0].name) {
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
    const { trip_id, query, context } = body as {
      trip_id: string;
      query: string;
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

    if (!trip_id || !query || !context?.destination) {
      return jsonResponse(
        { error: "trip_id, query, and context.destination are required" },
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
    const timeSensitive = isTimeSensitiveQuery(query);
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
          // Check if a previous assistant message answered a similar query
          // by looking at the user message right before it
          // Simple heuristic: check if suggestions contain the destination
          const sugStr = JSON.stringify(row.suggestions ?? "").toLowerCase();
          return sugStr.includes(normDest) && sugStr.includes(normQuery.slice(0, 10));
        });

        if (hit) {
          // Still save the user's question for history
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
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }
    const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY");

    // ---- Build system prompt ----
    const groupSize = context.group_size ?? 2;
    const budgetLevel = context.budget_level ?? "mid-range";
    const vibes =
      context.preferences && context.preferences.length > 0
        ? context.preferences.join(", ")
        : "open to anything";
    const dateStr = context.date ?? "upcoming";
    const timeOfDay = context.time_of_day ?? "any time";

    const hotelNote = context.hotel_location
      ? `They are staying at ${context.hotel_location.name}.`
      : "";

    const systemPrompt = `You are Junto's concierge for a group of ${groupSize} traveling in ${context.destination}. Budget level: ${budgetLevel}. Vibes: ${vibes}.

The user is asking about activities for ${dateStr} (${timeOfDay}).
${hotelNote}

Suggest 3-5 specific, real venues or activities that match their query. Consider:
- Time of day (don't suggest nightclubs for morning, don't suggest breakfast spots for evening)
- Their budget and vibe preferences
- Mix popular spots with hidden gems
- Only suggest real, existing places (not generic descriptions)

Respond in this exact JSON format:
{
  "summary": "Brief one-liner response to their query",
  "suggestions": [
    {
      "name": "Venue Name",
      "category": "food|nightlife|culture|relaxation|activity|wellness|shopping",
      "why": "One sentence why this fits their request",
      "best_time": "7pm-11pm",
      "search_query": "Venue Name ${context.destination}",
      "estimated_cost_per_person": 150000,
      "currency": "IDR"
    }
  ]
}

Return ONLY valid JSON, no other text.`;

    // ---- Call Anthropic API ----
    const anthropicBody: Record<string, unknown> = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: query }],
    };

    // Enable web search for time-sensitive queries
    if (timeSensitive) {
      anthropicBody.tools = [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 3,
        },
      ];
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[concierge-suggest] Anthropic error:", errText);
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`);
    }

    const anthropicData = await anthropicRes.json();

    // Extract text content (skip tool_use blocks)
    const textContent =
      anthropicData.content
        ?.filter((c: { type: string }) => c.type === "text")
        .map((c: { text: string }) => c.text)
        .join("") || "";

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
          (s.search_query as string) ||
          `${s.name} ${context.destination}`;

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
          distance_km = Math.round(
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

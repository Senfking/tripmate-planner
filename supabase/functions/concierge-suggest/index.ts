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
      "estimated_cost_per_person": 150000,
      "currency": "IDR",
      "is_event": false,
      "event_details": null,
      "booking_url": "https://example.com/book (optional — venue website or booking page if known, null otherwise)",
      "pro_tip": "Insider hack or tip that makes the experience better (optional, null if none)",
      "what_to_order": "Specific dish or drink to order (optional, null if not relevant)",
      "specific_night": "If this place is best on a specific night, explain why (optional, null if any night works)",
      "opening_hours": "Opening hours if known (optional, null if unknown)",
      "full_description": "2-3 sentence detailed description of the place"
    }
  ]
}

Rules for is_event and event_details:
- Set is_event to true ONLY for time-specific happenings (a DJ set, a festival night, a market, a concert) — NOT for permanent venues.
- When is_event is true, event_details MUST be a short string like "DJ Set by [name], 10pm-3am, IDR 200k cover" or "Night Market, 6pm-midnight, free entry".
- When is_event is false, event_details should be null.
- pro_tip should be a genuine insider tip, not generic advice. Think: "Ask for the secret menu" or "Sit upstairs for the view".
- what_to_order: specific items, not generic ("The wagyu tartare" not "try their food").
- booking_url: If you know the venue has a website, booking page, or reservation system, include the URL. For restaurants, link to their reservation page. For activities, link to GetYourGuide or the venue's booking page if known. Otherwise null.`;
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
// Interfaces for batch Places pipeline
// ---------------------------------------------------------------------------

interface PlacesSearchQuery {
  textQuery: string;
  includedType?: string;
  priceLevels?: string[];
  locationBias: {
    circle: {
      center: { latitude: number; longitude: number };
      radius: number;
    };
  };
}

interface BatchPlaceResult {
  id: string;
  displayName: string | null;
  formattedAddress: string | null;
  location: { latitude: number; longitude: number } | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;
  types: string[];
  photos: Array<{ name: string }>;
  googleMapsUri: string | null;
  businessStatus: string | null;
}

// ---------------------------------------------------------------------------
// buildPlacesQueries — generate 3-4 Google Places Text Search query objects
// from structured filters (no LLM involved)
// ---------------------------------------------------------------------------
function buildPlacesQueries(
  category: string,
  vibes: string[],
  budget: string | undefined,
  location: { name: string; lat: number; lng: number },
  customText?: string,
): PlacesSearchQuery[] {
  // Category → base search terms
  const searchTermsByCategory: Record<string, string[]> = {
    eat: ["restaurant", "dining", "dinner"],
    drink: ["bar", "cocktail bar", "pub"],
    party: ["nightclub", "nightlife", "party venue"],
    explore: ["things to do", "attractions", "must visit"],
    relax: ["spa", "wellness", "massage"],
    workout: ["gym", "fitness center", "crossfit"],
    events: ["events", "festival", "live music"],
    surprise: ["hidden gem", "unique experience", "local favorite"],
  };

  // Only assign includedType for categories with a clear 1:1 mapping
  const includedTypeMap: Record<string, string> = {
    eat: "restaurant",
    drink: "bar",
    workout: "gym",
    relax: "spa",
  };

  // Budget string → Google Places priceLevels enum values
  const budgetToPriceLevels: Record<string, string[]> = {
    "$": ["PRICE_LEVEL_INEXPENSIVE"],
    "$$": ["PRICE_LEVEL_MODERATE"],
    "$$$": ["PRICE_LEVEL_EXPENSIVE"],
  };

  const terms = searchTermsByCategory[category] || searchTermsByCategory.explore;
  const includedType = includedTypeMap[category];
  const priceLevels = budget ? budgetToPriceLevels[budget] : undefined;

  const locationBias = {
    circle: {
      center: { latitude: location.lat, longitude: location.lng },
      radius: 15000,
    },
  };

  const makeQuery = (textQuery: string): PlacesSearchQuery => ({
    textQuery,
    ...(includedType && { includedType }),
    ...(priceLevels && { priceLevels }),
    locationBias,
  });

  const queries: PlacesSearchQuery[] = [];

  // Query 1: vibe + primary term + location (e.g. "romantic restaurant Canggu")
  const primaryVibe = vibes.length > 0 ? vibes[0] : "";
  queries.push(
    makeQuery(
      primaryVibe
        ? `${primaryVibe} ${terms[0]} ${location.name}`
        : `best ${terms[0]} ${location.name}`,
    ),
  );

  // Query 2: secondary vibe/term + location (e.g. "fine dining Canggu")
  const secondaryVibe = vibes.length > 1 ? vibes[1] : "";
  queries.push(
    makeQuery(
      secondaryVibe
        ? `${secondaryVibe} ${terms[1]} ${location.name}`
        : `${terms[1]} ${location.name}`,
    ),
  );

  // Query 3: broader search (e.g. "best dinner Canggu")
  queries.push(makeQuery(`best ${terms[2]} ${location.name}`));

  // Query 4 (optional): custom text with location appended
  if (customText) {
    queries.push(makeQuery(`${customText} ${location.name}`));
  }

  return queries;
}

// ---------------------------------------------------------------------------
// searchPlacesBatch — run all queries against Google Places Text Search API
// (New) in parallel, deduplicate, and filter excluded IDs
// ---------------------------------------------------------------------------
async function searchPlacesBatch(
  queries: PlacesSearchQuery[],
  googleKey: string,
  excludePlaceIds: string[] = [],
): Promise<BatchPlaceResult[]> {
  const excludeSet = new Set(excludePlaceIds);

  const allResults = await Promise.all(
    queries.map(async (q) => {
      try {
        const res = await fetch(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": googleKey,
              "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.photos,places.googleMapsUri,places.businessStatus",
            },
            body: JSON.stringify(q),
          },
        );

        if (!res.ok) return [];

        const data = await res.json();
        return (data.places ?? []) as Array<Record<string, unknown>>;
      } catch {
        return [];
      }
    }),
  );

  // Flatten and deduplicate by place ID, filtering out excluded IDs
  const seen = new Set<string>();
  const deduped: BatchPlaceResult[] = [];

  for (const places of allResults) {
    for (const p of places) {
      const id = p.id as string;
      if (!id || seen.has(id) || excludeSet.has(id)) continue;
      seen.add(id);

      deduped.push({
        id,
        displayName:
          (p.displayName as { text?: string } | undefined)?.text ?? null,
        formattedAddress: (p.formattedAddress as string) ?? null,
        location:
          (p.location as { latitude: number; longitude: number } | undefined) ??
          null,
        rating: (p.rating as number) ?? null,
        userRatingCount: (p.userRatingCount as number) ?? null,
        priceLevel: (p.priceLevel as string) ?? null,
        types: Array.isArray(p.types) ? (p.types as string[]) : [],
        photos: Array.isArray(p.photos)
          ? (p.photos as Array<{ name: string }>)
          : [],
        googleMapsUri: (p.googleMapsUri as string) ?? null,
        businessStatus: (p.businessStatus as string) ?? null,
      });
    }
  }

  return deduped;
}

// ---------------------------------------------------------------------------
// validateAIResponse — pure-code validation of AI picks against Google Places
// ground truth. Merges AI enrichment (description, pro_tip) with verified data.
// ---------------------------------------------------------------------------
function validateAIResponse(
  aiResponse: Array<Record<string, unknown>>,
  originalPlaces: BatchPlaceResult[],
  searchLat: number,
  searchLng: number,
  excludeIds: string[] = [],
): Array<Record<string, unknown>> {
  const placesById = new Map<string, BatchPlaceResult>();
  for (const p of originalPlaces) {
    placesById.set(p.id, p);
  }
  const excludeSet = new Set(excludeIds);

  const validated: Array<Record<string, unknown>> = [];

  for (const item of aiResponse) {
    const id = item.id as string;
    if (!id) continue;

    // Skip excluded IDs
    if (excludeSet.has(id)) continue;

    // ID must exist in the original Places results
    const place = placesById.get(id);
    if (!place) continue;

    // Coordinates must be within 25 km of the search center
    if (place.location) {
      const dist = haversineKm(
        searchLat,
        searchLng,
        place.location.latitude,
        place.location.longitude,
      );
      if (dist > 25) continue;
    }

    // businessStatus must be OPERATIONAL (or not set)
    if (place.businessStatus && place.businessStatus !== "OPERATIONAL") continue;

    // Merge: Google Places ground truth + AI enrichment fields
    validated.push({
      id: place.id,
      name: place.displayName,
      address: place.formattedAddress,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      priceLevel: place.priceLevel,
      types: place.types,
      photos: place.photos,
      googleMapsUri: place.googleMapsUri,
      businessStatus: place.businessStatus,
      // AI-provided enrichment
      description: item.description ?? item.full_description ?? null,
      pro_tip: item.pro_tip ?? null,
      why: item.why ?? null,
      category: item.category ?? null,
      best_time: item.best_time ?? null,
      estimated_cost_per_person: item.estimated_cost_per_person ?? null,
      currency: item.currency ?? null,
      what_to_order: item.what_to_order ?? null,
      booking_url: item.booking_url ?? null,
      is_event: item.is_event ?? false,
      event_details: item.event_details ?? null,
      specific_night: item.specific_night ?? null,
      opening_hours: item.opening_hours ?? null,
    });
  }

  return validated;
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
        location?: string;
        user_location?: { lat: number; lng: number };
        date?: string;
        time_of_day?: string;
        group_size?: number;
        budget_level?: string;
        preferences?: string[];
        hotel_location?: { name: string; lat: number; lng: number };
      };
    };

    const specificLocation = context?.location;
    const userGps = context?.user_location;

    // Determine request type: structured filters vs free text
    const isStructured = !!body.category && !body.query;
    const structCategory: string | undefined = body.category;
    const structWhen: string | string[] | undefined = body.when;
    const structVibe: string | string[] | undefined = body.vibe;
    const structBudget: string | string[] | undefined = body.budget;
    const feelingLucky: boolean = !!body.feeling_lucky;
    const excludeNames: string[] = Array.isArray(body.exclude_names) ? body.exclude_names : [];
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

    if (!timeSensitive && excludeNames.length === 0) {
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
    const budgetLevel = budgetArr.length ? budgetArr.join(" or ") : context.budget_level || "mid-range";
    const vibes =
      context.preferences && context.preferences.length > 0
        ? context.preferences.join(", ")
        : "open to anything";

    const hotelNote = context.hotel_location
      ? `They are staying at ${context.hotel_location.name}.`
      : "";

    const locationEnforcement = `CRITICAL: Every suggestion MUST be a real, currently operating venue in or within 15 minutes of ${specificLocation || context.destination}. Do NOT invent venue names. If you're not confident a venue exists, don't include it. It's better to suggest 3 verified real places than 5 questionable ones.`;

    // Location-precision block: constrains suggestions to a specific area
    const locationNote = specificLocation
      ? `The user is currently in ${specificLocation} (within the broader destination of ${context.destination}). ALL suggestions must be in or very near ${specificLocation}. Do NOT suggest places in other areas — if the user is in ${specificLocation.split(",")[0].trim()}, don't suggest spots in distant neighborhoods. Only suggest spots that are within 15-20 minutes of ${specificLocation}. If the user wants suggestions elsewhere, they'll change their location.`
      : "";
    const gpsNote = userGps
      ? `User's GPS coordinates: ${userGps.lat}, ${userGps.lng}. Prioritize venues closest to these coordinates.`
      : "";

    // Resolve dates for event search
    let dateStr: string;
    let timeOfDay: string;
    let dayOfWeek: string;
    let whenLabel: string;

    if (isStructured && whenArr.length > 0) {
      // Use first "when" for date resolution, but pass all for labeling
      const resolved = resolveWhen(whenArr[0]);
      dateStr = resolved.date;
      timeOfDay = resolved.timeOfDay;
      dayOfWeek = resolved.dayOfWeek;
      whenLabel = whenArr.join(" or ").toLowerCase();
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

    // ---- Fetch real venue data via batch Places pipeline ----
    // Guard: (0, 0) is Null Island — never a valid user location. Treat as missing.
    const rawLat = userGps?.lat ?? context.hotel_location?.lat ?? null;
    const rawLng = userGps?.lng ?? context.hotel_location?.lng ?? null;
    const searchLat = rawLat === 0 && rawLng === 0 ? null : rawLat;
    const searchLng = rawLat === 0 && rawLng === 0 ? null : rawLng;
    const searchLocationName = specificLocation || context.destination;
    const searchCategory = structCategory || "explore";
    const customSearchText = !isStructured ? body.query : undefined;
    const excludePlaceIds: string[] = Array.isArray(body.exclude_place_ids)
      ? body.exclude_place_ids
      : [];

    let venueData: BatchPlaceResult[] = [];

    if (googleKey && searchLat !== null && searchLng !== null) {
      const queries = buildPlacesQueries(
        searchCategory,
        vibeArr,
        budgetArr[0],
        { name: searchLocationName, lat: searchLat, lng: searchLng },
        customSearchText,
      );
      venueData = await searchPlacesBatch(queries, googleKey, excludePlaceIds);
    }

    // Format venue data for prompt injection
    const hasVenueData = venueData.length > 0;

    const venueListForPrompt = venueData
      .map((v, i) => {
        const parts = [`id="${v.id}"`, `name="${v.displayName}"`];
        if (v.formattedAddress) parts.push(`address="${v.formattedAddress}"`);
        if (v.rating !== null) parts.push(`rating=${v.rating}`);
        if (v.userRatingCount !== null)
          parts.push(`reviews=${v.userRatingCount}`);
        if (v.priceLevel) parts.push(`price=${v.priceLevel}`);
        if (v.types.length)
          parts.push(`types=[${v.types.slice(0, 5).join(",")}]`);
        return `${i + 1}. ${parts.join(" | ")}`;
      })
      .join("\n");

    const venueConstraint = hasVenueData
      ? `\nCRITICAL RULES:
- You MUST ONLY recommend venues from the VENUE DATA list provided below.
- NEVER add or invent venues that are not in the list.
- Every recommendation MUST include the exact "id" field from the provided data.
- Your job is to RANK the best options and ENRICH them with descriptions, tips, and insights.
- Select 3-5 venues that best match the user's request.`
      : "";

    const venueDataBlock = hasVenueData
      ? `\n\nVENUE DATA:\n${venueListForPrompt}`
      : "";

    // JSON response schema — includes "id" when venue data is available
    const responseSchema = hasVenueData
      ? `{
  "summary": "Brief one-liner response to their query",
  "suggestions": [
    {
      "id": "EXACT place ID from VENUE DATA — copy verbatim, e.g. ChIJxxxxxx",
      "category": "food|nightlife|culture|relaxation|activity|wellness|shopping|events",
      "why": "One sentence why this fits their request",
      "best_time": "7pm-11pm",
      "estimated_cost_per_person": 150000,
      "currency": "IDR",
      "is_event": false,
      "event_details": null,
      "pro_tip": "Insider hack or tip (null if none)",
      "what_to_order": "Specific dish or drink (null if not relevant)",
      "specific_night": null,
      "opening_hours": null,
      "full_description": "2-3 sentence detailed description"
    }
  ]
}

Rules for the response:
- The "id" field MUST be copied exactly from the VENUE DATA list. Do not modify or fabricate IDs.
- Set is_event to true ONLY for time-specific happenings — NOT for permanent venues.
- When is_event is true, event_details MUST describe the event (e.g. "DJ Set by [name], 10pm-3am, IDR 200k cover").
- pro_tip should be a genuine insider tip, not generic advice. Think: "Ask for the secret menu" or "Sit upstairs for the view".
- what_to_order: specific items, not generic ("The wagyu tartare" not "try their food").`
      : suggestionJsonSchema(context.destination);

    // ---- Build system prompt ----
    let systemPrompt: string;

    if (feelingLucky) {
      // -- Feeling Lucky mode: go wild with unexpected suggestions --
      const categoryHint = structCategory && structCategory !== "surprise"
        ? `The user is interested in ${CATEGORY_DESCRIPTIONS[structCategory] || structCategory}, but wants the UNUSUAL and UNEXPECTED variety.`
        : "The user wants completely unexpected, off-the-beaten-path experiences.";

      systemPrompt = `You are Junto's secret insider concierge for a group of ${groupSize} traveling in ${context.destination}.

${locationNote}
${gpsNote}
${locationEnforcement}
${venueConstraint}
${categoryHint}

Your job: suggest 3-5 genuinely surprising, unusual, hidden-gem experiences that most tourists would NEVER find. Think:
- Places only locals know about
- Weird, wonderful, one-of-a-kind experiences
- Secret spots, underground scenes, off-script adventures
- Things that make great stories

Do NOT suggest popular tourist attractions or well-known chains. Every suggestion should make someone say "wait, what? Let's do THAT."

${hotelNote}

Your summary should be playful and confident, like: "Okay, trust me on these..." or "You probably haven't heard of these..." or "These are the ones we don't tell everyone about..."

Each suggestion MUST have a pro_tip with a genuine insider hack.

Respond in this exact JSON format:
${responseSchema}

Return ONLY valid JSON, no other text.${venueDataBlock}`;
    } else if (isStructured) {
      // -- Structured request: skip interpretation, use filters directly --
      const categoryDesc =
        CATEGORY_DESCRIPTIONS[structCategory!] || structCategory;
      const vibeNote = vibeArr.length ? `- Preferred vibes (match ANY): ${vibeArr.join(", ")}` : "";

      systemPrompt = `You are Junto's concierge for a group of ${groupSize} traveling in ${context.destination}.
${locationNote}
${gpsNote}
${locationEnforcement}
${venueConstraint}

Find the best ${categoryDesc} using these exact filters:
- Timing: ${whenArr.length ? whenArr.join(" or ") : "any time"} (${dateStr}, ${dayOfWeek})
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
${responseSchema}

Return ONLY valid JSON, no other text.${venueDataBlock}`;
    } else {
      // -- Free-text request: AI interprets intent --
      systemPrompt = `You are Junto's concierge for a group of ${groupSize} traveling in ${context.destination}. Budget level: ${budgetLevel}. Vibes: ${vibes}.
${locationNote}
${gpsNote}
${locationEnforcement}
${venueConstraint}

The user is asking about activities for ${dateStr} (${timeOfDay}).
${hotelNote}

Suggest 3-5 specific, real venues or activities that match their query. Consider:
- Time of day (don't suggest nightclubs for morning, don't suggest breakfast spots for evening)
- Their budget and vibe preferences
- Mix popular spots with hidden gems
- Only suggest real, existing places (not generic descriptions)

Respond in this exact JSON format:
${responseSchema}

Return ONLY valid JSON, no other text.${venueDataBlock}`;
    }

    // -- Add exclusion list when paginating ("show more") --
    if (excludeNames.length > 0) {
      systemPrompt += `\n\nIMPORTANT — EXCLUSION LIST: The user has already been shown these venues. Do NOT suggest any of them again:\n${excludeNames.map((n) => `- ${n}`).join("\n")}\nSuggest DIFFERENT venues only.`;
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
      ? `Find me ${CATEGORY_DESCRIPTIONS[structCategory!] || structCategory}${whenArr.length ? ` for ${whenArr.join(" or ").toLowerCase()}` : ""}${vibeArr.length ? `, ${vibeArr.join(" or ").toLowerCase()} vibe` : ""} in ${context.destination}`
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

    // ---- Validate & enrich suggestions ----
    let enriched: Record<string, unknown>[];

    if (hasVenueData) {
      // Places-first pipeline: validate AI picks against real venue data
      const validated = validateAIResponse(
        parsed.suggestions,
        venueData,
        searchLat!,
        searchLng!,
        excludePlaceIds,
      );

      // Map validated results to frontend-compatible shape
      enriched = validated.map((v) => {
        const photos = (v.photos as Array<{ name: string }>) || [];
        let photo_url: string | null = null;
        if (googleKey && photos.length > 0 && photos[0]?.name) {
          photo_url = `https://places.googleapis.com/v1/${photos[0].name}/media?maxWidthPx=800&key=${googleKey}`;
        }

        let distance_km: number | null = null;
        if (
          context.hotel_location &&
          typeof v.lat === "number" &&
          typeof v.lng === "number"
        ) {
          distance_km =
            Math.round(
              haversineKm(
                context.hotel_location.lat,
                context.hotel_location.lng,
                v.lat,
                v.lng,
              ) * 10,
            ) / 10;
        }

        const venueName = (v.name as string) || "";
        const mapsUrl = venueName
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueName + " " + searchLocationName)}`
          : (v.googleMapsUri as string) ?? null;

        return {
          name: venueName,
          category: (v.category as string) || "",
          why: v.why ?? null,
          best_time: v.best_time ?? null,
          estimated_cost_per_person: v.estimated_cost_per_person ?? null,
          currency: v.currency ?? null,
          is_event: v.is_event ?? false,
          event_details: v.event_details ?? null,
          booking_url: v.booking_url ?? null,
          pro_tip: v.pro_tip ?? null,
          what_to_order: v.what_to_order ?? null,
          specific_night: v.specific_night ?? null,
          opening_hours: v.opening_hours ?? null,
          full_description: v.description ?? null,
          photo_url,
          rating: v.rating as number | null,
          totalRatings: v.userRatingCount as number | null,
          googleMapsUrl: mapsUrl,
          address: (v.address as string) ?? null,
          lat: (v.lat as number) ?? null,
          lng: (v.lng as number) ?? null,
          priceLevel: (v.priceLevel as string) ?? null,
          place_id: (v.id as string) || null,
          not_verified: false,
          distance_km,
        };
      });
    } else {
      // No verified venue data — return empty results rather than unvalidated
      // AI suggestions that could contain wrong-location hallucinations.
      enriched = [];
      if (!parsed.summary) {
        parsed.summary = `I couldn't find verified venues in ${searchLocationName}. Try a different search or check your location.`;
      }
    }

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

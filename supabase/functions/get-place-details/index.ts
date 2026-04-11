import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type PlaceDetailsResponse = {
  photos: string[];
  reviews: { author: string; rating: number; text: string; time: string }[];
  rating: number | null;
  totalRatings: number | null;
  googleMapsUrl: string | null;
  address: string | null;
};

const FIELD_MASK =
  "places.id,places.displayName,places.rating,places.userRatingCount,places.reviews,places.photos,places.googleMapsUri,places.formattedAddress";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check — same pattern as other Edge Functions
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: authUser }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const query: string | undefined = body?.query;
    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const queryText = query.trim();

    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GOOGLE_PLACES_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for cache access (RLS allows authenticated, but
    // service role bypasses RLS for the upsert even in edge cases).
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Check cache for fresh entry (< 30 days old)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: cached, error: cacheErr } = await supabaseAdmin
      .from("place_details_cache")
      .select("response, created_at")
      .eq("query_text", queryText)
      .gt("created_at", thirtyDaysAgo)
      .maybeSingle();

    if (!cacheErr && cached?.response) {
      return new Response(
        JSON.stringify({ ...(cached.response as PlaceDetailsResponse), cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Call Google Places API (New) — Text Search
    const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: queryText }),
      signal: AbortSignal.timeout(15000),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      return new Response(
        JSON.stringify({ error: "Places API error", status: searchRes.status, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const searchData = await searchRes.json();
    const place = searchData?.places?.[0];
    if (!place) {
      const empty: PlaceDetailsResponse = {
        photos: [],
        reviews: [],
        rating: null,
        totalRatings: null,
        googleMapsUrl: null,
        address: null,
      };
      // Cache empty result too to avoid hammering the API
      await supabaseAdmin
        .from("place_details_cache")
        .upsert(
          { query_text: queryText, response: empty, created_at: new Date().toISOString() },
          { onConflict: "query_text" },
        );
      return new Response(JSON.stringify({ ...empty, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Build photo URLs (up to 3)
    const photoNames: string[] = Array.isArray(place.photos)
      ? place.photos.slice(0, 3).map((p: { name: string }) => p.name).filter(Boolean)
      : [];
    const photos: string[] = photoNames.map(
      (name) => `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=${apiKey}`,
    );

    // 4. Extract up to 2 reviews
    const reviewsRaw = Array.isArray(place.reviews) ? place.reviews.slice(0, 2) : [];
    // deno-lint-ignore no-explicit-any
    const reviews = reviewsRaw.map((r: any) => r as {
      authorAttribution?: { displayName?: string };
      rating?: number;
      text?: { text?: string };
      originalText?: { text?: string };
      relativePublishTimeDescription?: string;
    }) => ({
      author: r.authorAttribution?.displayName ?? "",
      rating: typeof r.rating === "number" ? r.rating : 0,
      text: r.text?.text ?? r.originalText?.text ?? "",
      time: r.relativePublishTimeDescription ?? "",
    }));

    const response: PlaceDetailsResponse = {
      photos,
      reviews,
      rating: typeof place.rating === "number" ? place.rating : null,
      totalRatings: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
      googleMapsUrl: place.googleMapsUri ?? null,
      address: place.formattedAddress ?? null,
    };

    // 5. Upsert into cache (refresh created_at so 30d window resets)
    const { error: upsertErr } = await supabaseAdmin
      .from("place_details_cache")
      .upsert(
        { query_text: queryText, response, created_at: new Date().toISOString() },
        { onConflict: "query_text" },
      );
    if (upsertErr) {
      console.error("place_details_cache upsert error:", upsertErr);
    }

    return new Response(JSON.stringify({ ...response, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

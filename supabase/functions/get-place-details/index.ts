import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { mirrorPlacePhotos } from "../_shared/places/photoMirror.ts";

console.log("[get-place-details] module loaded");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
  ...CORS_HEADERS,
};

const CACHE_TTL_DAYS = 30;

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Auth: require a valid Bearer token to prevent anonymous abuse of the
    // Google Places API quota and the place_details_cache table.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (supabaseUrl && anonKey) {
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await authClient.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: JSON_HEADERS,
        });
      }
    }

    const { query } = await req.json();
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GOOGLE_PLACES_API_KEY not set" }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    const rawQuery = typeof query === "string" ? query : "";
    if (!rawQuery.trim()) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    // Normalize the query the same way buildSearchCacheKey does so that
    // "Eiffel Tower", "  eiffel tower ", "Eiffel-Tower!" all collapse to the
    // same cache row. Strips diacritics + non-alphanumerics. Without this,
    // case/punctuation drift caused cache misses on essentially identical
    // requests.
    const normalizedQuery = rawQuery
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const supabase = getServiceClient();

    // Step 0: Cache lookup. Rows past expires_at are ignored so stale data
    // doesn't linger beyond the TTL even if the cleanup cron is behind.
    if (supabase) {
      const { data: cached, error: cacheErr } = await supabase
        .from("place_details_cache")
        .select("response, expires_at")
        .eq("query_text", normalizedQuery)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cacheErr) {
        console.warn("[get-place-details] cache lookup failed", cacheErr.message);
      } else if (cached?.response) {
        console.log(`[get-place-details] cache_hit query="${normalizedQuery}"`);
        return new Response(JSON.stringify(cached.response), { headers: JSON_HEADERS });
      }
    }

    // Step 1: Text Search — include location for accurate coordinates
    console.log(`[get-place-details] cache_miss query="${normalizedQuery}"`);
    const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.reviews,places.photos,places.googleMapsUri,places.formattedAddress,places.location,places.priceLevel",
      },
      body: JSON.stringify({ textQuery: normalizedQuery }),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      return new Response(JSON.stringify({ error: "Google API error", status: searchRes.status, detail: errText }), {
        status: 502,
        headers: JSON_HEADERS,
      });
    }

    const searchData = await searchRes.json();
    const place = searchData.places?.[0];

    if (!place) {
      const empty = { photos: [], reviews: [], rating: null, totalRatings: null, googleMapsUrl: null, address: null, latitude: null, longitude: null, priceLevel: null };
      // Cache the miss too — repeating the same failed query shouldn't keep
      // burning Places API quota.
      if (supabase) {
        const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { error: upsertErr } = await supabase
          .from("place_details_cache")
          .upsert({ query_text: normalizedQuery, response: empty, expires_at: expiresAt }, { onConflict: "query_text" });
        if (upsertErr) console.warn("[get-place-details] cache upsert (miss) failed", upsertErr.message);
      }
      return new Response(JSON.stringify(empty), { headers: JSON_HEADERS });
    }

    // Step 2: Mirror up to 3 photos to the public `place-photos` Storage
    // bucket and persist Storage URLs (NOT Google URLs with api keys) in
    // the response. Failure to mirror an individual photo silently drops it
    // — the caller's `photos[]` may have 0-3 entries. The previous version
    // built `https://places.googleapis.com/...?key=${apiKey}` URLs that
    // leaked the Google Places API key to every authenticated client and
    // billed Google's $0.007/load photo-media SKU on every <img> render.
    const photos: string[] = supabase && place.id && Array.isArray(place.photos)
      ? await mirrorPlacePhotos(supabase, apiKey, place.id, place.photos, { max: 3 })
      : [];

    // Step 3: Extract reviews
    const reviews: { author: string; rating: number; text: string; time: string }[] = [];
    if (Array.isArray(place.reviews)) {
      for (const r of place.reviews.slice(0, 2)) {
        reviews.push({
          author: r?.authorAttribution?.displayName ?? "",
          rating: typeof r?.rating === "number" ? r.rating : 0,
          text: r?.text?.text ?? r?.originalText?.text ?? "",
          time: r?.relativePublishTimeDescription ?? "",
        });
      }
    }

    const result = {
      photos,
      reviews,
      rating: place.rating ?? null,
      totalRatings: place.userRatingCount ?? null,
      googleMapsUrl: place.googleMapsUri ?? null,
      address: place.formattedAddress ?? null,
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
      priceLevel: place.priceLevel ?? null,
    };

    if (supabase) {
      const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { error: upsertErr } = await supabase
        .from("place_details_cache")
        .upsert({ query_text: normalizedQuery, response: result, expires_at: expiresAt }, { onConflict: "query_text" });
      if (upsertErr) console.warn("[get-place-details] cache upsert failed", upsertErr.message);
    }

    return new Response(JSON.stringify(result), { headers: JSON_HEADERS });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});

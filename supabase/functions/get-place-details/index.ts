import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

console.log("[get-place-details] module loaded");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { query } = await req.json();
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GOOGLE_PLACES_API_KEY not set" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Step 1: Text Search
    const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.reviews,places.photos,places.googleMapsUri,places.formattedAddress",
      },
      body: JSON.stringify({ textQuery: query }),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      return new Response(JSON.stringify({ error: "Google API error", status: searchRes.status, detail: errText }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const searchData = await searchRes.json();
    const place = searchData.places?.[0];

    if (!place) {
      return new Response(JSON.stringify({ photos: [], reviews: [], rating: null, totalRatings: null, googleMapsUrl: null, address: null }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Step 2: Build photo URLs
    const photos: string[] = [];
    if (Array.isArray(place.photos)) {
      for (const p of place.photos.slice(0, 3)) {
        if (p.name) {
          photos.push(`https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${apiKey}`);
        }
      }
    }

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
    };

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});

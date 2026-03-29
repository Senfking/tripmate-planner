import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate token
    const { data: shareToken, error: tokenErr } = await supabase
      .from("trip_share_tokens")
      .select("id, trip_id, expires_at, revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr) {
      console.error("Token lookup error:", tokenErr.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      !shareToken ||
      shareToken.revoked_at ||
      new Date(shareToken.expires_at) < new Date()
    ) {
      return new Response(
        JSON.stringify({ error: "This share link is invalid or has expired." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tripId = shareToken.trip_id;

    // Fetch trip, items, attachments, member count in parallel
    const [tripRes, itemsRes, attachRes, memberCountRes] = await Promise.all([
      supabase
        .from("trips")
        .select("name, tentative_start_date, tentative_end_date, emoji")
        .eq("id", tripId)
        .single(),
      supabase
        .from("itinerary_items")
        .select("day_date, start_time, title, location_text, status")
        .eq("trip_id", tripId)
        .order("day_date")
        .order("start_time", { ascending: true, nullsFirst: false }),
      supabase
        .from("attachments")
        .select("title, type, url")
        .eq("trip_id", tripId),
      supabase
        .from("trip_members")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId),
    ]);

    if (tripRes.error) {
      console.error("Trip fetch error:", tripRes.error.message);
      return new Response(JSON.stringify({ error: "Trip not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        trip: tripRes.data,
        itinerary_items: itemsRes.data || [],
        attachments: attachRes.data || [],
        member_count: memberCountRes.count || 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unhandled error in public-trip-share-view:", err.message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Public anon itinerary view for a trip share token.
// Returns the latest ai_trip_plans.result (the rich AI-generated plan) plus
// minimal trip header info. Excludes expenses, member-attribution, and any
// auth-required affordances. Caller renders via TripResultsView readOnly.
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
    const body = await req.json();
    const token = body?.token;
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tripId = shareToken.trip_id;

    const [tripRes, planRes] = await Promise.all([
      supabase
        .from("trips")
        .select("name, emoji, tentative_start_date, tentative_end_date, destination_image_url")
        .eq("id", tripId)
        .single(),
      supabase
        .from("ai_trip_plans")
        .select("result, created_at")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (tripRes.error) {
      return new Response(JSON.stringify({ error: "Trip not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!planRes.data?.result) {
      return new Response(
        JSON.stringify({ error: "no_itinerary" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        trip: tripRes.data,
        result: planRes.data.result,
        last_updated: planRes.data.created_at,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    console.error("Unhandled:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

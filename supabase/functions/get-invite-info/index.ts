import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "missing_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the invite
    const { data: invite, error: invErr } = await supabase
      .from("invites")
      .select("trip_id, created_by, expires_at, redeemed_at")
      .eq("token", token)
      .maybeSingle();

    if (invErr || !invite) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch trip info
    const { data: trip } = await supabase
      .from("trips")
      .select("name, emoji")
      .eq("id", invite.trip_id)
      .single();

    // Fetch inviter profile
    const { data: inviter } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", invite.created_by)
      .single();

    return new Response(
      JSON.stringify({
        trip_name: trip?.name ?? "a trip",
        trip_emoji: trip?.emoji ?? "✈️",
        inviter_name: inviter?.display_name ?? "Someone",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch {
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

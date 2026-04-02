import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter: max 10 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Rate limit by IP to prevent invite token enumeration
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { token, code } = body;

    if (!token && !code) {
      return new Response(JSON.stringify({ error: "missing_token_or_code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let tripId: string | null = null;
    let createdBy: string | null = null;

    if (token) {
      // Look up by invite token
      const { data: invite, error: invErr } = await supabase
        .from("invites")
        .select("trip_id, created_by")
        .eq("token", token)
        .maybeSingle();

      if (invErr || !invite) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tripId = invite.trip_id;
      createdBy = invite.created_by;
    } else if (code) {
      // Look up by trip code
      const { data: trip, error: tripErr } = await supabase
        .from("trips")
        .select("id")
        .eq("trip_code", code.toUpperCase().trim())
        .maybeSingle();

      if (tripErr || !trip) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tripId = trip.id;
    }

    // Fetch trip info
    const { data: trip } = await supabase
      .from("trips")
      .select("name, emoji")
      .eq("id", tripId!)
      .single();

    // Fetch inviter profile if available
    let inviterName = "Someone";
    if (createdBy) {
      const { data: inviter } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", createdBy)
        .single();
      inviterName = inviter?.display_name ?? "Someone";
    }

    return new Response(
      JSON.stringify({
        trip_name: trip?.name ?? "a trip",
        trip_emoji: trip?.emoji ?? "✈️",
        inviter_name: inviterName,
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

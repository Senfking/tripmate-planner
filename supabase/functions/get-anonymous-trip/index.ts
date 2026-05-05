// get-anonymous-trip
//
// Public endpoint that returns the stored generation payload for a row in
// `anonymous_trips`. Used by the frontend `/trips/anon/[id]` page so a
// visitor who refreshes (or gets a shared link) can re-render the trip.
//
// Returns:
//   200 { success: true, payload, claimed: boolean }
//   404 { success: false, error: "not_found" }
//
// `claimed` is true when the trip has already been transferred to a user
// account. The frontend uses this to render a "this trip has moved" view
// instead of leaking the now-owned trip.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "invalid_body" }, 400);
  }
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return json({ success: false, error: "id_required" }, 400);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await svc
    .from("anonymous_trips")
    .select("id, payload, claimed_at, prompt")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[get-anonymous-trip] lookup failed:", error.message);
    return json({ success: false, error: "lookup_failed" }, 500);
  }
  if (!data) return json({ success: false, error: "not_found" }, 404);

  return json({
    success: true,
    payload: data.payload,
    prompt: data.prompt,
    claimed: data.claimed_at !== null,
  });
});

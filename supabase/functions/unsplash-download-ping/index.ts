// Server-side ping for Unsplash's download_location URL.
// Required by Unsplash API Guidelines (Hotlinking + Tracking Downloads).
// Called from the client at most once per photoId per session.
//
// Body: { downloadLocation: string, photoId: string }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const KEY = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!KEY) return json({ error: "UNSPLASH_ACCESS_KEY not configured" }, 500);

  let body: { downloadLocation?: string; photoId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const dl = typeof body.downloadLocation === "string" ? body.downloadLocation : "";
  if (!dl.startsWith("https://api.unsplash.com/")) {
    return json({ error: "invalid downloadLocation" }, 400);
  }

  try {
    const r = await fetch(dl, { headers: { Authorization: `Client-ID ${KEY}` } });
    // Consume body to avoid resource leak.
    await r.text();
    return json({ ok: r.ok, status: r.status, photoId: body.photoId ?? null });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});

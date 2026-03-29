import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractMeta(html: string, property: string): string | null {
  const q = `["']`; // match single or double quotes
  const props = [property];
  if (property.startsWith("og:")) {
    props.push(`twitter:${property.slice(3)}`);
  }
  for (const prop of props) {
    const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // property/name before content
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=${q}${esc}${q}[^>]+content=${q}([^"']*?)${q}`, "i");
    const m1 = html.match(re1);
    if (m1) return m1[1];
    // content before property/name
    const re2 = new RegExp(`<meta[^>]+content=${q}([^"']*?)${q}[^>]+(?:property|name)=${q}${esc}${q}`, "i");
    const m2 = html.match(re2);
    if (m2) return m2[1];
  }
  // Fallback: try <title> tag for og:title
  if (property === "og:title") {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].trim();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { attachment_id, url } = await req.json();
    if (!attachment_id || !url) {
      return new Response(JSON.stringify({ error: "attachment_id and url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the page with browser-like headers
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    const html = await res.text();

    const og_title = extractMeta(html, "og:title") || null;
    const og_description = extractMeta(html, "og:description") || null;
    const og_image_url = extractMeta(html, "og:image") || null;

    // Update the attachment row
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabaseAdmin
      .from("attachments")
      .update({ og_title, og_description, og_image_url })
      .eq("id", attachment_id);

    if (error) throw error;

    return new Response(
      JSON.stringify({ og_title, og_description, og_image_url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

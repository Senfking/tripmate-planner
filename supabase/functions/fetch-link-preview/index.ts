import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractMeta(html: string, property: string): string | null {
  const q = `["']`;
  const props = [property];
  if (property.startsWith("og:")) {
    props.push(`twitter:${property.slice(3)}`);
  }
  for (const prop of props) {
    const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=${q}${esc}${q}[^>]+content=${q}([^"']*?)${q}`, "i");
    const m1 = html.match(re1);
    if (m1) return m1[1];
    const re2 = new RegExp(`<meta[^>]+content=${q}([^"']*?)${q}[^>]+(?:property|name)=${q}${esc}${q}`, "i");
    const m2 = html.match(re2);
    if (m2) return m2[1];
  }
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

    let og_title: string | null = null;
    let og_description: string | null = null;
    let og_image_url: string | null = null;

    // 1. Direct fetch
    try {
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
      og_title = extractMeta(html, "og:title") || null;
      og_description = extractMeta(html, "og:description") || null;
      og_image_url = extractMeta(html, "og:image") || null;
    } catch {
      // Direct fetch failed, will try Microlink
    }

    // 2. Microlink fallback if no title found
    if (!og_title) {
      try {
        const microlinkRes = await fetch(
          `https://api.microlink.io/?url=${encodeURIComponent(url)}`,
          { signal: AbortSignal.timeout(8000) },
        );
        const microlinkData = await microlinkRes.json();
        if (microlinkData.status === "success") {
          og_title = microlinkData.data.title || og_title;
          og_description = microlinkData.data.description || og_description;
          og_image_url = microlinkData.data.image?.url || og_image_url;
        }
      } catch {
        // Microlink also failed, proceed with nulls
      }
    }

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

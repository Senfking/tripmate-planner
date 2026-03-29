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
    let htmlContent: string | null = null;
    let microlinkPayload: Record<string, unknown> | null = null;

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

      htmlContent = await res.text();
      og_title = extractMeta(htmlContent, "og:title") || null;
      og_description = extractMeta(htmlContent, "og:description") || null;
      og_image_url = extractMeta(htmlContent, "og:image") || null;
    } catch {
      // Direct fetch failed
    }

    // 2. Microlink fallback — always try for richer data & images
    try {
      const microlinkRes = await fetch(
        `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true`,
        { signal: AbortSignal.timeout(8000) },
      );
      const microlinkData = await microlinkRes.json();
      if (microlinkData.status === "success") {
        microlinkPayload = microlinkData.data;
        og_title = og_title || microlinkData.data.title || null;
        og_description = og_description || microlinkData.data.description || null;
        if (!og_image_url) {
          og_image_url =
            microlinkData.data.image?.url ||
            microlinkData.data.screenshot?.url ||
            microlinkData.data.logo?.url ||
            null;
        }
      }
    } catch {
      // Microlink also failed
    }

    // 3. Claude AI extraction for structured booking data
    let booking_data: Record<string, unknown> | null = null;
    let ai_title: string | null = null;
    let ai_type: string | null = null;
    let ai_description: string | null = null;

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (anthropicKey) {
      try {
        const prompt = `Extract booking information from this travel link. Use all available signals:

URL: ${url}

OG Title: ${og_title || "none"}
OG Description: ${og_description || "none"}

Microlink data: ${JSON.stringify(microlinkPayload || {})}

Raw HTML snippet (first 3000 chars):
${htmlContent?.slice(0, 3000) || "none"}

Return ONLY a JSON object (null for missing):
{
  "booking_type": "flight|hotel|activity|other",
  "title": "short descriptive title",
  "provider": "company name",
  "booking_reference": "ref code or null",
  "check_in": "date string or null",
  "check_out": "date string or null",
  "departure": "origin city/airport or null",
  "destination": "destination city/airport or null",
  "departure_time": "time or null",
  "arrival_time": "time or null",
  "total_price": "price with currency or null",
  "notes": "any other useful info or null"
}

For booking.com URLs, the URL params often contain checkin/checkout dates, city names, and hotel names — extract these even if the page content was blocked.

Return only valid JSON, no other text.`;

        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: AbortSignal.timeout(15000),
        });

        const aiData = await aiRes.json();
        if (aiData.content?.[0]?.text) {
          const raw = aiData.content[0].text.trim();
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const extracted = JSON.parse(jsonMatch[0]);
            booking_data = extracted;
            ai_title = extracted.title || null;
            ai_type = extracted.booking_type || null;

            // Format dates nicely (ISO → "Apr 2, 2026")
            const fmtDate = (s: string | null): string | null => {
              if (!s) return null;
              try {
                const d = new Date(s);
                if (isNaN(d.getTime())) return s;
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              } catch { return s; }
            };

            // Build compact description from key fields
            const descParts: string[] = [];
            if (extracted.provider) descParts.push(extracted.provider);
            if (extracted.departure && extracted.destination) {
              descParts.push(`${extracted.departure} → ${extracted.destination}`);
            }
            if (extracted.check_in) descParts.push(`In: ${fmtDate(extracted.check_in) || extracted.check_in}`);
            if (extracted.check_out) descParts.push(`Out: ${fmtDate(extracted.check_out) || extracted.check_out}`);
            if (extracted.total_price) descParts.push(extracted.total_price);
            if (descParts.length > 0) ai_description = descParts.join(" · ");
          }
        }
      } catch {
        // Claude failed — continue with OG data
      }
    }

    // 4. Build final update
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Read current row to check type
    const { data: current } = await supabaseAdmin
      .from("attachments")
      .select("type")
      .eq("id", attachment_id)
      .single();

    const updateData: Record<string, unknown> = {
      og_title: ai_title || og_title,
      og_description: ai_description || og_description,
      og_image_url,
    };

    if (booking_data) {
      updateData.booking_data = booking_data;
    }

    // Update type only if current is "link" or "other"
    if (
      ai_type &&
      ai_type !== "other" &&
      current &&
      (current.type === "link" || current.type === "other")
    ) {
      updateData.type = ai_type;
    }

    const { error } = await supabaseAdmin
      .from("attachments")
      .update(updateData)
      .eq("id", attachment_id);

    if (error) throw error;

    return new Response(
      JSON.stringify({ og_title: updateData.og_title, og_description: updateData.og_description, og_image_url, booking_data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

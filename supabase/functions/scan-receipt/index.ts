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
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: true, message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: true, message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return new Response(JSON.stringify({ error: true, message: "Missing image" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: true, message: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect media type from base64 header or default to jpeg
    let mediaType = "image/jpeg";
    let base64Data = image;
    const dataUrlMatch = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (dataUrlMatch) {
      mediaType = dataUrlMatch[1];
      base64Data = dataUrlMatch[2];
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: "You extract structured data from receipt images.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64Data },
              },
              {
                type: "text",
                text: `Extract from this receipt and return ONLY valid JSON:
{ "title": "", "amount": 0, "currency": "", "date": "", "category": "", "notes": "", "line_items": [] }

- title: merchant name or description
- amount: total as number, no currency symbol
- currency: 3-letter ISO code or null
- date: YYYY-MM-DD or null
- category: food | transport | accommodation | activities | shopping | other
- notes: A concise, useful summary using bullet points (one per line, starting with "\u2022 "). Focus on WHAT was purchased/booked — not fees or totals. Examples:
  For a restaurant receipt: "\u2022 2x Pad Thai\n\u2022 1x Green Curry\n\u2022 3x Chang Beer"
  For a ticket: "\u2022 2x 5-Day Full Pass\n\u2022 Dec 3\u20137, 2026\n\u2022 Siam Country Club, Chonburi"
  For shopping: "\u2022 Sunscreen SPF50\n\u2022 Mosquito repellent\n\u2022 2x Water bottle"
  Only include the most important 2-5 items. null if nothing noteworthy beyond what title/amount already say.
- line_items: array of individual items on the receipt. Each item is an object:
  { "name": "item description", "quantity": 1, "unit_price": 0, "total_price": 0 }
  - name: item description as shown on receipt
  - quantity: number of units (default 1 if not stated)
  - unit_price: price per unit as number, null if not determinable
  - total_price: line total as number
  Return an empty array [] if no individual items are visible.

Return null for any field you cannot determine.
Return ONLY the JSON object, no other text.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", response.status, errText);
      return new Response(JSON.stringify({ success: false, error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text ?? "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ success: false, error: "Could not parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Track AI usage server-side
    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await svcClient.from("analytics_events").insert({
      event_name: "ai_receipt_scan",
      user_id: user.id,
      properties: { source: "edge_function" },
    });

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("scan-receipt error:", err);
    return new Response(JSON.stringify({ success: false, error: err?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

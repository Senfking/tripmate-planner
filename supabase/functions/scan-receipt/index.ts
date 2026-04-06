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
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: `You are a precise receipt OCR assistant. You extract structured data from receipt images.
Key rules:
- Read every character carefully. Do NOT confuse table numbers, order numbers, or reference codes with the merchant name.
- The merchant/restaurant name is typically the business name printed prominently, or derivable from an email/website on the receipt.
- Dates on receipts outside the US are almost always DD/MM/YYYY. Parse accordingly.
- For amounts, handle thousand separators (dots or commas depending on locale). The TOTAL is the final amount the customer pays.
- Extract EVERY individual line item visible on the receipt. Each distinct printed line = one line item.
- If the same item appears on multiple lines (e.g. "1 COKE ZERO 25,000" then "2 COKE ZERO 50,000"), treat them as SEPARATE line items — do not merge them.`,
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

Field definitions:
- title: The merchant or business name ONLY. Do NOT include table numbers, order numbers, cashier names, or codes. If no clear merchant name is printed, look for website/email domains on the receipt.
- amount: The final TOTAL the customer pays, as a number. No currency symbols. Handle thousand separators correctly (e.g. 317,625 = 317625, not 317.625).
- currency: 3-letter ISO currency code. Infer from context (e.g. IDR for Indonesian receipts, THB for Thai, EUR for European).
- date: YYYY-MM-DD format. Remember: most non-US receipts use DD/MM/YYYY format. A receipt showing "06/04/2026" in Indonesia means June 4th is WRONG — it means April 6th (2026-04-06).
- category: food | transport | accommodation | activities | shopping | other
- notes: A concise summary using bullet points (one per line, starting with "• "). Focus on WHAT was purchased. Only the most important 2-5 items. null if nothing noteworthy.
  Examples:
  For a restaurant: "• 2x Pad Thai\n• 1x Green Curry\n• 3x Chang Beer"
  For a ticket: "• 2x 5-Day Full Pass\n• Dec 3–7, 2026"
- line_items: Array of EVERY individual line item printed on the receipt. Each object:
  { "name": "item description", "quantity": 1, "unit_price": 0, "total_price": 0 }
  - name: item description as shown on receipt (clean up abbreviations if obvious)
  - quantity: number of units for THIS line (read from the receipt, default 1)
  - unit_price: price per unit as number (null if not shown or not determinable)
  - total_price: line total as number
  IMPORTANT: Do NOT merge lines. If the receipt shows "1 COKE ZERO 25,000" and "2 COKE ZERO 50,000" as two separate printed lines, return TWO separate line items.
  Also include tax, service charge, and other fee lines as separate items.
  Return [] if no individual items are visible.

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

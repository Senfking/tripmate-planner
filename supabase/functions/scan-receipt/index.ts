import { corsHeaders } from "@supabase/supabase-js/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return new Response(
        JSON.stringify({ error: true, message: "Missing image" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: true, message: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
        max_tokens: 512,
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
{ "title": "", "amount": 0, "currency": "", "date": "", "category": "" }

- title: merchant name or description
- amount: total as number, no currency symbol
- currency: 3-letter ISO code or null
- date: YYYY-MM-DD or null
- category: food | transport | accommodation | activities | shopping | other

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
      return new Response(
        JSON.stringify({ error: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const text = result.content?.[0]?.text ?? "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify(parsed),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("scan-receipt error:", err);
    return new Response(
      JSON.stringify({ error: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

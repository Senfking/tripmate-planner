import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const body = await req.json();
    const { type, trip_start_date } = body;

    if (!type || !["file", "text", "url"].includes(type)) {
      return jsonResponse({ success: false, error: "type must be 'file', 'text', or 'url'" }, 400);
    }

    // Build the Claude message content blocks
    const contentBlocks: Array<Record<string, unknown>> = [];

    if (type === "file") {
      const { file_path, file_type } = body;
      if (!file_path || !file_type) {
        return jsonResponse({ success: false, error: "file_path and file_type required for type=file" }, 400);
      }

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: fileData, error: dlError } = await supabaseAdmin.storage
        .from("trip-attachments")
        .download(file_path);
      if (dlError || !fileData) {
        return jsonResponse({ success: false, error: `Storage download failed: ${dlError?.message}` }, 500);
      }

      const arrayBuf = await fileData.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      const isPdf = file_type === "application/pdf";
      contentBlocks.push(
        isPdf
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } }
          : { type: "image", source: { type: "base64", media_type: file_type, data: base64Data } }
      );
    } else if (type === "text") {
      const { content } = body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return jsonResponse({ success: false, error: "content is required for type=text" }, 400);
      }
      contentBlocks.push({ type: "text", text: `Here is the itinerary text to parse:\n\n${content}` });
    } else if (type === "url") {
      const { url } = body;
      if (!url || typeof url !== "string") {
        return jsonResponse({ success: false, error: "url is required for type=url" }, 400);
      }
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "TripCrew-ItineraryParser/1.0" },
          redirect: "follow",
        });
        if (!res.ok) {
          return jsonResponse({ success: false, error: `Failed to fetch URL (${res.status})` }, 400);
        }
        const pageText = await res.text();
        const trimmed = pageText.slice(0, 50000); // limit context size
        contentBlocks.push({ type: "text", text: `Here is the content fetched from ${url}:\n\n${trimmed}` });
      } catch (fetchErr) {
        return jsonResponse({ success: false, error: `Failed to fetch URL: ${(fetchErr as Error).message}` }, 400);
      }
    }

    // Build extraction prompt
    const dateContext = trip_start_date
      ? `The trip starts on ${trip_start_date}. Use this to resolve relative dates like "Day 1" = ${trip_start_date}, "Day 2" = the next day, etc.`
      : `No trip start date is known. If dates are relative (e.g. "Day 1"), you cannot resolve them — skip items with no determinable date.`;

    const extractionPrompt = `Extract ALL itinerary items from this document/text. Return ONLY a valid JSON array with no preamble, markdown, code fences, or explanation.

Each item in the array must have these fields:
- "title": string (required — the activity or event name)
- "day_date": string (required — YYYY-MM-DD format)
- "start_time": string | null (HH:MM 24h format, or null if unknown)
- "end_time": string | null (HH:MM 24h format, or null if unknown)
- "location_text": string | null (venue, address, or place name, or null)
- "status": string ("confirmed" if clearly booked/reserved, "idea" otherwise)
- "notes": string | null (any extra details worth preserving, or null)

Rules:
- ${dateContext}
- If a field cannot be determined, use null. Do NOT guess.
- If an item has no identifiable date, skip it entirely.
- Parse ALL items found. Do not summarise, truncate, or omit any.
- Return ONLY the JSON array. No other text.`;

    contentBlocks.push({ type: "text", text: extractionPrompt });

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errText);
      return jsonResponse({ success: false, error: `AI parsing failed (${anthropicRes.status})` }, 500);
    }

    const anthropicData = await anthropicRes.json();
    const textContent = anthropicData.content?.find((c: { type: string }) => c.type === "text")?.text || "";

    // Extract JSON from response (handle possible markdown code blocks)
    const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, textContent];
    let items: unknown[];
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      console.error("Failed to parse AI response:", textContent.slice(0, 500));
      return jsonResponse({ success: false, error: "Failed to parse AI response as JSON" }, 500);
    }

    return jsonResponse({ success: true, items });
  } catch (e) {
    console.error("parse-itinerary error:", e);
    return jsonResponse({ success: false, error: (e as Error).message || "Internal error" }, 500);
  }
});

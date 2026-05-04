import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUrlAllowedForFetch } from "./url-guard.ts";

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

      // Authorization: file_path must be under imports/{tripId}/... and the
      // caller must be a member of that trip. The frontend uploads to
      // `imports/${tripId}/${uuid}.${ext}`, so we extract trip_id from segment 1.
      // Without this, any signed-in user could pass an arbitrary path and have
      // the service-role client read & AI-extract someone else's attachment.
      const segments = String(file_path).split("/");
      if (segments.length < 3 || segments[0] !== "imports") {
        return jsonResponse({ success: false, error: "Invalid file_path" }, 400);
      }
      const pathTripId = segments[1];
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(pathTripId)) {
        return jsonResponse({ success: false, error: "Invalid file_path" }, 400);
      }

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: isMember, error: rpcErr } = await supabaseAdmin.rpc("is_trip_member", {
        _trip_id: pathTripId,
        _user_id: user.id,
      });
      if (rpcErr) {
        return jsonResponse({ success: false, error: "Failed to verify trip membership" }, 500);
      }
      if (!isMember) {
        return jsonResponse({ success: false, error: "Forbidden" }, 403);
      }

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
      if (!isUrlAllowedForFetch(url)) {
        return jsonResponse({ success: false, error: "URL not allowed" }, 400);
      }
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "TripCrew-ItineraryParser/1.0" },
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
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
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dateContext = trip_start_date
      ? `The trip starts on ${trip_start_date}. Use this to resolve relative dates like "Day 1" = ${trip_start_date}, "Day 2" = the next day, etc.`
      : `No trip start date is known. If dates are relative (e.g. "Day 1"), you cannot resolve them — skip items with no determinable date.`;

    const extractionPrompt = `Today's date is ${today}.

Extract ALL itinerary items from this document/text. Return ONLY a valid JSON array with no preamble, markdown, code fences, or explanation.

Each item in the array must have these fields:
- "title": string (required — the activity or event name)
- "day_date": string (required — YYYY-MM-DD format)
- "start_time": string | null (HH:MM 24h format, or null if unknown)
- "end_time": string | null (HH:MM 24h format, or null if unknown)
- "location_text": string | null (venue, address, or place name, or null)
- "status": string ("confirmed" if clearly booked/reserved, "idea" otherwise)
- "notes": string | null (any extra details worth preserving such as flight/train numbers, confirmation/booking codes, duration, terminal/gate info, carrier/airline name, seat assignments, check-in/check-out times, contact numbers, or other practical info — or null if none)

Rules:
- ${dateContext}
- If a date has no year, pick the year so the date is the nearest upcoming occurrence from today (${today}). For example, if today is 2026-04-02 and the text says "15 Jun", use 2026-06-15. If it says "10 Feb", use 2027-02-10 (since Feb 2026 already passed). If a trip_start_date is provided, prefer that year for all items in the trip.
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

    // Track AI usage server-side
    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await svcClient.from("analytics_events").insert({
      event_name: "ai_itinerary_import",
      user_id: user.id,
      properties: { input_type: type, source: "edge_function" },
    });
    if (items.length > 0) {
      await svcClient.from("analytics_events").insert({
        event_name: "ai_itinerary_import_success",
        user_id: user.id,
        properties: { items_parsed: items.length, source: "edge_function" },
      });
    }

    return jsonResponse({ success: true, items });
  } catch (e) {
    console.error("parse-itinerary error:", e);
    return jsonResponse({ success: false, error: (e as Error).message || "Internal error" }, 500);
  }
});

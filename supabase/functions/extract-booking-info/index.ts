import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildSummary(d: Record<string, unknown>): string {
  const parts: string[] = [];
  if (d.provider) parts.push(String(d.provider));
  if (d.booking_reference) parts.push(String(d.booking_reference));

  if (d.booking_type === "flight") {
    if (d.departure && d.destination) parts.push(`${d.departure}→${d.destination}`);
    if (d.departure_time) parts.push(String(d.departure_time));
  } else if (d.booking_type === "hotel") {
    if (d.check_in && d.check_out) parts.push(`${d.check_in}–${d.check_out}`);
    else if (d.check_in) parts.push(`From ${d.check_in}`);
  } else {
    if (d.check_in && d.check_out) parts.push(`${d.check_in}–${d.check_out}`);
    else if (d.check_in) parts.push(String(d.check_in));
    if (d.departure_time) parts.push(String(d.departure_time));
  }

  if (d.total_price) parts.push(String(d.total_price));

  return parts.join(" · ") || null as unknown as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { attachment_id, file_path, file_type } = await req.json();
    if (!attachment_id || !file_path || !file_type) {
      return new Response(JSON.stringify({ error: "attachment_id, file_path, file_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Download file from storage
    const { data: fileData, error: dlError } = await supabaseAdmin.storage
      .from("trip-attachments")
      .download(file_path);
    if (dlError || !fileData) {
      throw new Error(`Storage download failed: ${dlError?.message}`);
    }

    const arrayBuf = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let base64Data = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      base64Data += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    base64Data = btoa(base64Data);

    // Determine media type for Anthropic
    const isPdf = file_type === "application/pdf";
    const contentBlock = isPdf
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64Data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: file_type as "image/jpeg", data: base64Data } };

    const extractionPrompt = `Extract booking information from this document. Return ONLY a JSON object with these fields (null for anything not found):
{
  "booking_type": "flight|hotel|activity|other",
  "title": "short descriptive title e.g. Ryanair FR1234 or Park Hyatt Bangkok",
  "provider": "airline or hotel name",
  "booking_reference": "confirmation code",
  "check_in": "date string or null",
  "check_out": "date string or null",
  "departure": "airport or city or null",
  "destination": "airport or city or null",
  "departure_time": "time string or null",
  "arrival_time": "time string or null",
  "passenger_names": ["name1"] or null,
  "total_price": "price with currency or null",
  "notes": "SHORT summary (max 2-3 lines) of other important details — e.g. baggage allowance, room type, cancellation policy, meal plan, special instructions, total price breakdown. Only the most useful info. null if nothing noteworthy."
}
Return only valid JSON, no other text.`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            contentBlock,
            { type: "text", text: extractionPrompt },
          ],
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`);
    }

    const anthropicData = await anthropicRes.json();
    const textContent = anthropicData.content?.find((c: { type: string }) => c.type === "text")?.text || "";

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, textContent];
    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(jsonMatch[1].trim());
    } catch {
      throw new Error("Failed to parse extraction JSON");
    }

    // Read current type to decide whether to override
    const { data: current } = await supabaseAdmin
      .from("attachments")
      .select("type")
      .eq("id", attachment_id)
      .single();

    const summary = buildSummary(extracted);

    const updateData: Record<string, unknown> = {
      og_title: extracted.title || null,
      og_description: summary || null,
      booking_data: extracted,
    };

    // Only override type if current type is "other"
    if (current?.type === "other" && extracted.booking_type && extracted.booking_type !== "other") {
      updateData.type = extracted.booking_type;
    }

    const { error: updateError } = await supabaseAdmin
      .from("attachments")
      .update(updateData)
      .eq("id", attachment_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify(extracted),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("extract-booking-info error:", e);
    return new Response(
      JSON.stringify({}),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

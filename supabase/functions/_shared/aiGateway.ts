// Lovable AI Gateway shim with an Anthropic-compatible surface.
//
// Every AI feature in this project was written against Anthropic's
// /v1/messages API. Rather than rewriting nine edge functions, this module
// exposes `anthropicCompatFetch(url, init)` — a drop-in replacement for
// `fetch("https://api.anthropic.com/v1/messages", ...)` that:
//   1. translates the Anthropic request body to OpenAI chat-completions,
//   2. calls the Lovable AI Gateway (billed to Lovable AI credits, no
//      ANTHROPIC_API_KEY needed),
//   3. translates the response back into Anthropic's message shape.
//
// Call sites keep working unchanged: `res.ok`, `res.status`, `res.text()`,
// `res.json()` and `data.content[]` all behave as before.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Claude model -> closest Lovable AI equivalent.
//  haiku  = fast/cheap workhorse (intent parsing, ranking, short copy)
//  sonnet = stronger multimodal reasoning (receipts, bookings, PDF/HTML parsing)
export function mapModel(claudeModel: string): string {
  const m = (claudeModel || "").toLowerCase();
  if (m.includes("opus")) return "google/gemini-3.1-pro-preview";
  if (m.includes("sonnet")) return "google/gemini-2.5-pro";
  return "google/gemini-3.6-flash";
}

type AnthropicBlock = Record<string, any>;

function systemToText(system: unknown): string {
  if (!system) return "";
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system
      .map((b: AnthropicBlock) => (typeof b === "string" ? b : b?.text || ""))
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

function contentToOpenAI(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: Record<string, unknown>[] = [];
  for (const block of content as AnthropicBlock[]) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text") {
      parts.push({ type: "text", text: block.text ?? "" });
    } else if (block.type === "image") {
      const src = block.source || {};
      const url =
        src.type === "url"
          ? src.url
          : `data:${src.media_type || "image/jpeg"};base64,${src.data}`;
      parts.push({ type: "image_url", image_url: { url } });
    } else if (block.type === "document") {
      // Anthropic PDF blocks — pass the text if present, otherwise skip.
      if (block.source?.type === "text" && block.source?.data) {
        parts.push({ type: "text", text: String(block.source.data) });
      }
    }
  }

  // Plain single text part -> plain string (widest provider support).
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
  return parts;
}

function anthropicError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ type: "error", error: { type: "api_error", message } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Drop-in replacement for `fetch("https://api.anthropic.com/v1/messages", init)`.
 * The URL argument is ignored; only `init.body` and `init.signal` are used.
 */
export async function anthropicCompatFetch(
  _url: string,
  init: RequestInit = {},
): Promise<Response> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) {
    return anthropicError(500, "LOVABLE_API_KEY is not configured");
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
  } catch {
    return anthropicError(400, "Invalid JSON request body");
  }

  const messages: Record<string, unknown>[] = [];
  const systemText = systemToText(body.system);
  if (systemText) messages.push({ role: "system", content: systemText });

  for (const m of (body.messages || []) as AnthropicBlock[]) {
    messages.push({ role: m.role, content: contentToOpenAI(m.content) });
  }

  const payload: Record<string, unknown> = {
    model: mapModel(body.model),
    messages,
  };
  if (typeof body.max_tokens === "number") payload.max_tokens = body.max_tokens;
  if (typeof body.temperature === "number") payload.temperature = body.temperature;

  // Anthropic tool-use -> OpenAI function calling
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    payload.tools = body.tools.map((t: AnthropicBlock) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.input_schema || { type: "object", properties: {} },
      },
    }));
    const tc = body.tool_choice;
    if (tc?.type === "tool" && tc.name) {
      payload.tool_choice = { type: "function", function: { name: tc.name } };
    } else if (tc?.type === "any") {
      payload.tool_choice = "required";
    }
  }

  let res: Response;
  try {
    res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify(payload),
      signal: init.signal ?? null,
    });
  } catch (e) {
    // Preserve AbortError semantics for callers that use timeouts.
    throw e;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return new Response(
      JSON.stringify({
        type: "error",
        error: { type: "api_error", message: `Lovable AI Gateway ${res.status}: ${text.slice(0, 800)}` },
      }),
      { status: res.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const data = await res.json().catch(() => null);
  const choice = data?.choices?.[0];
  if (!choice) {
    return anthropicError(502, "Lovable AI Gateway returned no completion");
  }

  const content: AnthropicBlock[] = [];
  const msg = choice.message || {};

  if (Array.isArray(msg.tool_calls)) {
    for (const call of msg.tool_calls) {
      let input: unknown = {};
      try {
        input = JSON.parse(call?.function?.arguments || "{}");
      } catch {
        input = {};
      }
      content.push({
        type: "tool_use",
        id: call?.id || `toolu_${crypto.randomUUID()}`,
        name: call?.function?.name,
        input,
      });
    }
  }

  if (typeof msg.content === "string" && msg.content.length > 0) {
    content.push({ type: "text", text: msg.content });
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part?.type === "text" && part.text) content.push({ type: "text", text: part.text });
    }
  }

  const anthropicShaped = {
    id: data?.id || `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    model: body.model,
    content,
    stop_reason: content.some((c) => c.type === "tool_use") ? "tool_use" : "end_turn",
    usage: {
      input_tokens: data?.usage?.prompt_tokens ?? 0,
      output_tokens: data?.usage?.completion_tokens ?? 0,
    },
  };

  return new Response(JSON.stringify(anthropicShaped), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// supabase-js wraps Edge Function non-2xx responses in a FunctionsHttpError
// whose `.message` is always the unhelpful "Edge Function returned a non-2xx
// status code". The structured body the Edge Function actually returned lives
// on `.context` (the raw Response). This helper reads it, prefers the
// PR #168-style { error, step, message } shape, and falls back gracefully.
//
// We duck-type rather than `instanceof FunctionsHttpError` so this works across
// supabase-js minor versions without an extra import surface.

const GENERIC_NON_2XX = "Edge Function returned a non-2xx status code";

export interface ParsedEdgeError {
  message: string;
  step?: string;
  code?: string;
  raw?: unknown;
}

function hasResponseLike(v: unknown): v is { clone?: () => Response; text: () => Promise<string> } {
  return !!v && typeof (v as { text?: unknown }).text === "function";
}

export async function parseEdgeError(
  err: unknown,
  fallback: string,
): Promise<ParsedEdgeError> {
  // FunctionsHttpError stores the raw Response on `.context`. Some other
  // clients use `.response`. Try both before giving up.
  const ctx =
    (err as { context?: unknown })?.context ??
    (err as { response?: unknown })?.response;

  let body: unknown = null;
  if (hasResponseLike(ctx)) {
    try {
      const source = typeof ctx.clone === "function" ? ctx.clone() : (ctx as Response);
      const text = await source.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
    } catch {
      body = null;
    }
  }

  if (body && typeof body === "object") {
    const b = body as { error?: unknown; step?: unknown; message?: unknown };
    const stepStr = typeof b.step === "string" ? b.step : undefined;
    const codeStr = typeof b.error === "string" ? b.error : undefined;
    let msgStr: string;
    if (typeof b.message === "string" && b.message.trim().length > 0) {
      // PR #168 shape: { error: "trip_build_failed", step, message }
      msgStr = b.message;
    } else if (codeStr && codeStr.length > 0) {
      // Legacy shape: { error: "<human readable>" } (e.g. 400 validations)
      msgStr = codeStr;
    } else {
      msgStr = fallback;
    }
    if (stepStr || codeStr) {
      console.warn("[parseEdgeError] structured edge-function error", {
        step: stepStr,
        code: codeStr,
        raw: body,
      });
    }
    return { message: msgStr, step: stepStr, code: codeStr, raw: body };
  }

  // No structured body. If the underlying Error has a useful message that
  // isn't the generic supabase-js wrapper, surface it; otherwise fall back.
  const errMsg = (err as { message?: unknown })?.message;
  if (
    typeof errMsg === "string" &&
    errMsg.trim().length > 0 &&
    errMsg !== GENERIC_NON_2XX
  ) {
    return { message: errMsg, raw: body ?? errMsg };
  }

  if (body) {
    console.warn("[parseEdgeError] non-JSON edge-function response body:", body);
  }
  return { message: fallback, raw: body };
}

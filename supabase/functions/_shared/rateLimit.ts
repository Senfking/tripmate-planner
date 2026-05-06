// Per-user-per-endpoint hourly rate limiter, backed by ai_usage_counters
// (migration 20260506230000). Call checkAndIncrement at the top of any
// authenticated AI endpoint; on `allowed: false` return rateLimitResponse(...)
// to send a 429 with Retry-After.
//
// Failure mode: if the counter RPC fails (e.g. transient DB hiccup) the
// helper fails OPEN — better to serve than to lock everyone out from a
// counter outage. The cap is a cost control, not a security boundary.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

export async function checkAndIncrement(
  serviceRoleClient: SupabaseClient,
  userId: string,
  endpoint: string,
  limit: number,
): Promise<RateLimitResult> {
  const windowStartMs = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const windowStart = new Date(windowStartMs);
  const { data, error } = await serviceRoleClient.rpc("bump_ai_usage_counter", {
    _user_id: userId,
    _endpoint: endpoint,
    _window: windowStart.toISOString(),
  });

  if (error) {
    console.warn("[rateLimit] bump_ai_usage_counter failed; failing open:", error);
    return { allowed: true, count: 0, limit, retryAfterSeconds: 0 };
  }

  const count = typeof data === "number" ? data : 0;
  if (count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStartMs + WINDOW_MS - Date.now()) / 1000),
    );
    return { allowed: false, count, limit, retryAfterSeconds };
  }
  return { allowed: true, count, limit, retryAfterSeconds: 0 };
}

export function rateLimitResponse(
  corsHeaders: Record<string, string>,
  result: RateLimitResult,
): Response {
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: `Hourly limit of ${result.limit} reached for this feature. Try again in about ${Math.ceil(result.retryAfterSeconds / 60)} minute(s).`,
      retry_after_seconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );
}

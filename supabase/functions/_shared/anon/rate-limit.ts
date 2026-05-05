// Anonymous trip generation guards — UUID validation, client-IP extraction,
// and the two-tier rate limit (session + IP). All functions here are pure or
// take an injectable client/now so they can be unit-tested without spinning
// up Supabase. The Edge Function composes them; the tests cover them in
// isolation.

// ---------------------------------------------------------------------------
// Limits
//
// Session-id is the primary throttle (1 generation / 24h). IP is a defensive
// secondary check (3 generations / 24h) to make a clear-localStorage retry
// only marginally cheaper than signing up. If the proxy doesn't expose a
// stable IP, IP enforcement is skipped — see extractClientIp + the `ip_skipped`
// console.warn emitted by the Edge Function.
// ---------------------------------------------------------------------------

export const ANON_SESSION_LIMIT_PER_DAY = 1;
export const ANON_IP_LIMIT_PER_DAY = 3;

// RFC 4122 v4 UUID. We expect clients to generate these via crypto.randomUUID()
// — both Chrome and Safari emit a v4. This regex is intentionally strict:
// passing arbitrary strings as session ids would bloat the index and blur the
// rate-limit semantics.
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidAnonSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// Client IP extraction
//
// Header preference order:
//   1. cf-connecting-ip   — Cloudflare exposes the true client IP here.
//   2. x-forwarded-for    — first entry is the originating client when the
//                           proxy chain is well-behaved. Last entry would be
//                           the immediate upstream — never use it for rate
//                           limiting.
//   3. x-real-ip          — common nginx convention.
//
// Returns null if no header parses to a non-empty value. The caller logs a
// `ip_skipped` warn so we know how often the Lovable proxy stack hides the
// client IP — if that's frequent we'll have to revisit IP enforcement.
// ---------------------------------------------------------------------------

export function extractClientIp(req: Request): string | null {
  const headers = req.headers;
  const cf = headers.get("cf-connecting-ip");
  if (cf && cf.trim()) return normalizeIp(cf.trim());

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return normalizeIp(first);
  }

  const real = headers.get("x-real-ip");
  if (real && real.trim()) return normalizeIp(real.trim());

  return null;
}

// Strip any IPv6 zone identifier ("%eth0") that a misbehaving proxy might
// leave on. Postgres `inet` accepts well-formed IPv4 and IPv6 strings; we
// still bottle the cast in a try/catch on the DB side via the RPC — but
// pre-trimming gives the best chance of a clean cast.
function normalizeIp(raw: string): string {
  const idx = raw.indexOf("%");
  return idx >= 0 ? raw.slice(0, idx) : raw;
}

// ---------------------------------------------------------------------------
// Rate-limit decision
//
// Session checked first (cheaper indexed lookup; also the dominant axis for a
// real user). IP checked second so a fresh-localStorage retry from the same
// network can still be caught.
//
// Returned reasons:
//   "session" — session over its limit.
//   "ip"      — session ok, but IP over its limit.
//
// `kind: "ok"` means caller may proceed.
// ---------------------------------------------------------------------------

export type RateLimitDecision =
  | { kind: "ok" }
  | { kind: "blocked"; reason: "session" | "ip"; count: number; limit: number };

export interface RateLimitClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

// Inject the count fetchers so tests don't have to mock supabase-js.
export interface RateLimitDeps {
  countSession: (anonSessionId: string) => Promise<number>;
  countIp: (ip: string) => Promise<number>;
}

export function makeRateLimitDeps(client: RateLimitClient): RateLimitDeps {
  return {
    countSession: async (id) => {
      const { data, error } = await client.rpc(
        "count_anon_generations_last_day",
        { p_anon_session_id: id },
      );
      if (error) {
        // Fail-open on a count error: we don't want a transient DB hiccup to
        // wall every anon visitor. The single anonymous_trips insert at the
        // end of the pipeline still happens, so cost is bounded.
        console.warn(
          "[anon_rate_limit] count_anon_generations_last_day failed:",
          error.message,
        );
        return 0;
      }
      return typeof data === "number" ? data : 0;
    },
    countIp: async (ip) => {
      const { data, error } = await client.rpc(
        "count_ip_anon_generations_last_day",
        { p_ip: ip },
      );
      if (error) {
        console.warn(
          "[anon_rate_limit] count_ip_anon_generations_last_day failed:",
          error.message,
        );
        return 0;
      }
      return typeof data === "number" ? data : 0;
    },
  };
}

export async function decideAnonRateLimit(
  deps: RateLimitDeps,
  anonSessionId: string,
  ip: string | null,
): Promise<RateLimitDecision> {
  const sessionCount = await deps.countSession(anonSessionId);
  if (sessionCount >= ANON_SESSION_LIMIT_PER_DAY) {
    return {
      kind: "blocked",
      reason: "session",
      count: sessionCount,
      limit: ANON_SESSION_LIMIT_PER_DAY,
    };
  }
  if (ip) {
    const ipCount = await deps.countIp(ip);
    if (ipCount >= ANON_IP_LIMIT_PER_DAY) {
      return {
        kind: "blocked",
        reason: "ip",
        count: ipCount,
        limit: ANON_IP_LIMIT_PER_DAY,
      };
    }
  }
  return { kind: "ok" };
}

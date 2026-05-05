// Stable anon session UUID v4 persisted in localStorage. Generated on first
// access; reused forever (or until the user clears storage). Sent as
// `anon_session_id` to anon-friendly Edge Functions (generate-trip-itinerary,
// claim-anonymous-trip).

const KEY = "junto_anon_session_id";

function uuidv4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (older Safari/embedded webviews).
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getAnonSessionId(): string {
  if (typeof window === "undefined") return uuidv4();
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const fresh = uuidv4();
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return uuidv4();
  }
}

export function peekAnonSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearAnonSessionId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Anonymous rate-limit marker. When the server rejects a generation with
// 429/anon_limit, we stash the timestamp locally so the next submit on the
// homepage can short-circuit the streaming UI and just open the signup modal
// over the blurred homepage — no black "generating" screen, no second 429.
// 24h matches ANON_SESSION_LIMIT_PER_DAY on the server.
// ---------------------------------------------------------------------------

const RATE_LIMIT_KEY = "junto_anon_rate_limited_at";
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function markAnonRateLimited(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RATE_LIMIT_KEY, String(Date.now()));
  } catch {
    /* noop */
  }
}

export function isAnonRateLimited(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    if (Date.now() - ts > RATE_LIMIT_WINDOW_MS) {
      window.localStorage.removeItem(RATE_LIMIT_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearAnonRateLimited(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RATE_LIMIT_KEY);
  } catch {
    /* noop */
  }
}

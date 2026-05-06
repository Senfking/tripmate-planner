import * as Sentry from "@sentry/react";

// Sentry is opt-in: it only initializes when (a) VITE_SENTRY_DSN is set and
// (b) the user has consented. EU users default to OFF (timezone Europe/*),
// non-EU default to ON; either can be flipped by the localStorage flag set
// from a future Settings UI. False-positive EU detection defaults to OFF —
// safer to drop telemetry than to send it without consent.

const CONSENT_STORAGE_KEY = "junto.sentry_consent"; // "1" | "0" | absent

let initialized = false;

function isLikelyEU(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.startsWith("Europe/");
  } catch {
    // If timezone detection fails, default to treating the user as EU so we
    // err toward not sending telemetry without consent.
    return true;
  }
}

export function getSentryConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage?.getItem(CONSENT_STORAGE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch { /* localStorage may be unavailable */ }
  return !isLikelyEU();
}

export function setSentryConsent(consented: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(CONSENT_STORAGE_KEY, consented ? "1" : "0");
  } catch { /* noop */ }
}

// ─── PII scrubbing ────────────────────────────────────────────────────────────

const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/gi;
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function scrubString(s: string): string {
  return s.replace(EMAIL_REGEX, "[email]").replace(UUID_REGEX, "[uuid]");
}

function scrubMaybeString<T>(v: T): T {
  return typeof v === "string" ? (scrubString(v) as unknown as T) : v;
}

function scrubData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = typeof v === "string" ? scrubString(v) : v;
  }
  return out;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  if (!getSentryConsent()) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: typeof __BUILD_TS__ !== "undefined" ? __BUILD_TS__ : undefined,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event, hint) {
      // Supabase Auth's cross-tab lock fires this when another tab takes
      // over the auth-token mutex. Expected, not an error worth paging on.
      const message =
        (hint?.originalException as Error | undefined)?.message ??
        event.message ??
        "";
      if (typeof message === "string" && /Lock '.*' was released because another request stole it/i.test(message)) {
        return null;
      }

      // ─── Scrub PII before send ──────────────────────────────────────────
      // Keep: stack traces, error class names, route paths, build/version
      //       tags, user_id tag.
      // Drop / mask: email addresses anywhere, free-text breadcrumb
      //       messages, trip / user UUIDs in URLs and string fields.

      if (typeof event.message === "string") {
        event.message = scrubString(event.message);
      }

      // Sentry's user object can carry email/username if instrumentation is
      // ever added. Ensure we never send those.
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }

      if (event.request) {
        if (typeof event.request.url === "string") {
          event.request.url = scrubString(event.request.url);
        }
        if (typeof event.request.query_string === "string") {
          event.request.query_string = scrubString(event.request.query_string);
        }
      }

      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((b) => ({
          ...b,
          message: scrubMaybeString(b.message),
          data: scrubData(b.data as Record<string, unknown> | undefined),
        }));
      }

      if (event.exception?.values) {
        event.exception.values = event.exception.values.map((v) => ({
          ...v,
          value: scrubMaybeString(v.value),
        }));
      }

      // Free-text "extra" fields can hold stringified payloads. Walk one level.
      if (event.extra) {
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(event.extra)) {
          extra[k] = typeof v === "string" ? scrubString(v) : v;
        }
        event.extra = extra;
      }

      return event;
    },
  });

  initialized = true;
}

function getDisplayMode(): "standalone" | "browser" {
  if (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) {
    return "standalone";
  }
  return "browser";
}

// Common tags every event should carry. Kept in one place so all capture sites
// stay consistent. user_id is set by callers that have access to auth context.
function commonTags(userId?: string | null): Record<string, string | boolean> {
  const tags: Record<string, string | boolean> = {
    route: typeof window !== "undefined" ? window.location.pathname : "",
    display_mode: getDisplayMode(),
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
  };
  if (userId) tags.user_id = userId;
  return tags;
}

export interface SupabaseFailureExtras {
  op?: string;
  retried?: boolean;
  code?: string | null;
  status?: number | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
  name?: string | null;
  user_id?: string | null;
  /** Additional context (trip_id, expense_id, mutation_key, …) */
  [key: string]: unknown;
}

export function captureSupabaseFailure(error: unknown, extras: SupabaseFailureExtras = {}): void {
  if (!initialized) return;

  // Skip noise we don't want in Sentry:
  // - offline failures (the retry layer handles these on reconnect)
  // - expected auth failures (auth flow surfaces these to the user)
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (extras.status === 401 || extras.status === 403) return;

  const { user_id, ...rest } = extras;
  Sentry.captureException(error, {
    tags: commonTags(user_id ?? null),
    extra: rest,
  });
}

export function captureReactError(
  error: unknown,
  componentStack: string | null | undefined,
  userId?: string | null,
): void {
  if (!initialized) return;
  Sentry.captureException(error, {
    tags: commonTags(userId ?? null),
    contexts: {
      react: { componentStack: componentStack ?? "" },
    },
  });
}

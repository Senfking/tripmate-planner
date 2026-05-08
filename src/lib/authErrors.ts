// Maps Supabase auth errors to friendly, user-facing messages.
// Reference: https://supabase.com/docs/guides/auth/debugging/error-codes
//
// Supabase auth errors usually carry a `code` field and an HTTP `status`. Some
// older paths only have `message`. We try `code` first, then fall back to
// pattern-matching the message, then to a generic copy with a support link.

import * as Sentry from "@sentry/react";

export interface NormalizedAuthError {
  /** User-facing copy. Safe to render in a toast or inline error block. */
  message: string;
  /** Machine-readable code we resolved (or "unknown"). */
  code: string;
  /** HTTP status if available. */
  status: number | null;
  /** Raw message from Supabase, useful for debugging. */
  rawMessage: string | null;
}

const SUPPORT_HREF = "mailto:hello@junto.pro";

const FRIENDLY: Record<string, string> = {
  weak_password:
    "That password isn't strong enough. Try a longer password with a mix of letters, numbers, and symbols.",
  email_exists:
    "An account with this email already exists. Try signing in instead.",
  user_already_exists:
    "An account with this email already exists. Try signing in instead.",
  invalid_credentials: "Email or password is incorrect.",
  email_not_confirmed:
    "Please check your email and confirm your account before signing in.",
  over_email_send_rate_limit:
    "Too many attempts. Please wait a few minutes and try again.",
  over_request_rate_limit:
    "Too many attempts. Please wait a few minutes and try again.",
  signup_disabled: "Signups are temporarily unavailable.",
  email_provider_disabled:
    "Email signup is temporarily unavailable. Try Google or Apple instead.",
  invalid_email: "Please enter a valid email address.",
  email_address_invalid: "Please enter a valid email address.",
  same_password:
    "Your new password must be different from your current password.",
  session_expired: "Your session expired. Please sign in again.",
  user_not_found: "No account found for that email.",
  validation_failed:
    "Some of the information you entered isn't valid. Please check and try again.",
  bad_jwt: "Your session is invalid. Please sign in again.",
  no_authorization: "Your session expired. Please sign in again.",
};

function genericFallback(rawMessage: string | null): string {
  if (rawMessage && rawMessage.length < 200) {
    // Prefer the upstream message when it's short enough to be readable.
    return `${rawMessage} If this keeps happening, contact support at hello@junto.pro.`;
  }
  return "Something went wrong. Please try again, or contact support at hello@junto.pro if it keeps happening.";
}

function detectFromMessage(msg: string): string | null {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "invalid_credentials";
  if (m.includes("email not confirmed")) return "email_not_confirmed";
  if (
    m.includes("user already registered") ||
    m.includes("already been registered") ||
    m.includes("already exists")
  )
    return "email_exists";
  if (m.includes("password") && (m.includes("weak") || m.includes("pwned") || m.includes("breach")))
    return "weak_password";
  if (m.includes("rate limit") || m.includes("too many requests"))
    return "over_request_rate_limit";
  if (m.includes("invalid email") || m.includes("email address") && m.includes("invalid"))
    return "invalid_email";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "signup_disabled";
  return null;
}

export function mapAuthError(err: unknown): NormalizedAuthError {
  const e = (err ?? {}) as Record<string, unknown>;
  const rawMessage =
    typeof e.message === "string"
      ? (e.message as string)
      : err
        ? String(err)
        : null;
  const status =
    typeof e.status === "number"
      ? (e.status as number)
      : typeof (e as any).statusCode === "number"
        ? ((e as any).statusCode as number)
        : null;

  let code: string | null =
    typeof e.code === "string" ? (e.code as string) : null;

  // Special-case: weak_password with reasons array containing "pwned"
  const reasons = (e as any).reasons ?? (e as any).weak_password?.reasons;
  const isPwned =
    Array.isArray(reasons) &&
    reasons.some((r) => typeof r === "string" && r.toLowerCase().includes("pwned"));

  if (!code && rawMessage) {
    code = detectFromMessage(rawMessage);
  }

  let message: string;
  if (code === "weak_password" && isPwned) {
    message =
      "This password has appeared in a known data breach. Please choose a different one for your security.";
  } else if (code && FRIENDLY[code]) {
    message = FRIENDLY[code];
  } else {
    message = genericFallback(rawMessage);
  }

  return {
    message,
    code: code ?? "unknown",
    status,
    rawMessage,
  };
}

// ─── Sentry capture ────────────────────────────────────────────────────────
// Auth errors are operational — we want them in Sentry regardless of analytics
// consent. We lazy-initialize a Sentry client just for these reports if the
// main initSentry() was skipped due to consent.

let authSentryInitialized = false;

function ensureAuthSentry(): boolean {
  if (authSentryInitialized) return true;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return false;

  // If a hub already exists (initSentry was called), reuse it.
  const existing = Sentry.getClient?.();
  if (existing) {
    authSentryInitialized = true;
    return true;
  }

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      release: typeof __BUILD_TS__ !== "undefined" ? __BUILD_TS__ : undefined,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      // Tag every event from this client so we can filter in Sentry UI.
      initialScope: { tags: { source: "auth_operational" } },
    });
    authSentryInitialized = true;
    return true;
  } catch {
    return false;
  }
}

export function captureAuthError(
  error: unknown,
  context: {
    flow: "signin" | "signup" | "oauth_google" | "oauth_apple" | "password_reset" | "password_update";
    normalized: NormalizedAuthError;
    extra?: Record<string, unknown>;
  },
): void {
  // Always log to console for local debugging.
  // eslint-disable-next-line no-console
  console.warn("[auth error]", context.flow, context.normalized, error);

  if (!ensureAuthSentry()) return;

  try {
    const e = (error ?? {}) as Record<string, unknown>;
    Sentry.captureException(error, {
      tags: {
        auth_flow: context.flow,
        auth_code: context.normalized.code,
        auth_status: context.normalized.status ?? "none",
        source: "auth_operational",
      },
      extra: {
        normalized: context.normalized,
        rawErrorBody: {
          name: typeof e.name === "string" ? e.name : null,
          code: typeof e.code === "string" ? e.code : null,
          status: typeof e.status === "number" ? e.status : null,
          message: typeof e.message === "string" ? e.message : null,
          details: typeof (e as any).details === "string" ? (e as any).details : null,
          hint: typeof (e as any).hint === "string" ? (e as any).hint : null,
          reasons: (e as any).reasons ?? null,
        },
        ...(context.extra ?? {}),
      },
    });
  } catch {
    // Sentry should never throw out to callers.
  }
}

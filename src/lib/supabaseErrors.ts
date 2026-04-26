// Maps raw Supabase / PostgREST / Postgres errors to user-facing messages.
// Keeps technical terms ("row-level security", status codes, SQL state) out
// of toasts. Add new mappings as real error strings surface in production.

import { toast } from "sonner";

type MaybeError = unknown;

function getMessage(err: MaybeError): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr.message === "string") return anyErr.message;
  }
  return String(err);
}

function getCode(err: MaybeError): string | undefined {
  if (err && typeof err === "object") {
    const code = (err as Record<string, unknown>).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function getStatus(err: MaybeError): number | undefined {
  if (err && typeof err === "object") {
    const status = (err as Record<string, unknown>).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

// Returns true when the error is caused by an expired/missing JWT or a
// row-level security violation — both manifest as a PostgREST 401/403 or the
// "new row violates row-level security policy" / "permission denied" wording.
export function isAuthOrRlsError(err: MaybeError): boolean {
  const msg = getMessage(err).toLowerCase();
  const code = getCode(err);
  const status = getStatus(err);

  if (status === 401 || status === 403) return true;
  // 28000 = invalid_authorization_specification, PGRST301 = JWT expired (PostgREST)
  // 42501 (insufficient_privilege) is intentionally excluded: it fires for ANY
  // RLS violation (e.g. missing trip_id), not just auth failures.
  if (code === "28000" || code === "PGRST301") return true;
  if (
    msg.includes("row-level security") ||
    msg.includes("row level security") ||
    msg.includes("jwt expired") ||
    msg.includes("jwt is expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("permission denied")
  ) return true;
  return false;
}

// Produces a user-friendly message. Falls back to a provided default when the
// raw error is generic or unhelpful. Never leaks "row-level security" wording.
//
// The raw error is also logged to the console so DevTools retains the
// underlying cause. Mutation errors are additionally reported through
// QueryClient's MutationCache.onError (see App.tsx) — this console log
// covers the try/catch call sites that never pass through React Query.
export function friendlyErrorMessage(err: MaybeError, fallback: string): string {
  const raw = getMessage(err);
  if (raw) {
    // eslint-disable-next-line no-console
    console.warn("[supabase error]", raw, {
      code: (err as any)?.code,
      status: (err as any)?.status,
      details: (err as any)?.details,
      hint: (err as any)?.hint,
      name: (err as any)?.name,
      fallback,
      fullError: err,
    });
  }
  if (!raw) return fallback;

  if (isAuthOrRlsError(err)) {
    return "Your session expired. Please refresh the page and try again.";
  }

  const lower = raw.toLowerCase();
  if (lower.includes("network") || lower.includes("failed to fetch")) {
    return "Network error. Check your connection and try again.";
  }
  if (lower.includes("duplicate key")) {
    return "This item already exists.";
  }
  if (lower.includes("violates check constraint")) {
    return "Some values are invalid. Please check the form and try again.";
  }
  if (lower.includes("violates foreign key")) {
    return "Referenced item no longer exists. Please refresh and try again.";
  }

  // Fall back to caller-provided message rather than leaking the raw error.
  return fallback;
}

// Compact "code · status · message" string from a Supabase/PostgREST error
// for the toast description. Returns undefined if no useful detail is
// available (so the caller can omit the description entirely).
export function technicalErrorSummary(err: MaybeError): string | undefined {
  if (!err) return undefined;
  const code = getCode(err);
  const status = getStatus(err);
  const message = getMessage(err);
  const parts: string[] = [];
  if (code) parts.push(`code ${code}`);
  if (status) parts.push(`status ${status}`);
  if (message) parts.push(message.length > 180 ? message.slice(0, 180) + "…" : message);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// Replaces `toast.error(friendlyErrorMessage(e, "Failed to X"))` everywhere.
// Shows the friendly message as the title, the technical summary
// (code/status/message) as the description, and a "Copy" action that
// copies the full message to clipboard. Always shows the description so
// developers and testers can diagnose without a console — sonner toasts
// auto-dismiss within seconds anyway.
export function showErrorToast(err: MaybeError, fallback: string): void {
  const friendly = friendlyErrorMessage(err, fallback);
  const technical = technicalErrorSummary(err);

  toast.error(friendly, {
    description: technical,
    duration: 6000,
    action: technical
      ? {
          label: "Copy",
          onClick: () => {
            try {
              navigator.clipboard?.writeText(technical);
            } catch {
              // ignore — clipboard may be unavailable in some webviews
            }
          },
        }
      : undefined,
  });
}

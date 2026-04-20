// Maps raw Supabase / PostgREST / Postgres errors to user-facing messages.
// Keeps technical terms ("row-level security", status codes, SQL state) out
// of toasts. Add new mappings as real error strings surface in production.

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
  // Postgres error codes: 42501 = insufficient_privilege, 28000 = invalid_authorization_specification
  if (code === "42501" || code === "28000" || code === "PGRST301") return true;
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
export function friendlyErrorMessage(err: MaybeError, fallback: string): string {
  const raw = getMessage(err);
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

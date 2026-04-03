/**
 * Maps raw backend/network error messages to user-friendly strings.
 */
export function friendlyError(raw: string | undefined | null): string {
  if (!raw) return "Something went wrong. Please try again.";

  const msg = raw.toLowerCase();

  // Auth-specific
  if (msg.includes("invalid login credentials"))
    return "Incorrect email or password. Please try again.";

  if (msg.includes("user already registered") || msg.includes("already been registered"))
    return "An account with this email already exists. Please sign in instead.";

  if (msg.includes("password") && (msg.includes("at least") || msg.includes("too short") || msg.includes("characters")))
    return "Password must be at least 6 characters.";

  if (msg.includes("email") && (msg.includes("invalid") || msg.includes("not valid") || msg.includes("unable to validate")))
    return "Please enter a valid email address.";

  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("request this after"))
    return "Too many attempts. Please wait a moment and try again.";

  if (msg.includes("signups not allowed") || msg.includes("signup is disabled"))
    return "Signups are currently disabled. Please try again later.";

  if (msg.includes("email not confirmed"))
    return "Please check your email and confirm your account before signing in.";

  // RLS / permission
  if (msg.includes("row-level security") || msg.includes("permission denied") || msg.includes("insufficient_privilege"))
    return "Something went wrong. Please try again or contact support.";

  // Network
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network request failed") || msg.includes("no internet"))
    return "No internet connection. Please check your connection and try again.";

  // Duplicate / unique constraint
  if (msg.includes("duplicate") || msg.includes("already exists") || msg.includes("unique constraint"))
    return "This already exists. Please try a different name.";

  // Foreign key
  if (msg.includes("foreign key") || msg.includes("violates foreign key"))
    return "Something went wrong. Please try again or contact support.";

  // Fallback — pass through the original message so the user sees what actually went wrong
  return raw;
}

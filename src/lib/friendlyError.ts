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

  // Fallback
  return "Something went wrong. Please try again.";
}

// Centralized admin gating. The app has no `profiles.is_admin` column —
// admin access is hardcoded by user id (overridable via VITE_ADMIN_USER_ID).
// All call sites should import from here rather than duplicating the literal.

export const ADMIN_USER_ID =
  import.meta.env.VITE_ADMIN_USER_ID || "1d5b21fe-f74c-429b-8d9d-938a4f295013";

export function isAdminUser(userId: string | null | undefined): boolean {
  return !!userId && userId === ADMIN_USER_ID;
}

// Module-level mirror of the current user id, written by AuthProvider on every
// auth change. Lets non-React code (e.g. showErrorToast in lib/supabaseErrors)
// derive the current user without calling a hook — which is required for any
// component rendered by sonner's `toast.custom`, since those don't reliably
// inherit React Query / context providers from the place toast() was invoked.
let currentUserId: string | null = null;

export function setCurrentUserId(userId: string | null | undefined): void {
  currentUserId = userId ?? null;
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

export function isCurrentUserAdmin(): boolean {
  return isAdminUser(currentUserId);
}

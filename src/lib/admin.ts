// Centralized admin gating. The app has no `profiles.is_admin` column —
// admin access is hardcoded by user id (overridable via VITE_ADMIN_USER_ID).
// All call sites should import from here rather than duplicating the literal.

export const ADMIN_USER_ID =
  import.meta.env.VITE_ADMIN_USER_ID || "1d5b21fe-f74c-429b-8d9d-938a4f295013";

export function isAdminUser(userId: string | null | undefined): boolean {
  return !!userId && userId === ADMIN_USER_ID;
}

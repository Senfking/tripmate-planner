import { useContext } from "react";
import { AuthContext } from "@/contexts/AuthContext";
import { isAdminUser } from "@/lib/admin";

// Returns true when the current user matches ADMIN_USER_ID. There is no
// `profiles.is_admin` column today — if/when one is added, extend this hook
// rather than every call site.
//
// Safe to call from components rendered outside <AuthProvider> (e.g. the
// global Sonner toaster in App.tsx is mounted above the provider): falls
// back to `false` when no auth context is available.
export function useIsAdmin(): boolean {
  const ctx = useContext(AuthContext);
  return isAdminUser(ctx?.user?.id);
}

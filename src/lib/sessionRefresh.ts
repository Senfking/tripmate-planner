import { supabase } from "@/integrations/supabase/client";

// Refreshes the Supabase session when the cached access token is close to
// expiring. Browsers throttle setInterval in backgrounded tabs, so the auth
// client's autoRefreshToken interval can miss a refresh window. When the user
// brings the tab back and immediately triggers a query or mutation, the
// internal client still holds an expired JWT. PostgREST then rejects the
// request (treats it as anon), and RLS surfaces the failure as "new row
// violates row-level security policy". Calling this on `visibilitychange`
// and before critical mutations closes that race.

const DEFAULT_BUFFER_SECONDS = 60;
// Tab-return refresh uses a wider window so a mutation triggered immediately
// after the tab becomes visible doesn't race a JWT that's about to expire.
export const VISIBILITY_BUFFER_SECONDS = 300;

let inFlight: Promise<RefreshOutcome> | null = null;

export type RefreshOutcome = "fresh" | "refreshed" | "failed" | "no-session";

export async function ensureFreshSession(
  bufferSeconds: number = DEFAULT_BUFFER_SECONDS,
): Promise<RefreshOutcome> {
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<RefreshOutcome> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return "no-session";

      const expiresAt = session.expires_at;
      if (!expiresAt) return "fresh";

      const nowSec = Math.floor(Date.now() / 1000);
      const secondsLeft = expiresAt - nowSec;

      if (secondsLeft > bufferSeconds) return "fresh";

      const { error } = await supabase.auth.refreshSession();
      return error ? "failed" : "refreshed";
    } catch {
      return "failed";
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

// Force a refresh regardless of expiry — used as the recovery path when a
// request has already failed with an auth/RLS error and we want to retry.
export async function forceRefreshSession(): Promise<void> {
  try {
    await supabase.auth.refreshSession();
  } catch {
    // Swallow; caller decides how to handle the retry.
  }
}

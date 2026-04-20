import { supabase } from "@/integrations/supabase/client";

// Refreshes the Supabase session when the cached access token is close to
// expiring. Browsers throttle setInterval in backgrounded tabs, so the auth
// client's autoRefreshToken interval can miss a refresh window. When the user
// brings the tab back and immediately triggers a query or mutation, the
// internal client still holds an expired JWT. PostgREST then rejects the
// request (treats it as anon), and RLS surfaces the failure as "new row
// violates row-level security policy". Calling this on `visibilitychange`
// and before critical mutations closes that race.

const EXPIRY_BUFFER_SECONDS = 60;

let inFlight: Promise<void> | null = null;

export async function ensureFreshSession(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const expiresAt = session.expires_at;
      if (!expiresAt) return;

      const nowSec = Math.floor(Date.now() / 1000);
      const secondsLeft = expiresAt - nowSec;

      if (secondsLeft <= EXPIRY_BUFFER_SECONDS) {
        await supabase.auth.refreshSession();
      }
    } catch {
      // Swallow — a failed refresh should not crash the caller. The next
      // request will surface the auth error on its own if needed.
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

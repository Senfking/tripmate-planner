import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client used only for test cleanup
 * (deleting users, removing trips). Returns null if the
 * service-role key isn't configured — cleanup helpers then
 * become no-ops with a console warning.
 *
 * NEVER bundle the service-role key into client code. This
 * module is only loaded from Node-side test files.
 */
export function getAdminClient(): SupabaseClient | null {
  const url =
    process.env.TEST_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let warned = false;
export function warnNoAdminClientOnce(context: string): void {
  if (warned) return;
  warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[e2e cleanup] ${context}: TEST_SUPABASE_SERVICE_ROLE_KEY not set — ` +
      "skipping cleanup. Test artifacts (users, trips) will accumulate. " +
      "See tests/e2e/README.md.",
  );
}

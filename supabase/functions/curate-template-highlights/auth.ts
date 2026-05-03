// Service-role gate for curate-template-highlights. Mirrors the helper in
// send-push-notification / check-admin-alerts so we don't fork the auth
// model. Used as an alternative to the admin-user-JWT path so the backfill
// can be invoked with the service-role key (which auth.getUser cannot
// validate as a "user" — it's not a user JWT).
//
// Why we compare against the vault-stored legacy JWT rather than
// Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"):
//
//   - The Edge Function gateway has verify_jwt = true and only accepts
//     legacy-format JWTs (eyJ...) in the incoming Authorization header.
//   - Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") returns the new sb_secret_*
//     format — fine for outbound DB calls (no JWT verification step), but
//     never matches what callers actually send.
//   - Server-side callers (DB triggers, admin scripts) read the legacy JWT
//     from vault.decrypted_secrets WHERE name = 'service_role_key' and put
//     that in the Authorization header.
//
// We read the same vault row at cold-start so the comparison succeeds.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

let cachedLegacyJwt: string | null = null;
let coldStartPromise: Promise<void> | null = null;

async function loadLegacyJwt(): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("auth: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
      return;
    }
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await admin.rpc("get_legacy_service_role_jwt");

    if (error) {
      console.error("auth: vault rpc failed:", error.message);
      return;
    }
    const secret = typeof data === "string" ? data : null;
    if (!secret) {
      console.error("auth: vault row 'service_role_key' missing or empty");
      return;
    }
    cachedLegacyJwt = secret;
  } catch (err) {
    console.error("auth: cold-start vault lookup threw:", err);
  }
}

export function ensureLegacyJwtLoaded(): Promise<void> {
  if (cachedLegacyJwt) return Promise.resolve();
  if (!coldStartPromise) coldStartPromise = loadLegacyJwt();
  return coldStartPromise;
}

// Kick off the load eagerly at module import; callers also await
// ensureLegacyJwtLoaded() before checking.
ensureLegacyJwtLoaded();

export function isServiceRoleAuthorized(authHeader: string | null): boolean {
  if (!authHeader || !cachedLegacyJwt) return false;
  return authHeader === `Bearer ${cachedLegacyJwt}`;
}

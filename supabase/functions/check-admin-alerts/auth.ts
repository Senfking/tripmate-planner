// See supabase/functions/send-push-notification/auth.ts for the full rationale.
// Short version: gateway has verify_jwt = true and only accepts legacy JWTs;
// DB triggers send the legacy JWT pulled from vault.decrypted_secrets
// WHERE name = 'service_role_key'. The new sb_secret_* env var format never
// matches, so we read the same vault row at cold start and compare against it.

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
    const { data, error } = await admin
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", "service_role_key")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("auth: vault read failed:", error.message);
      return;
    }
    const secret = (data as { decrypted_secret?: string } | null)?.decrypted_secret;
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

ensureLegacyJwtLoaded();

export function isServiceRoleAuthorized(authHeader: string | null): boolean {
  if (!authHeader || !cachedLegacyJwt) return false;
  return authHeader === `Bearer ${cachedLegacyJwt}`;
}

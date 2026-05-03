// Read vault decrypted_secret length and prefix via SECURITY DEFINER (we have service role)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "vault" } } as never,
  );

  const { data, error } = await admin
    .from("decrypted_secrets")
    .select("name, decrypted_secret")
    .in("name", ["service_role_key", "email_queue_service_role_key"]);

  const sanitized = (data ?? []).map((r: { name: string; decrypted_secret: string }) => ({
    name: r.name,
    len: r.decrypted_secret?.length,
    prefix: r.decrypted_secret?.slice(0, 12),
    looks_like_jwt: r.decrypted_secret?.startsWith("eyJ"),
  }));

  return new Response(
    JSON.stringify({ data: sanitized, error: error?.message }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});

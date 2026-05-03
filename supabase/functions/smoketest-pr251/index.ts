// Diagnose service-role key formats
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async () => {
  const envKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, envKey);

  // Read vault key
  const { data, error } = await admin
    .from("vault.decrypted_secrets" as never)
    .select("name, decrypted_secret")
    .in("name", ["service_role_key", "email_queue_service_role_key"]);

  // Fallback: rpc to vault not allowed via PostgREST. Use a SECURITY DEFINER call instead.
  // Just compare via direct probe: send each key to send-push-notification and see what the gateway says.

  async function probeSend(key: string, label: string) {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify({ user_id: "6d4ef7bb-7a00-4081-8a43-071c738aec33", title: "x", body: "x" }),
    });
    const txt = await res.text();
    return { label, status: res.status, body: txt.slice(0, 200), keyPrefix: key.slice(0, 30), keyLength: key.length };
  }

  const envProbe = await probeSend(envKey, "env_SUPABASE_SERVICE_ROLE_KEY");

  return new Response(
    JSON.stringify({ envProbe, vaultRead: { data, error: error?.message }, envKeyPrefix: envKey.slice(0, 40), envKeyLen: envKey.length }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.rpc("_tmp_pr251_vault_peek");
  return new Response(
    JSON.stringify({ data, error: error?.message }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});

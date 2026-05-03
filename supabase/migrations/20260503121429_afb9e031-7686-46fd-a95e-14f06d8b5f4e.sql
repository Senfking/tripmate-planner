CREATE OR REPLACE FUNCTION public._tmp_pr251_vault_read()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public._tmp_pr251_vault_read() FROM PUBLIC, anon, authenticated;
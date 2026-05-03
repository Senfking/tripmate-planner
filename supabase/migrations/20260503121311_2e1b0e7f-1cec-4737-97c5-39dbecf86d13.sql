CREATE OR REPLACE FUNCTION public._tmp_pr251_vault_peek()
RETURNS TABLE(name text, len int, prefix text, looks_like_jwt boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT
    s.name,
    length(s.decrypted_secret),
    substr(s.decrypted_secret, 1, 12),
    s.decrypted_secret LIKE 'eyJ%'
  FROM vault.decrypted_secrets s
  WHERE s.name IN ('service_role_key', 'email_queue_service_role_key');
$$;
REVOKE EXECUTE ON FUNCTION public._tmp_pr251_vault_peek() FROM PUBLIC, anon, authenticated;
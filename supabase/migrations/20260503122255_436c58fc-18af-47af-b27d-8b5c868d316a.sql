CREATE OR REPLACE FUNCTION public.get_legacy_service_role_jwt()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _jwt text;
BEGIN
  SELECT decrypted_secret INTO _jwt
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  RETURN _jwt;
END;
$$;

REVOKE ALL ON FUNCTION public.get_legacy_service_role_jwt() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_legacy_service_role_jwt() TO service_role;
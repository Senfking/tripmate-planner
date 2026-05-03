-- =============================================================================
-- Secure send-push-notification: replace the hardcoded anon JWT in
-- notify_trip_members_push with the service-role key from
-- vault.decrypted_secrets.
--
-- Context: send-push-notification is being locked behind a defense-in-depth
-- bearer check that requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>.
-- Without this change, the DB-side fan-out trigger (which currently sends the
-- anon key) would fail closed for every notification.
--
-- Mirrors the pattern already used for check-admin-alerts in
-- 20260426151725_secure_admin_alerts_use_vault_service_role_key.sql.
--
-- Vault expectation: row in vault.decrypted_secrets with name = 'service_role_key'.
-- If missing, the function logs a warning and skips the http_post — the
-- trigger that called it still completes successfully so the original write
-- (expense, poll, member, itinerary) is not blocked.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_trip_members_push(
  p_trip_id    uuid,
  p_exclude    uuid,       -- actor to exclude (NULL = nobody excluded)
  p_pref_key   text,       -- notification_preferences JSON key
  p_title      text,
  p_body       text,
  p_url        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member            RECORD;
  _service_role_key  text;
  _base_url constant text := 'https://dwtbqomfleihcvkfoopm.supabase.co';
BEGIN
  SELECT decrypted_secret INTO _service_role_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  IF _service_role_key IS NULL THEN
    RAISE LOG 'notify_trip_members_push: vault secret "service_role_key" missing — skipping push fan-out for trip %.', p_trip_id;
    RETURN;
  END IF;

  FOR _member IN
    SELECT tm.user_id
    FROM   trip_members tm
    JOIN   profiles     p ON p.id = tm.user_id
    WHERE  tm.trip_id = p_trip_id
      AND  (p_exclude IS NULL OR tm.user_id <> p_exclude)
      AND  COALESCE((p.notification_preferences ->> p_pref_key)::boolean, false) = true
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := (_base_url || '/functions/v1/send-push-notification')::text,
        body    := jsonb_build_object(
          'user_id', _member.user_id,
          'title',   p_title,
          'body',    p_body,
          'url',     p_url
        ),
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey',        _service_role_key,
          'Authorization', 'Bearer ' || _service_role_key
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_trip_members_push(%, %): %', p_trip_id, _member.user_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

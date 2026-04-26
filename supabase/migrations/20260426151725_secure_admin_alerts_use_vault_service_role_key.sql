-- =============================================================================
-- Secure check-admin-alerts: replace hardcoded anon JWT with the service-role
-- key from vault.decrypted_secrets in every internal caller.
--
-- Context: check-admin-alerts is being flipped to verify_jwt = true and gains
-- a defense-in-depth bearer check that requires Authorization: Bearer
-- <SUPABASE_SERVICE_ROLE_KEY>. The DB-side callers that fan into it must
-- therefore stop sending the anon key.
--
-- Three callers updated:
--   1. notify_new_user — AFTER INSERT trigger on profiles
--   2. check_error_spike — pg_cron, hourly
--   3. send_daily_digest — pg_cron, daily 08:00 UTC
--
-- Vault expectation: row in vault.decrypted_secrets with name = 'service_role_key'
-- (set by an admin via the Supabase Vault UI). If the row is missing, the
-- function logs a warning and skips the http_post — never raises, so the
-- trigger / cron tick still completes successfully.
--
-- The notify_new_feedback path is NOT touched here: the frontend now invokes
-- the new submit-feedback-alert function directly (with the user's JWT), so
-- the DB trigger no longer needs to call check-admin-alerts. The
-- trg_analyze_new_feedback trigger added in 20260426114007 still calls
-- analyze-feedback with the same vault key pattern.
-- =============================================================================

-- 1. notify_new_user ----------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_new_user ON public.profiles;

CREATE OR REPLACE FUNCTION public.notify_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text;
  _base_url constant text := 'https://dwtbqomfleihcvkfoopm.supabase.co';
BEGIN
  SELECT decrypted_secret INTO _service_role_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  IF _service_role_key IS NULL THEN
    RAISE LOG 'notify_new_user: vault secret "service_role_key" missing — skipping check-admin-alerts call. Set it via Supabase Vault.';
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url    := (_base_url || '/functions/v1/check-admin-alerts')::text,
      body   := jsonb_build_object(
        'trigger',      'new_user',
        'user_id',      NEW.id::text,
        'display_name', COALESCE(NEW.display_name, 'Unknown')
      ),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        _service_role_key,
        'Authorization', 'Bearer ' || _service_role_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'notify_new_user: check-admin-alerts http_post failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_user
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_user();

-- 2. check_error_spike --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_error_spike()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count       int;
  prior_count        int;
  _service_role_key  text;
  _base_url constant text := 'https://dwtbqomfleihcvkfoopm.supabase.co';
BEGIN
  SELECT count(*) INTO recent_count
    FROM public.analytics_events
   WHERE event_name = 'app_error'
     AND created_at > now() - interval '5 minutes';

  SELECT count(*) INTO prior_count
    FROM public.analytics_events
   WHERE event_name = 'app_error'
     AND created_at > now() - interval '10 minutes'
     AND created_at <= now() - interval '5 minutes';

  IF recent_count >= 3 AND recent_count > prior_count * 2 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_notifications
       WHERE type = 'error_spike'
         AND created_at > now() - interval '15 minutes'
    ) THEN
      SELECT decrypted_secret INTO _service_role_key
        FROM vault.decrypted_secrets
       WHERE name = 'service_role_key'
       LIMIT 1;

      IF _service_role_key IS NULL THEN
        RAISE LOG 'check_error_spike: vault secret "service_role_key" missing — skipping check-admin-alerts call.';
        RETURN;
      END IF;

      BEGIN
        PERFORM net.http_post(
          url     := (_base_url || '/functions/v1/check-admin-alerts')::text,
          body    := jsonb_build_object(
            'trigger', 'error_spike',
            'count',   recent_count,
            'window',  '5min'
          ),
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'apikey',        _service_role_key,
            'Authorization', 'Bearer ' || _service_role_key
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'check_error_spike: check-admin-alerts http_post failed: %', SQLERRM;
      END;
    END IF;
  END IF;
END;
$$;

-- 3. send_daily_digest --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_daily_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_users          int;
  new_trips          int;
  new_feedback       int;
  error_count        int;
  summary_text       text;
  _service_role_key  text;
  _base_url constant text := 'https://dwtbqomfleihcvkfoopm.supabase.co';
BEGIN
  SELECT count(*) INTO new_users
    FROM public.profiles WHERE created_at > now() - interval '24 hours';

  SELECT count(*) INTO new_trips
    FROM public.trips WHERE created_at > now() - interval '24 hours';

  SELECT count(*) INTO new_feedback
    FROM public.feedback WHERE created_at > now() - interval '24 hours';

  SELECT count(*) INTO error_count
    FROM public.analytics_events
   WHERE event_name = 'app_error'
     AND created_at > now() - interval '24 hours';

  summary_text := format(
    'Users: %s | Trips: %s | Feedback: %s | Errors: %s',
    new_users, new_trips, new_feedback, error_count
  );

  SELECT decrypted_secret INTO _service_role_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  IF _service_role_key IS NULL THEN
    RAISE LOG 'send_daily_digest: vault secret "service_role_key" missing — skipping check-admin-alerts call.';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := (_base_url || '/functions/v1/check-admin-alerts')::text,
      body    := jsonb_build_object(
        'trigger',      'daily_digest',
        'summary',      summary_text,
        'generated_at', now()::text
      ),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        _service_role_key,
        'Authorization', 'Bearer ' || _service_role_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'send_daily_digest: check-admin-alerts http_post failed: %', SQLERRM;
  END;
END;
$$;

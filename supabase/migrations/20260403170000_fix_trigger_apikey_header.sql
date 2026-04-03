-- =============================================================================
-- Fix: add missing apikey header to all net.http_post calls
--
-- The Supabase API gateway (Kong) requires the `apikey` header for
-- authentication and routing. The previous trigger/cron functions only sent
-- `Authorization: Bearer <anon_key>` but omitted `apikey`, causing the
-- gateway to reject the requests silently (net.http_post is async/fire-and-forget).
--
-- This migration recreates all four functions and both triggers with the
-- correct headers.
-- =============================================================================

-- Anon key (public, same as VITE_SUPABASE_PUBLISHABLE_KEY in the frontend)
DO $wrapper$
DECLARE
  _anon_key constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4';
  _base_url constant text := 'https://dwtbqomfleihcvkfoopm.supabase.co';
BEGIN
  -- just a guard to verify constants are set
  IF _anon_key IS NULL OR _base_url IS NULL THEN
    RAISE EXCEPTION 'anon_key or base_url is null';
  END IF;
END;
$wrapper$;

-- =============================================================================
-- 1. notify_new_feedback — AFTER INSERT on feedback
-- =============================================================================
DROP TRIGGER IF EXISTS trg_notify_new_feedback ON public.feedback;

CREATE OR REPLACE FUNCTION public.notify_new_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url    := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/check-admin-alerts',
    body   := jsonb_build_object(
      'trigger',     'feedback',
      'feedback_id', NEW.id,
      'body',        LEFT(COALESCE(NEW.body, ''), 200),
      'category',    COALESCE(NEW.category, 'general'),
      'severity',    COALESCE(NEW.ai_severity, 'medium')
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4'
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_feedback
  AFTER INSERT ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_feedback();

-- =============================================================================
-- 2. notify_new_user — AFTER INSERT on profiles
-- =============================================================================
DROP TRIGGER IF EXISTS trg_notify_new_user ON public.profiles;

CREATE OR REPLACE FUNCTION public.notify_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url    := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/check-admin-alerts',
    body   := jsonb_build_object(
      'trigger',      'new_user',
      'user_id',      NEW.id::text,
      'display_name', COALESCE(NEW.display_name, 'Unknown')
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4'
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_user
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_user();

-- =============================================================================
-- 3. check_error_spike — cron every 5 minutes
-- =============================================================================
SELECT cron.unschedule('check-error-spike');

CREATE OR REPLACE FUNCTION public.check_error_spike()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count  int;
  prior_count   int;
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
      PERFORM net.http_post(
        url     := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/check-admin-alerts',
        body    := jsonb_build_object(
          'trigger', 'error_spike',
          'count',   recent_count,
          'window',  '5min'
        ),
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4'
        )
      );
    END IF;
  END IF;
END;
$$;

SELECT cron.schedule(
  'check-error-spike',
  '*/5 * * * *',
  $$ SELECT public.check_error_spike(); $$
);

-- =============================================================================
-- 4. send_daily_digest — cron daily at 08:00 UTC
-- =============================================================================
SELECT cron.unschedule('daily-digest');

CREATE OR REPLACE FUNCTION public.send_daily_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_users     int;
  new_trips     int;
  new_feedback  int;
  error_count   int;
  summary_text  text;
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

  PERFORM net.http_post(
    url     := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/check-admin-alerts',
    body    := jsonb_build_object(
      'trigger',      'daily_digest',
      'summary',      summary_text,
      'generated_at', now()::text
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4'
    )
  );
END;
$$;

SELECT cron.schedule(
  'daily-digest',
  '0 8 * * *',
  $$ SELECT public.send_daily_digest(); $$
);

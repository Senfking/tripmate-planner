-- =============================================================================
-- Fix: replace vault.decrypted_secrets with hardcoded values
-- The Supabase URL and anon key are already public (embedded in the frontend).
-- The check-admin-alerts function has no auth check, so anon key is sufficient.
-- =============================================================================

-- Drop existing cron jobs first (they reference the old functions)
SELECT cron.unschedule('check-error-spike');
SELECT cron.unschedule('daily-digest');

-- =============================================================================
-- 1. TRIGGER: notify on new feedback
-- =============================================================================
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
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4'
    )
  );
  RETURN NEW;
END;
$$;

-- Trigger already exists from previous migration, no need to recreate

-- =============================================================================
-- 2. TRIGGER: notify on new user signup
-- =============================================================================
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
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4'
    )
  );
  RETURN NEW;
END;
$$;

-- Trigger already exists from previous migration, no need to recreate

-- =============================================================================
-- 3. CRON: error spike check every 5 minutes
-- =============================================================================
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

  -- Spike: at least 3 errors AND more than double the prior window
  IF recent_count >= 3 AND recent_count > prior_count * 2 THEN
    -- Dedup: skip if we already notified in the last 15 min
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
          'Content-Type', 'application/json',
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
-- 4. CRON: daily digest at 08:00 UTC
-- =============================================================================
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
      'Content-Type', 'application/json',
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

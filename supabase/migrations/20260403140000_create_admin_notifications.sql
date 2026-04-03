-- =============================================================================
-- Admin Notifications: table, RLS, triggers, and pg_cron jobs
-- =============================================================================

-- 1. CREATE TABLE
-- Matches the TypeScript types in src/integrations/supabase/types.ts
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,
  title         text NOT NULL,
  body          text NOT NULL,
  severity      text NOT NULL DEFAULT 'info',
  properties    jsonb,
  read          boolean NOT NULL DEFAULT false,
  read_at       timestamptz,
  whatsapp_sent boolean NOT NULL DEFAULT false,
  whatsapp_sent_at timestamptz,
  created_at    timestamptz DEFAULT now()
);

-- Index for common query patterns (unread count, listing by recency)
CREATE INDEX idx_admin_notifications_read_created
  ON public.admin_notifications (read, created_at DESC);

CREATE INDEX idx_admin_notifications_type_created
  ON public.admin_notifications (type, created_at DESC);

-- 2. ROW LEVEL SECURITY
-- The Edge Functions use service_role key (bypasses RLS).
-- The admin-query function also uses service_role.
-- Enable RLS but add no permissive policies for anon/authenticated —
-- only service_role can read/write.
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. TRIGGER: notify on new feedback
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_new_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url    := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/check-admin-alerts',
    body   := jsonb_build_object(
      'trigger',     'feedback',
      'feedback_id', NEW.id,
      'body',        LEFT(COALESCE(NEW.body, ''), 200),
      'category',    COALESCE(NEW.category, 'general'),
      'severity',    COALESCE(NEW.ai_severity, 'medium')
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
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
-- 4. TRIGGER: notify on new user signup
-- Extends the existing handle_new_user flow by adding a separate trigger
-- that fires after the profile row is created.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url    := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/check-admin-alerts',
    body   := jsonb_build_object(
      'trigger',      'new_user',
      'user_id',      NEW.id::text,
      'display_name', COALESCE(NEW.display_name, 'Unknown')
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
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
-- 5. CRON: error spike check every 5 minutes
-- Counts app_error events in the last 5 min vs prior 5 min.
-- If spike detected, calls check-admin-alerts with trigger = "error_spike".
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
  base_url      text;
  svc_key       text;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO svc_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key';

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
        url     := base_url || '/functions/v1/check-admin-alerts',
        body    := jsonb_build_object(
          'trigger', 'error_spike',
          'count',   recent_count,
          'window',  '5min'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || svc_key
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
-- 6. CRON: daily digest at 08:00 UTC
-- Aggregates 24h stats and calls check-admin-alerts with trigger = "daily_digest".
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
  base_url      text;
  svc_key       text;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO svc_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key';

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
    url     := base_url || '/functions/v1/check-admin-alerts',
    body    := jsonb_build_object(
      'trigger',      'daily_digest',
      'summary',      summary_text,
      'generated_at', now()::text
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    )
  );
END;
$$;

SELECT cron.schedule(
  'daily-digest',
  '0 8 * * *',
  $$ SELECT public.send_daily_digest(); $$
);

-- =============================================================================
-- Fix: ensure feedback notification trigger definitely exists
-- The fix_notification_triggers migration (20260403150000) replaced the
-- function bodies but assumed the triggers already existed from the original
-- migration. If that original migration rolled back (e.g. due to vault or
-- cron errors), the triggers were never created. This migration defensively
-- drops + recreates both triggers and replaces both function bodies.
-- =============================================================================

-- 1. Feedback trigger
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
      'Content-Type', 'application/json',
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

-- 2. New-user trigger (belt & suspenders — ensure it also exists)
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
      'Content-Type', 'application/json',
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

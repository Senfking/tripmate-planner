-- =============================================================================
-- Fix: Make feedback trigger exception-safe so INSERT never fails
--
-- Problem: The notify_new_feedback trigger calls net.http_post which can throw
-- (e.g. if service_role_key is not configured, or pg_net has issues). Since
-- the trigger has no exception handler, the error cascades and blocks the
-- INSERT — causing user feedback to silently fail.
--
-- Also consolidates duplicate triggers (trg_notify_new_feedback and
-- trigger_notify_new_feedback) into a single trigger.
-- =============================================================================

-- 1. Drop BOTH duplicate triggers
DROP TRIGGER IF EXISTS trg_notify_new_feedback ON public.feedback;
DROP TRIGGER IF EXISTS trigger_notify_new_feedback ON public.feedback;

-- 2. Recreate function with exception handling — INSERT always succeeds
CREATE OR REPLACE FUNCTION public.notify_new_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    -- Log but never block the insert
    RAISE WARNING 'notify_new_feedback: check-admin-alerts failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 3. Create single trigger
CREATE TRIGGER trg_notify_new_feedback
  AFTER INSERT ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_feedback();

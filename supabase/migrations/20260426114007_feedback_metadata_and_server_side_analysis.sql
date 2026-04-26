-- =============================================================================
-- Feedback module changes
--
-- 1. Add `metadata` JSONB column on `feedback` so the FeedbackWidget can
--    attach recent error context (last 5 errors / last 60s, route, online
--    state, display mode) to every submission. No schema bump beyond the
--    new column; existing rows are NULL.
--
-- 2. Re-add the AFTER INSERT trigger that asynchronously invokes
--    `analyze-feedback` for admin AI analysis. The frontend no longer fires
--    this call on submit — server-side trigger keeps admin enrichment
--    (ai_summary, ai_severity, ai_category, ai_fix) running without
--    spending tokens for every client submission.
--
--    The previous trigger (20260403211526) was dropped in
--    20260403220000_drop_feedback_notification_trigger.sql because the
--    pg_net call could throw and block the INSERT. This version wraps the
--    http_post in EXCEPTION WHEN OTHERS THEN RAISE LOG so the INSERT
--    always succeeds (per CLAUDE.md hard rule). It also calls only
--    analyze-feedback — `check-admin-alerts` is still invoked from the
--    frontend, so we don't double-fire it.
-- =============================================================================

-- 1. Schema change ------------------------------------------------------------

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN public.feedback.metadata IS
  'Free-form context attached at submit time: recent_errors[], route, display_mode, online, app_version. Used by admin tooling to triage bug reports.';

-- 2. Server-side analyze trigger ---------------------------------------------

-- Drop any previous version of the function/trigger to keep the migration
-- idempotent if it runs against a partially-migrated env.
DROP TRIGGER  IF EXISTS trg_analyze_new_feedback ON public.feedback;
DROP FUNCTION IF EXISTS public.analyze_new_feedback();

CREATE OR REPLACE FUNCTION public.analyze_new_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_role_key text := current_setting('app.settings.service_role_key', true);
  _base_url         text := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1';
BEGIN
  BEGIN
    PERFORM net.http_post(
      url    := (_base_url || '/analyze-feedback')::text,
      body   := jsonb_build_object(
        'feedbackId', NEW.id,
        'category',   COALESCE(NEW.category, 'general'),
        'message',    COALESCE(NEW.body, ''),
        'route',      COALESCE(NEW.route, '')
      ),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        _service_role_key,
        'Authorization', 'Bearer ' || _service_role_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block the INSERT on a transient pg_net / network failure.
    -- The admin can re-trigger analysis manually from the dashboard if a
    -- row arrives without ai_summary populated.
    RAISE LOG 'analyze_new_feedback: analyze-feedback invocation failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_analyze_new_feedback
  AFTER INSERT ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.analyze_new_feedback();

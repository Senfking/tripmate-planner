-- =============================================================================
-- Drop the feedback notification trigger entirely.
--
-- Problem: The trigger calls net.http_post which fails on environments where
-- pg_net is not installed or the function signature differs, causing the
-- INSERT to fail with:
--   "function net.http_post(url => unknown, body => text, headers => jsonb)
--    does not exist"
--
-- The frontend already calls check-admin-alerts directly as a fallback
-- (with deduplication), so this trigger is redundant. Removing it ensures
-- feedback INSERT always succeeds.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_notify_new_feedback ON public.feedback;
DROP TRIGGER IF EXISTS trigger_notify_new_feedback ON public.feedback;

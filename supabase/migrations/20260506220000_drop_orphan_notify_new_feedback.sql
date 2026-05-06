-- =============================================================================
-- Drop the orphan notify_new_feedback() function
-- =============================================================================
-- Both the trg_notify_new_feedback and trigger_notify_new_feedback triggers
-- were dropped in 20260403220000_drop_feedback_notification_trigger.sql when
-- pg_net signature mismatches kept blocking feedback inserts. The frontend
-- now invokes `check-admin-alerts` directly, and the AFTER INSERT
-- `analyze_new_feedback` trigger (20260426114007) handles AI enrichment with
-- proper EXCEPTION WHEN OTHERS wrapping.
--
-- The notify_new_feedback() function itself was never dropped, so it lingers
-- as zombie code with hard-coded JWTs in its body (see migration
-- 20260403210000 — those JWTs are public anon keys, not secrets, but they
-- are still dead artifacts). Drop it.
-- =============================================================================

DROP FUNCTION IF EXISTS public.notify_new_feedback();

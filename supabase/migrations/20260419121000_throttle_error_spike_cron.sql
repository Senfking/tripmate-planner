-- =============================================================================
-- Throttle the check-error-spike cron from every 5 minutes to hourly and add
-- a daily cleanup for analytics_events. The previous schedule produced ~8,640
-- invocations/month, each of which full-scans analytics_events — a table that
-- grows unbounded without cleanup.
-- =============================================================================

-- Unschedule the 5-minute cadence. Wrapped in a DO block so a missing job
-- (e.g. fresh environment) doesn't fail the migration.
DO $$
BEGIN
  PERFORM cron.unschedule('check-error-spike');
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'check-error-spike not scheduled, skipping unschedule';
END
$$;

-- Reschedule hourly. Function body is unchanged; only the cadence moves.
SELECT cron.schedule(
  'check-error-spike',
  '0 * * * *',
  $$ SELECT public.check_error_spike(); $$
);

-- Daily cleanup: delete analytics_events older than 30 days at 03:30 UTC.
-- Unschedule first in case a prior version exists.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-analytics-events');
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'cleanup-analytics-events not scheduled yet, skipping unschedule';
END
$$;

SELECT cron.schedule(
  'cleanup-analytics-events',
  '30 3 * * *',
  $$ DELETE FROM public.analytics_events WHERE created_at < now() - interval '30 days'; $$
);

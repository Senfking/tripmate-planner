-- =============================================================================
-- Add explicit expires_at column to place_details_cache and a daily cleanup
-- cron. The Edge Function previously never consulted the cache, so every
-- get-place-details call hit Google Places fresh. With this change the
-- function can filter rows by `expires_at > now()` and a scheduled job
-- prunes stale entries.
-- =============================================================================

ALTER TABLE public.place_details_cache
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL
    DEFAULT (now() + interval '30 days');

-- Backfill any pre-existing rows that might have been created before the
-- default was in place (safety net — column default handles new rows).
UPDATE public.place_details_cache
   SET expires_at = created_at + interval '30 days'
 WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_place_details_cache_expires_at
  ON public.place_details_cache(expires_at);

-- Daily cleanup: drop expired rows at 03:15 UTC.
-- Unschedule first in case a prior version of this job exists.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-place-details-cache');
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'cleanup-place-details-cache not scheduled yet, skipping unschedule';
END
$$;

SELECT cron.schedule(
  'cleanup-place-details-cache',
  '15 3 * * *',
  $$ DELETE FROM public.place_details_cache WHERE expires_at < now(); $$
);

-- =============================================================================
-- entry_requirements_cache
--
-- Stores LLM-generated visa / entry requirement responses keyed by
--   "{ISO_NATIONALITY}|{ISO_DESTINATION}|{PURPOSE}"
-- so we don't re-pay for the same lookup repeatedly.
--
-- TTL is 30 days. Source of truth (LLM today, paid API e.g. Sherpa later)
-- shouldn't matter to readers — they just see response_json. When we swap the
-- backend, the cache key contract stays the same; we just bump the TTL or
-- truncate the table to invalidate.
--
-- RLS: service-role only. Edge Functions read/write with the service-role
-- key. End users never touch this table directly — the get-entry-requirements
-- function is the only public interface.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.entry_requirements_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  response_json jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_entry_requirements_cache_key
  ON public.entry_requirements_cache(cache_key);

CREATE INDEX IF NOT EXISTS idx_entry_requirements_cache_expires
  ON public.entry_requirements_cache(expires_at);

ALTER TABLE public.entry_requirements_cache ENABLE ROW LEVEL SECURITY;

-- Service role only. No authenticated/anon policies on purpose.
CREATE POLICY "service_role_all" ON public.entry_requirements_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- Daily cleanup — deletes expired rows. Wrapped in BEGIN/EXCEPTION per
-- CLAUDE.md so a transient failure doesn't poison the cron schedule.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_entry_requirements_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.entry_requirements_cache
  WHERE expires_at < now();
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'cleanup_expired_entry_requirements_cache failed: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-entry-requirements-cache');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'cleanup-expired-entry-requirements-cache',
  '23 3 * * *',  -- 03:23 UTC daily, off-peak; 6 min after ai cache cleanup
  $$ SELECT public.cleanup_expired_entry_requirements_cache(); $$
);

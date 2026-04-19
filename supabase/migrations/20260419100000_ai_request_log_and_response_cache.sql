-- =============================================================================
-- ai_request_log and ai_response_cache
--
-- These tables were declared in src/integrations/supabase/types.ts but never
-- actually created in the database. Edge Functions wrapped INSERTs in
-- try/catch that silently swallowed the missing-table errors, so no AI cost
-- accounting or response caching has been recorded historically.
--
-- This migration creates both tables with the schema that the generated
-- types already expect. Edge Functions are being updated in the same branch
-- to FAIL LOUDLY on insert errors instead of swallowing them.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  response_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires
  ON public.ai_response_cache(expires_at);

CREATE TABLE IF NOT EXISTS public.ai_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text NOT NULL,
  model text NOT NULL,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,6),
  cached boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_request_log_user_id
  ON public.ai_request_log(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_request_log_feature_created
  ON public.ai_request_log(feature, created_at DESC);

ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_request_log ENABLE ROW LEVEL SECURITY;

-- Service role gets full read/write (Edge Functions use the service-role key)
CREATE POLICY "service_role_all" ON public.ai_request_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_cache" ON public.ai_response_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users may read their own request log entries
CREATE POLICY "users_read_own" ON public.ai_request_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- =============================================================================
-- Daily cleanup job — deletes expired cache rows.
--
-- Wrapped in BEGIN/EXCEPTION per CLAUDE.md trigger guidance so a transient
-- failure (e.g. lock contention) doesn't poison the cron schedule.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_ai_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ai_response_cache
  WHERE expires_at < now();
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'cleanup_expired_ai_cache failed: %', SQLERRM;
END;
$$;

-- Re-schedule (unschedule first in case this migration is re-run)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-ai-cache');
EXCEPTION WHEN OTHERS THEN
  -- job didn't exist; ignore
  NULL;
END;
$$;

SELECT cron.schedule(
  'cleanup-expired-ai-cache',
  '17 3 * * *',  -- 03:17 UTC daily, off-peak
  $$ SELECT public.cleanup_expired_ai_cache(); $$
);

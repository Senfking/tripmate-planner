-- =============================================================================
-- places_cache + Places-API quota helpers
--
-- Shared cache for every Google Places (New) call issued from edge functions
-- (generate-trip-itinerary + concierge-suggest). A single table lets
-- both features reuse each other's lookups — if the trip builder just
-- fetched "restaurants in Tibubeneng", the concierge can serve that query
-- from cache seconds later.
--
-- Cache tiers (TTLs enforced in app code via expires_at):
--   - "search"  : Places Text Search results                          7d
--   - "details" : Place Details (rich fields) keyed by place_id      30d
--   - "geocode" : destination → {lat,lng,country,scale,viewport}     30d
--   - "photo"   : rarely used (photo URLs are deterministic from
--                 place_id + photo name); reserved for future
--
-- Keyed by cache_key (text), disambiguated by cache_tier.
-- Service-role-only RLS — edge functions use the service role key.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.places_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL,
  cache_tier text NOT NULL CHECK (cache_tier IN ('search','details','geocode','photo')),
  data jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (cache_tier, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_places_cache_expires
  ON public.places_cache (expires_at);

CREATE INDEX IF NOT EXISTS idx_places_cache_tier_key
  ON public.places_cache (cache_tier, cache_key);

ALTER TABLE public.places_cache ENABLE ROW LEVEL SECURITY;

-- Service-role-only. Edge functions call this table via the service-role key.
CREATE POLICY "places_cache_service_role_all"
  ON public.places_cache
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Daily cleanup of expired rows.
-- Wrapped per CLAUDE.md trigger guidance so a transient failure doesn't
-- poison the cron schedule.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_places_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.places_cache
   WHERE expires_at < now();
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'cleanup_expired_places_cache failed: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-places-cache');
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'cleanup-places-cache not scheduled yet, skipping unschedule';
END
$$;

SELECT cron.schedule(
  'cleanup-places-cache',
  '20 3 * * *', -- 03:20 UTC, after ai-cache / place-details-cache jobs
  $$ SELECT public.cleanup_expired_places_cache(); $$
);

-- =============================================================================
-- Quota helpers
--
-- count_user_trip_generations_last_hour(user_id):
--   returns number of successful generate-trip-itinerary calls by this user in
--   the last 60 minutes. Used by the edge function to enforce the per-user
--   rate limit (default 5/hr). Counts rows with feature='trip_builder_total'
--   and feature='concierge_suggest_total' — rate limit applies to both, which
--   matches the "cost pressure" intent rather than a single feature.
--
-- sum_places_spend_last_day():
--   returns USD spent on Places API in the last 24 hours across all users.
--   Used by the edge functions to enforce the daily circuit breaker.
--
-- Both are SECURITY DEFINER because ai_request_log has user-scoped RLS on
-- SELECT; the service role can read all rows directly but a single function
-- signature is easier to audit than scattering raw queries.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_user_trip_generations_last_hour(p_user_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::int
  FROM public.ai_request_log
  WHERE user_id = p_user_id
    AND feature IN ('trip_builder_total', 'concierge_suggest_total')
    AND created_at >= now() - interval '1 hour';
$$;

CREATE OR REPLACE FUNCTION public.sum_places_spend_last_day()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM public.ai_request_log
  WHERE feature LIKE 'places_%'
    AND created_at >= now() - interval '1 day';
$$;

-- Service role is the only caller we care about; grant explicitly so future
-- anon/authenticated grants don't accidentally expose these helpers.
REVOKE ALL ON FUNCTION public.count_user_trip_generations_last_hour(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_places_spend_last_day() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_user_trip_generations_last_hour(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sum_places_spend_last_day() TO service_role;

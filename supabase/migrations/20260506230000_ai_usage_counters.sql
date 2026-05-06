-- =============================================================================
-- ai_usage_counters: per-user-per-endpoint hourly rate limits for AI features
-- =============================================================================
-- Authenticated AI endpoints (generate-trip-itinerary, scan-receipt,
-- extract-booking-info, concierge-suggest) have no per-user spending cap
-- today. Anonymous flows already have IP+session limits via
-- count_ip_anon_generations_last_day / count_anon_generations_last_day, but a
-- signed-in attacker can loop a few hundred itinerary generations per hour
-- and burn an order of magnitude more API spend than a normal user.
--
-- This table backs a 1-hour rolling window counter. The shared edge-function
-- helper (_shared/rateLimit.ts) calls bump_ai_usage_counter() on every AI
-- request and returns 429 when the limit is exceeded. Old rows are cheap; a
-- separate cron prune can be added later if churn becomes meaningful.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_usage_counters (
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint         text        NOT NULL,
  window_start_utc timestamptz NOT NULL,
  count            int         NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint, window_start_utc)
);

ALTER TABLE public.ai_usage_counters ENABLE ROW LEVEL SECURITY;

-- service_role only — edge functions read/write via the service role key.
-- No policies for anon/authenticated; client code must never read these.
CREATE POLICY "ai_usage_counters_service_role_all"
  ON public.ai_usage_counters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Atomic increment helper. Returns the post-increment count so the caller
-- can compare against its endpoint-specific limit in a single round-trip.
CREATE OR REPLACE FUNCTION public.bump_ai_usage_counter(
  _user_id uuid,
  _endpoint text,
  _window timestamptz
)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ai_usage_counters (user_id, endpoint, window_start_utc, count)
  VALUES (_user_id, _endpoint, _window, 1)
  ON CONFLICT (user_id, endpoint, window_start_utc)
  DO UPDATE SET count = public.ai_usage_counters.count + 1
  RETURNING count;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_ai_usage_counter(uuid, text, timestamptz) FROM anon, authenticated;

-- =============================================================================
-- anonymous_trips
--
-- Stores trip generations produced for unauthenticated visitors so they can
-- view, scroll, and (after signup) claim them. The full structured generation
-- payload is stored as a single jsonb blob (same shape returned by
-- generate-trip-itinerary), and reconstruction into trips/trip_days/activities
-- happens at claim time inside the claim-anonymous-trip Edge Function.
--
-- Access model:
--   - RLS enabled, only the service_role has policies. Edge Functions reach
--     the table via SUPABASE_SERVICE_ROLE_KEY which bypasses RLS, but explicit
--     policies are kept for clarity.
--   - No `authenticated` or `anon` policies — public clients never read or
--     write directly. Anon viewing of `/trips/anon/[id]` goes through a
--     service-role Edge Function, not PostgREST.
--
-- Rate limiting derives from this table: count rows per anon_session_id and
-- per source_ip in the last 24h. No separate counter table.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.anonymous_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_session_id uuid NOT NULL,
  prompt text,
  payload jsonb NOT NULL,
  source_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL
);

-- Lookup-by-session for "fetch most recent trip in this anon session" and for
-- the rate-limit query (count rows in last 24h per session).
CREATE INDEX IF NOT EXISTS idx_anonymous_trips_session_created
  ON public.anonymous_trips (anon_session_id, created_at DESC);

-- IP-bound rate limit: partial index because source_ip can legitimately be
-- null when no proxy header is available.
CREATE INDEX IF NOT EXISTS idx_anonymous_trips_ip_created
  ON public.anonymous_trips (source_ip, created_at DESC)
  WHERE source_ip IS NOT NULL;

-- Used by the claim flow to find unclaimed trips for a session in O(1).
CREATE INDEX IF NOT EXISTS idx_anonymous_trips_unclaimed
  ON public.anonymous_trips (anon_session_id)
  WHERE claimed_at IS NULL;

ALTER TABLE public.anonymous_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.anonymous_trips
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.anonymous_trips IS
  'Trip generations produced for unauthenticated visitors. Service-role-only.';
COMMENT ON COLUMN public.anonymous_trips.payload IS
  'Full structured generation response. Reconstructed into trips/trip_days/activities at claim time.';
COMMENT ON COLUMN public.anonymous_trips.claimed_trip_id IS
  'Set when a signed-in user claims this trip. References the materialized trips row.';

-- =============================================================================
-- Rate limit RPCs.
--
-- count_anon_generations_last_day:    rows for a given anon_session_id in 24h.
-- count_ip_anon_generations_last_day: rows for a given source_ip      in 24h.
--
-- SECURITY DEFINER + service_role grant so the Edge Function (which talks via
-- the service-role key already) can call them as RPCs and avoid PostgREST
-- count-style requests.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_anon_generations_last_day(
  p_anon_session_id uuid
) RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.anonymous_trips
  WHERE anon_session_id = p_anon_session_id
    AND created_at > now() - interval '24 hours';
$$;

CREATE OR REPLACE FUNCTION public.count_ip_anon_generations_last_day(
  p_ip inet
) RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.anonymous_trips
  WHERE source_ip = p_ip
    AND created_at > now() - interval '24 hours';
$$;

REVOKE ALL ON FUNCTION public.count_anon_generations_last_day(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_ip_anon_generations_last_day(inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_anon_generations_last_day(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_ip_anon_generations_last_day(inet) TO service_role;

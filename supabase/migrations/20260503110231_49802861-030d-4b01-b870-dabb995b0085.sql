-- =========================================================================
-- 1) Drop obsolete backup tables (audit confirmed: 0 unique rows)
-- =========================================================================
DROP TABLE IF EXISTS public.ai_trip_plans_backup_pre_awin_backfill;
DROP TABLE IF EXISTS public.ai_trip_plans_backup_pre_search_html_revert;
DROP TABLE IF EXISTS public.ai_trip_plans_backup_pre_ss_cleanup;

-- =========================================================================
-- 2) Enable RLS on ai_request_log + restrict SELECT to owner
-- =========================================================================
ALTER TABLE public.ai_request_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_request_log_select_own ON public.ai_request_log;
CREATE POLICY ai_request_log_select_own
  ON public.ai_request_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies → only service_role (which bypasses RLS) can write

-- =========================================================================
-- 3) Enable RLS on ai_response_cache + restrict SELECT to authenticated
-- =========================================================================
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_response_cache_select_auth ON public.ai_response_cache;
CREATE POLICY ai_response_cache_select_auth
  ON public.ai_response_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- No write policies → service_role only

-- =========================================================================
-- 4) Lock down place_details_cache INSERT (service role writes via edge fn)
-- =========================================================================
DROP POLICY IF EXISTS place_details_cache_insert ON public.place_details_cache;

-- SELECT policy retained (already authenticated-only)

-- =========================================================================
-- 5) Profiles: allow trip co-members to see each other's basic profile
-- =========================================================================
DROP POLICY IF EXISTS profiles_select_co_members ON public.profiles;
CREATE POLICY profiles_select_co_members
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trip_members tm_self
      JOIN public.trip_members tm_other
        ON tm_other.trip_id = tm_self.trip_id
      WHERE tm_self.user_id = auth.uid()
        AND tm_other.user_id = profiles.id
    )
  );

-- =========================================================================
-- 6) Set search_path on functions missing it (path-injection hardening)
-- =========================================================================
ALTER FUNCTION public.normalize_trips_destination_country_iso() SET search_path = public;
ALTER FUNCTION public.normalize_passport_nationality_iso() SET search_path = public;
ALTER FUNCTION public.normalize_profile_nationality_iso() SET search_path = public;
ALTER FUNCTION public.trips_backfill_name_columns() SET search_path = public;
ALTER FUNCTION public.notify_admin_new_user() SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- =========================================================================
-- 7) Revoke EXECUTE on internal/trigger SECURITY DEFINER functions
--    These should only run via triggers or service_role, never directly
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.auto_add_trip_owner() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_generate_trip_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admin_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_feedback() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_trip_members_push(uuid, uuid, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_push_itinerary_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_push_new_member() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_push_new_expense() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_push_new_poll() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_analyze_new_feedback() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_trips_destination_country_iso() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_passport_nationality_iso() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_profile_nationality_iso() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trips_backfill_name_columns() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_trip_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_trips_admin_fields() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_musthave_limit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_byitem_has_line_items() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_route_stop_dates() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_entry_requirements_cache() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_places_cache() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_daily_digest() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_error_spike() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sum_places_spend_last_day() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_user_trip_generations_last_hour(uuid) FROM anon, authenticated;
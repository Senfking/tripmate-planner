-- REVOKE from PUBLIC (the implicit grant) on internal/trigger functions only.
-- User-callable RPCs (join_by_code, redeem_invite, regenerate_trip_code, 
-- update_member_role, remove_trip_member, replace_expense_splits,
-- create_expense_line_items_with_claims, delete_expense_line_items_and_claims,
-- resolve_referral_code, get_*, user_*, is_trip_*, sum_*, count_*) are intentionally left alone.

REVOKE EXECUTE ON FUNCTION public.auto_add_trip_owner() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_generate_trip_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_admin_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_new_feedback() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_trip_members_push(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_push_itinerary_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_push_new_member() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_push_new_expense() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_push_new_poll() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_analyze_new_feedback() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_trips_destination_country_iso() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_passport_nationality_iso() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_profile_nationality_iso() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trips_backfill_name_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_trips_admin_fields() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_musthave_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_byitem_has_line_items() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_route_stop_dates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_entry_requirements_cache() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_places_cache() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_daily_digest() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_error_spike() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC;
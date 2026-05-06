-- =============================================================================
-- enforce_trip_members_role_immutable: block direct role escalation
-- =============================================================================
-- The existing RLS policy `trip_members_update_own` (migration 20260328191940)
-- gates UPDATE by `user_id = auth.uid()` only. Because no WITH CHECK clause is
-- supplied, PostgreSQL falls back to USING for the post-update check, and no
-- trigger guards the `role` column. This means any trip member can self-promote
-- with a single statement:
--
--   UPDATE public.trip_members SET role = 'owner'
--   WHERE user_id = auth.uid() AND trip_id = '<some trip id they belong to>';
--
-- The legitimate role-management path is the SECURITY DEFINER RPC
-- `update_member_role(_trip_id, _target_user_id, _new_role)` (migration
-- 20260329195916), which only ever lets owners transition roles. This trigger
-- enforces the same invariant at the row level: any change to `role` must
-- either come from service_role (Stripe / internal jobs) or from a caller who
-- is already an owner of the trip. Members and admins making direct UPDATEs
-- are blocked.
--
-- The WHEN clause keeps unrelated UPDATEs (e.g. attendance_status) cheap.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enforce_trip_members_role_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trip_members
    WHERE trip_id = NEW.trip_id
      AND user_id = auth.uid()
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the trip owner can change a member role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_trip_members_role_immutable ON public.trip_members;
CREATE TRIGGER trg_enforce_trip_members_role_immutable
  BEFORE UPDATE ON public.trip_members
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.enforce_trip_members_role_immutable();

REVOKE EXECUTE ON FUNCTION public.enforce_trip_members_role_immutable() FROM anon, authenticated;

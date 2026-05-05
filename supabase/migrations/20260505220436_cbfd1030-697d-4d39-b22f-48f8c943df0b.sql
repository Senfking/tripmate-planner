-- Fix 1: Add status column to enforce_trips_admin_fields trigger so non-admin
-- members cannot hide a trip from co-members by setting status='draft'.
CREATE OR REPLACE FUNCTION public.enforce_trips_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.route_locked IS DISTINCT FROM NEW.route_locked OR
    OLD.vibe_board_active IS DISTINCT FROM NEW.vibe_board_active OR
    OLD.vibe_board_locked IS DISTINCT FROM NEW.vibe_board_locked OR
    OLD.share_permission IS DISTINCT FROM NEW.share_permission OR
    OLD.settlement_currency IS DISTINCT FROM NEW.settlement_currency OR
    OLD.trip_code IS DISTINCT FROM NEW.trip_code OR
    OLD.enabled_modules IS DISTINCT FROM NEW.enabled_modules
  ) THEN
    IF NOT public.is_trip_admin_or_owner(OLD.id, auth.uid()) THEN
      RAISE EXCEPTION 'Only trip admins or owners can modify these settings';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Fix 2: Tighten plan_activity_comments DELETE policy so a user can only
-- delete their own comments while still being a member of the underlying
-- trip (former members lose delete ability, matching INSERT policy).
DROP POLICY IF EXISTS "plan_activity_comments_delete" ON public.plan_activity_comments;

CREATE POLICY "plan_activity_comments_delete"
  ON public.plan_activity_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ai_trip_plans
      WHERE ai_trip_plans.id = plan_activity_comments.plan_id
        AND public.is_trip_member(ai_trip_plans.trip_id, auth.uid())
    )
  );
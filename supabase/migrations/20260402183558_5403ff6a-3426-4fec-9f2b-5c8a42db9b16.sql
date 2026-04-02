-- 1. Make feedback-screenshots bucket private
UPDATE storage.buckets SET public = false WHERE id = 'feedback-screenshots';

-- 2. Drop existing public SELECT policy on feedback-screenshots
DROP POLICY IF EXISTS "Feedback screenshots are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "feedback_screenshots_select" ON storage.objects;

-- 3. Add owner-only SELECT policy
CREATE POLICY "feedback_screenshots_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'feedback-screenshots' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 4. Fix trips UPDATE policy - drop the overly permissive one
DROP POLICY IF EXISTS "trips_update_member" ON public.trips;

-- 5. Create member-level update (basic fields only) using a trigger to prevent admin field changes
CREATE POLICY "trips_update_member_basic" ON public.trips
  FOR UPDATE TO authenticated
  USING (is_trip_member(id, auth.uid()));

-- 6. Create a trigger function to enforce admin-only fields
CREATE OR REPLACE FUNCTION public.enforce_trips_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If any admin-only field changed, verify caller is admin/owner
  IF (
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

CREATE TRIGGER enforce_trips_admin_fields_trigger
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_trips_admin_fields();
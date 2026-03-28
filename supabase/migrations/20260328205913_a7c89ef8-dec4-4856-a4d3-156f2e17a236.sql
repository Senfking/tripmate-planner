
-- Drop the policy that depends on redeemed_at first
DROP POLICY IF EXISTS "trip_members_insert_member" ON public.trip_members;

-- Now drop the columns
ALTER TABLE public.invites DROP COLUMN redeemed_at;
ALTER TABLE public.invites DROP COLUMN redeemed_by;

-- Recreate trip_members insert policy without referencing redeemed_at
CREATE POLICY "trip_members_insert_member" ON public.trip_members
  FOR INSERT TO authenticated
  WITH CHECK (
    is_trip_member(trip_id, auth.uid())
    OR (trip_members.user_id = auth.uid())
  );

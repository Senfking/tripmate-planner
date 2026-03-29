-- Add created_by as nullable first
ALTER TABLE public.itinerary_items
  ADD COLUMN created_by uuid;

-- Backfill existing rows with a placeholder (trip creator via trip_members owner)
UPDATE public.itinerary_items ii
SET created_by = (
  SELECT tm.user_id FROM public.trip_members tm
  WHERE tm.trip_id = ii.trip_id AND tm.role = 'owner'
  LIMIT 1
)
WHERE ii.created_by IS NULL;

-- Now set NOT NULL and default
ALTER TABLE public.itinerary_items
  ALTER COLUMN created_by SET NOT NULL,
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Replace delete RLS policy
DROP POLICY "itinerary_delete" ON public.itinerary_items;
CREATE POLICY "itinerary_delete" ON public.itinerary_items
  FOR DELETE TO authenticated
  USING (
    (created_by = auth.uid() AND is_trip_member(trip_id, auth.uid()))
    OR is_trip_admin_or_owner(trip_id, auth.uid())
  );
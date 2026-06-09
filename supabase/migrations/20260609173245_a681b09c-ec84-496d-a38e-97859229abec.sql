DROP POLICY IF EXISTS attachments_update ON public.attachments;
CREATE POLICY attachments_update ON public.attachments
  FOR UPDATE
  USING (is_trip_member(trip_id, auth.uid()) AND (created_by = auth.uid() OR is_trip_admin_or_owner(trip_id, auth.uid())))
  WITH CHECK (is_trip_member(trip_id, auth.uid()) AND (created_by = auth.uid() OR is_trip_admin_or_owner(trip_id, auth.uid())));
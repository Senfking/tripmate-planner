DROP POLICY IF EXISTS "share_tokens_insert" ON public.trip_share_tokens;
CREATE POLICY "share_tokens_insert"
  ON public.trip_share_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()));
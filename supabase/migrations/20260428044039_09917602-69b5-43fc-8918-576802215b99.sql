CREATE TABLE public.trip_entry_requirement_acknowledgments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requirement_name text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id, requirement_name)
);

CREATE INDEX idx_trip_entry_req_ack_trip_user
  ON public.trip_entry_requirement_acknowledgments (trip_id, user_id);

ALTER TABLE public.trip_entry_requirement_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all"
  ON public.trip_entry_requirement_acknowledgments
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "members_select_own"
  ON public.trip_entry_requirement_acknowledgments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "members_insert_own"
  ON public.trip_entry_requirement_acknowledgments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "members_delete_own"
  ON public.trip_entry_requirement_acknowledgments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));
CREATE TABLE public.itinerary_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  itinerary_item_id uuid NOT NULL REFERENCES public.itinerary_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('maybe', 'out')),
  UNIQUE (itinerary_item_id, user_id)
);
ALTER TABLE public.itinerary_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_select" ON public.itinerary_attendance
  FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "attendance_insert" ON public.itinerary_attendance
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "attendance_update" ON public.itinerary_attendance
  FOR UPDATE TO authenticated USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "attendance_delete" ON public.itinerary_attendance
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));
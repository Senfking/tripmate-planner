
CREATE TABLE public.shared_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title text NOT NULL,
  claimed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shared_items_select" ON public.shared_items
  FOR SELECT USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "shared_items_insert" ON public.shared_items
  FOR INSERT WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "shared_items_update" ON public.shared_items
  FOR UPDATE USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "shared_items_delete" ON public.shared_items
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.is_trip_admin_or_owner(trip_id, auth.uid())
  );

CREATE INDEX idx_shared_items_trip ON public.shared_items(trip_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_items;

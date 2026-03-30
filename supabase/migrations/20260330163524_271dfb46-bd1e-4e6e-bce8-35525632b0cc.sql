-- Track when each member last viewed a trip itinerary
CREATE TABLE public.trip_last_seen (
  user_id uuid NOT NULL,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, trip_id)
);

ALTER TABLE public.trip_last_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own trip last seen"
ON public.trip_last_seen
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Ensure realtime DELETE payloads include old row data
ALTER TABLE public.itinerary_items REPLICA IDENTITY FULL;
ALTER TABLE public.itinerary_attendance REPLICA IDENTITY FULL;
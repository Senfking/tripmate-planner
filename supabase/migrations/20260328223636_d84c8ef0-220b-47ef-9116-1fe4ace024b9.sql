
-- Create trip_route_stops table
CREATE TABLE public.trip_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.trip_proposals(id) ON DELETE SET NULL,
  destination text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  position integer NOT NULL DEFAULT 0,
  notes text,
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_route_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "route_stops_select" ON public.trip_route_stops
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "route_stops_insert" ON public.trip_route_stops
  FOR INSERT TO authenticated
  WITH CHECK (public.is_trip_admin_or_owner(trip_id, auth.uid()));

CREATE POLICY "route_stops_update" ON public.trip_route_stops
  FOR UPDATE TO authenticated
  USING (public.is_trip_admin_or_owner(trip_id, auth.uid()));

CREATE POLICY "route_stops_delete" ON public.trip_route_stops
  FOR DELETE TO authenticated
  USING (public.is_trip_admin_or_owner(trip_id, auth.uid()));

-- Validation trigger for date logic
CREATE OR REPLACE FUNCTION public.validate_route_stop_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _overlap RECORD;
BEGIN
  IF NEW.end_date <= NEW.start_date THEN
    RAISE EXCEPTION 'End date must be after start date';
  END IF;

  SELECT * INTO _overlap
  FROM public.trip_route_stops
  WHERE trip_id = NEW.trip_id
    AND id IS DISTINCT FROM NEW.id
    AND NEW.start_date < end_date
    AND NEW.end_date > start_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Dates overlap with stop at position %', _overlap.position;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_route_stop_dates_trigger
  BEFORE INSERT OR UPDATE ON public.trip_route_stops
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_route_stop_dates();

-- Add route_locked to trips
ALTER TABLE public.trips ADD COLUMN route_locked boolean NOT NULL DEFAULT false;

-- Remove single-confirm columns from trip_proposals
ALTER TABLE public.trip_proposals DROP CONSTRAINT IF EXISTS trip_proposals_confirmed_date_option_fkey;
ALTER TABLE public.trip_proposals DROP COLUMN IF EXISTS adopted;
ALTER TABLE public.trip_proposals DROP COLUMN IF EXISTS confirmed_date_option_id;

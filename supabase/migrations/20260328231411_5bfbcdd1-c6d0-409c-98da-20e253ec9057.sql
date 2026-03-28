CREATE OR REPLACE FUNCTION public.validate_route_stop_dates()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _overlap RECORD;
BEGIN
  -- End date must not be before start date (same day is allowed)
  IF NEW.end_date < NEW.start_date THEN
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
$function$;
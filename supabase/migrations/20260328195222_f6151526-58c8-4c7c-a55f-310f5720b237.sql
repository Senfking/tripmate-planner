DROP TRIGGER IF EXISTS trg_auto_add_trip_owner ON public.trips;

CREATE TRIGGER trg_auto_add_trip_owner
BEFORE INSERT ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_trip_owner();
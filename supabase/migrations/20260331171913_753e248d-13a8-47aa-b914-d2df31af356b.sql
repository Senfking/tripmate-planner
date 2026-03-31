-- Add attendance_status column to trip_members
ALTER TABLE public.trip_members
  ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'pending';

-- Backfill: existing members are assumed going
UPDATE public.trip_members SET attendance_status = 'going' WHERE attendance_status = 'pending';

-- Update the auto_add_trip_owner function to set attendance_status = 'going' for owners
CREATE OR REPLACE FUNCTION public.auto_add_trip_owner()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.trip_members (trip_id, user_id, role, attendance_status)
  VALUES (NEW.id, auth.uid(), 'owner', 'going');
  RETURN NEW;
END;
$function$;
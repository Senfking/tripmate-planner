CREATE OR REPLACE FUNCTION public.is_trip_member(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members
    WHERE trip_id = _trip_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_trip_admin_or_owner(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members
    WHERE trip_id = _trip_id AND user_id = _user_id AND role IN ('owner', 'admin')
  );
$$;
CREATE OR REPLACE FUNCTION public.shares_trip_with(_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members a
    JOIN public.trip_members b ON b.trip_id = a.trip_id
    WHERE a.user_id = auth.uid()
      AND b.user_id = _other
  );
$$;

CREATE POLICY "profiles_select_trip_members"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.shares_trip_with(id));
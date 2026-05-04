DROP POLICY IF EXISTS profiles_select_co_members ON public.profiles;

DROP FUNCTION IF EXISTS public.get_public_profiles(uuid[]);

CREATE FUNCTION public.get_public_profiles(_user_ids uuid[])
RETURNS TABLE(id uuid, display_name text, avatar_url text, nationality_iso text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.nationality_iso
  FROM public.profiles p
  WHERE p.id = ANY(_user_ids)
    AND (
      p.id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.trip_members tm_self
        JOIN public.trip_members tm_other ON tm_other.trip_id = tm_self.trip_id
        WHERE tm_self.user_id = auth.uid() AND tm_other.user_id = p.id
      )
    );
$$;

DROP POLICY IF EXISTS ai_response_cache_select_auth ON public.ai_response_cache;

CREATE POLICY ai_response_cache_service_role_all
ON public.ai_response_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
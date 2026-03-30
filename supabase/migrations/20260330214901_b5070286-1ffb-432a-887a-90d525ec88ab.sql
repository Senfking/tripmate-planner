
-- Remove the broad SELECT policy - it defeats the purpose
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;

-- Drop the security invoker view (won't work without broad SELECT)
DROP VIEW IF EXISTS public.profiles_public;

-- Create a SECURITY DEFINER function to fetch public profile data for trip members
CREATE OR REPLACE FUNCTION public.get_public_profiles(_user_ids uuid[])
  RETURNS TABLE(id uuid, display_name text, avatar_url text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY(_user_ids);
$$;

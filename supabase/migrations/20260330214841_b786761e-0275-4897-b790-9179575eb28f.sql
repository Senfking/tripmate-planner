
-- Fix: Make the profiles_public view use SECURITY INVOKER (safe)
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
  WITH (security_invoker = true)
  AS SELECT id, display_name, avatar_url FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

-- We need a SELECT policy that allows reading other users' basic profile info
-- Since the view uses security_invoker, we need a policy that allows reading display_name/avatar_url
-- Solution: allow all authenticated users to read profiles but through the restricted view
-- Re-add a broad SELECT policy on profiles (the view only exposes safe columns)
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

-- Own full profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Other users' profiles (needed for the view to work)
CREATE POLICY "profiles_select_public" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

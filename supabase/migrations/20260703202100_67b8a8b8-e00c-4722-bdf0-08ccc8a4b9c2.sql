
-- 1) concierge_messages: prevent impersonation
DROP POLICY IF EXISTS concierge_messages_insert ON public.concierge_messages;
CREATE POLICY concierge_messages_insert ON public.concierge_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'user'
    AND is_trip_member(trip_id, auth.uid())
  );

-- 2) platform_admins table + helper, replace hardcoded UUID in trip_templates policies
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Only admins can see the admin list; everyone else gets nothing
CREATE POLICY platform_admins_self_read ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id
  );
$$;

-- Seed the current admin
INSERT INTO public.platform_admins (user_id)
VALUES ('1d5b21fe-f74c-429b-8d9d-938a4f295013'::uuid)
ON CONFLICT (user_id) DO NOTHING;

-- Replace trip_templates admin policies
DROP POLICY IF EXISTS trip_templates_admin_insert ON public.trip_templates;
DROP POLICY IF EXISTS trip_templates_admin_update ON public.trip_templates;
DROP POLICY IF EXISTS trip_templates_admin_delete ON public.trip_templates;

CREATE POLICY trip_templates_admin_insert ON public.trip_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY trip_templates_admin_update ON public.trip_templates
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY trip_templates_admin_delete ON public.trip_templates
  FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

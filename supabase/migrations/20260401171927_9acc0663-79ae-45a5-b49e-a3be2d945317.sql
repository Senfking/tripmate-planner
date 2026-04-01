CREATE OR REPLACE FUNCTION public.resolve_referral_code(_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE referral_code = _code LIMIT 1;
$$;
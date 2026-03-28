
-- Fix search_path on enforce_musthave_limit
ALTER FUNCTION public.enforce_musthave_limit() SET search_path = public;

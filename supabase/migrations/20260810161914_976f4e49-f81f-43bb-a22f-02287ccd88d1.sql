REVOKE ALL ON public.exchange_rate_cache FROM anon;
REVOKE ALL ON public.exchange_rate_cache FROM authenticated;
GRANT SELECT ON public.exchange_rate_cache TO authenticated;
GRANT ALL ON public.exchange_rate_cache TO service_role;

DROP POLICY IF EXISTS rates_select ON public.exchange_rate_cache;
CREATE POLICY rates_select ON public.exchange_rate_cache
  FOR SELECT TO authenticated
  USING (true);
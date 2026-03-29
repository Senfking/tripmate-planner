CREATE TABLE public.exchange_rate_cache (
  base_currency text PRIMARY KEY,
  rates jsonb NOT NULL,
  fetched_at timestamptz DEFAULT now()
);

ALTER TABLE public.exchange_rate_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rates_select" ON public.exchange_rate_cache
  FOR SELECT TO authenticated USING (true);

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
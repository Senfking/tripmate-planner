ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS fx_base text;

COMMENT ON COLUMN public.expenses.fx_rate IS
  'Snapshot of (1 fx_base) -> (currency) rate at insert/edit time. Frozen so settlement totals do not drift with daily rate updates. NULL falls back to live rates from exchange_rate_cache.';
COMMENT ON COLUMN public.expenses.fx_base IS
  'Currency that fx_rate is denominated against. EUR in current implementation; column kept flexible for trips that may snapshot against a different reference in the future.';

DO $$
DECLARE
  eur_rates jsonb;
BEGIN
  SELECT rates INTO eur_rates
  FROM public.exchange_rate_cache
  WHERE base_currency = 'EUR';

  IF eur_rates IS NULL THEN
    RAISE LOG 'expense fx snapshot backfill skipped: no EUR rates cached yet';
    RETURN;
  END IF;

  UPDATE public.expenses
  SET
    fx_rate = CASE
      WHEN currency = 'EUR' THEN 1
      WHEN eur_rates ? currency THEN (eur_rates->>currency)::numeric
      ELSE NULL
    END,
    fx_base = CASE
      WHEN currency = 'EUR' OR (eur_rates ? currency) THEN 'EUR'
      ELSE NULL
    END
  WHERE fx_rate IS NULL;

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'expense fx snapshot backfill failed: %', SQLERRM;
END $$;
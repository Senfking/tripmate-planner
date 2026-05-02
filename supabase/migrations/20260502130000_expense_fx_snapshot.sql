-- =============================================================================
-- Snapshot FX rate per expense at insert time
--
-- Background: balance and settlement totals were computed by re-converting
-- every expense's amount through `exchange_rate_cache` on every render. The
-- cache is overwritten on a cron, so a 10-day-old IDR expense's settlement
-- equivalent (e.g. AED) drifts whenever IDR/EUR or AED/EUR moves on the
-- market. Users see the "you owe" total change between page loads despite no
-- new expenses.
--
-- Fix: freeze the rate at insert time. The frontend captures
-- `eur_rates[expense.currency]` from the same EUR-keyed cache it already
-- queries, then writes it onto the expense row. Display code prefers the
-- snapshotted rate; missing snapshots fall back to live rates so old rows
-- still render before backfill runs.
--
-- This migration:
--   1. Adds `fx_rate numeric` and `fx_base text` to `expenses`. Both nullable
--      so legacy rows remain valid until backfill (or live-rate fallback)
--      handles them.
--   2. Backfills existing rows from the current EUR cache row. Anything we
--      can't price (currency missing from the cache) stays NULL — display
--      code will fall back to live conversion for those, same as before.
--      Running today freezes today's rates onto existing expenses, stopping
--      further drift; rows that had nothing to anchor to keep behaving
--      exactly as they did pre-migration.
-- =============================================================================

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

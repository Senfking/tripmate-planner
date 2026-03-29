

## Plan: Upgrade Exchange Rate System (150+ currencies)

### Files to create/modify

1. **Migration**: `exchange_rate_cache` table + pg_cron schedule
2. **Edge function**: `supabase/functions/refresh-exchange-rates/index.ts`
3. **`src/hooks/useExpenses.ts`** — DB query instead of Frankfurter API
4. **`src/components/expenses/SettlementCurrencyPicker.tsx`** — grouped list, search, dynamic "Other" from cache
5. **`src/components/expenses/ExpensesTab.tsx`** — stale/empty rates warning

### 1. Database migration

```sql
-- Table
CREATE TABLE public.exchange_rate_cache (
  base_currency text PRIMARY KEY,
  rates jsonb NOT NULL,
  fetched_at timestamptz DEFAULT now()
);
ALTER TABLE public.exchange_rate_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rates_select" ON public.exchange_rate_cache
  FOR SELECT TO authenticated USING (true);

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

Then via **insert query** (not migration, contains project-specific URL):

```sql
SELECT cron.schedule(
  'refresh-exchange-rates',
  '0 6 * * *',
  $$ SELECT supabase_functions.http_request(
    'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/refresh-exchange-rates',
    'POST',
    '{"Content-Type": "application/json"}',
    '{}',
    5000
  ) $$
);
```

This uses the built-in `supabase_functions.http_request()` helper which handles auth automatically — no hardcoded service role key.

### 2. Edge function: `refresh-exchange-rates`

- Fetches `https://open.er-api.com/v6/latest/{BASE}` for EUR, USD, GBP (3 calls)
- Upserts into `exchange_rate_cache` using service role client (from `SUPABASE_SERVICE_ROLE_KEY` secret, already configured)
- CORS headers, no JWT verification needed (invoked by cron)
- Returns `{ success: true, updated: ["EUR","USD","GBP"] }`
- Also invoke once immediately after deploy to seed the cache

### 3. Frontend: `useExpenses.ts`

Replace Frankfurter fetch with:

- Query `exchange_rate_cache` for `base_currency = settlementCurrency`
- If no direct row, cross-calculate via EUR intermediate: `X/settlement = X/EUR ÷ settlement/EUR`
- If no cache at all, return empty rates with `fetchedAt: null`
- Expose `ratesStale` (fetched_at > 25h) and `ratesEmpty` flags
- `staleTime: 1h` on the query

### 4. `SettlementCurrencyPicker.tsx`

- Regional groups with flag emojis (Europe, Americas, Asia Pacific, Middle East & Africa — ~35 predefined)
- Search input filtering by code or name
- Accept `cachedCurrencyCodes` prop from useExpenses (keys from EUR cache row)
- Searched currencies found in cache but not in predefined groups appear under "Other currencies"
- ScrollArea with max-height ~300px

### 5. `ExpensesTab.tsx`

- Warning banner when `ratesStale`: "Exchange rates may be outdated"
- Warning banner when `ratesEmpty`: "Exchange rates unavailable — amounts shown in original currencies"

### No changes to

- Balance/settlement calculations (`settlementCalc.ts`)
- Settle-up confirmation flow
- Anything outside Expenses tab + new edge function + migration


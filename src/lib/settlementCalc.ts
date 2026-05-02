export type Rates = Record<string, number>;

/** Snapshot of the per-expense FX rate at insert/edit time.
 *  fx_rate represents (1 fx_base) -> (expense.currency); same convention as
 *  the rates map. When provided, convertAmount uses this for the
 *  expense.currency -> fx_base leg instead of looking up live rates,
 *  preventing day-to-day drift in settlement totals. */
export interface FxSnapshot {
  fx_rate: number | null;
  fx_base: string | null;
}

/** Convert amount from `from` currency to `to` currency.
 *  Returns null if rates are unavailable for the conversion.
 *  `rates` is keyed by currency code, values relative to `baseCurrency`.
 *  e.g. baseCurrency=EUR, rates={USD:1.08, GBP:0.86} means 1 EUR = 1.08 USD
 *
 *  When `snapshot` is provided with both fields populated, the `from -> fx_base`
 *  conversion uses the frozen rate; only the `fx_base -> to` leg goes through
 *  live rates. If snapshot is missing or incomplete, falls back to the
 *  pure-live behaviour (used for legacy rows pre-backfill). */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  baseCurrency: string,
  rates: Rates,
  snapshot?: FxSnapshot | null,
): number | null {
  if (from === to) return amount;

  const snapRate = snapshot?.fx_rate;
  const snapBase = snapshot?.fx_base;
  if (snapRate != null && snapRate > 0 && snapBase) {
    // Leg 1: amount in `from` -> amount in fx_base.
    // fx_rate convention: 1 fx_base = fx_rate `from`. So inFxBase = amount / fx_rate.
    // (When from === fx_base the snapshot collapses to identity; we still honour
    //  the column rather than the rates map so rounding stays deterministic.)
    const inFxBase = from === snapBase ? amount : amount / snapRate;

    if (to === snapBase) return inFxBase;

    // Leg 2: fx_base -> to via live rates.
    const toRate = to === baseCurrency ? 1 : rates[to];
    const fxBaseRate = snapBase === baseCurrency ? 1 : rates[snapBase];
    if (toRate == null || fxBaseRate == null || fxBaseRate <= 0) return null;
    return inFxBase * (toRate / fxBaseRate);
  }

  // Live-rate fallback: behaves exactly as before snapshotting was added.
  const fromRate = from === baseCurrency ? 1 : rates[from];
  const toRate = to === baseCurrency ? 1 : rates[to];
  if (fromRate == null || toRate == null) return null;
  const inBase = amount / fromRate;
  return inBase * toRate;
}

export interface BalanceEntry {
  userId: string;
  displayName: string;
  balance: number; // positive = owed money, negative = owes money
}

export interface Settlement {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface ExpenseWithSplits {
  id: string;
  payer_id: string;
  amount: number;
  currency: string;
  /** FX rate snapshot at insert/edit time. Null on legacy rows -> live fallback. */
  fx_rate?: number | null;
  fx_base?: string | null;
  splits: { user_id: string; share_amount: number }[];
}

/** Calculate net balances. Returns { balances, excludedCount } where
 *  excludedCount is the number of expenses skipped due to missing rates. */
export function calcNetBalances(
  expenses: ExpenseWithSplits[],
  settlementCurrency: string,
  baseCurrency: string,
  rates: Rates,
  profiles: Record<string, string>
): { balances: BalanceEntry[]; excludedCount: number } {
  const balanceMap: Record<string, number> = {};
  let excludedCount = 0;

  for (const exp of expenses) {
    const snapshot: FxSnapshot = { fx_rate: exp.fx_rate ?? null, fx_base: exp.fx_base ?? null };
    const payerAmount = convertAmount(exp.amount, exp.currency, settlementCurrency, baseCurrency, rates, snapshot);
    if (payerAmount == null) {
      // Cannot convert - skip this expense entirely
      excludedCount++;
      continue;
    }

    balanceMap[exp.payer_id] = (balanceMap[exp.payer_id] || 0) + payerAmount;

    for (const split of exp.splits) {
      const splitAmount = convertAmount(split.share_amount, exp.currency, settlementCurrency, baseCurrency, rates, snapshot);
      if (splitAmount == null) continue; // already counted as excluded above
      balanceMap[split.user_id] = (balanceMap[split.user_id] || 0) - splitAmount;
    }
  }

  const balances = Object.entries(balanceMap)
    .filter(([, b]) => Math.abs(b) > 0.005)
    .map(([userId, balance]) => ({
      userId,
      displayName: profiles[userId] || "Unknown",
      balance: Math.round(balance * 100) / 100,
    }));

  return { balances, excludedCount };
}

export function calcSettlements(
  balances: BalanceEntry[],
): Settlement[] {
  const debtors: { userId: string; name: string; amount: number }[] = [];
  const creditors: { userId: string; name: string; amount: number }[] = [];

  for (const b of balances) {
    if (b.balance < -0.005) {
      debtors.push({ userId: b.userId, name: b.displayName, amount: Math.abs(b.balance) });
    } else if (b.balance > 0.005) {
      creditors.push({ userId: b.userId, name: b.displayName, amount: b.balance });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const transfer = Math.min(debtors[di].amount, creditors[ci].amount);
    if (transfer > 0.005) {
      settlements.push({
        from: debtors[di].userId,
        fromName: debtors[di].name,
        to: creditors[ci].userId,
        toName: creditors[ci].name,
        amount: Math.round(transfer * 100) / 100,
      });
    }
    debtors[di].amount -= transfer;
    creditors[ci].amount -= transfer;
    if (debtors[di].amount < 0.005) di++;
    if (creditors[ci].amount < 0.005) ci++;
  }

  return settlements;
}

export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

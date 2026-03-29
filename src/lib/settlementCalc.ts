export type Rates = Record<string, number>;

export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Rates
): number {
  if (from === to) return amount;
  // rates are keyed as "FROM_TO" or we derive from base-relative rates
  // We assume rates object has keys relative to the base currency used in the fetch
  // e.g. if base=EUR then rates = { USD: 1.08, GBP: 0.86, ... }
  // To convert FROM -> TO: amount / rates[FROM] * rates[TO]
  // If FROM is the base, rates[FROM] is 1
  const fromRate = from === "EUR" ? 1 : rates[from] ?? 1;
  const toRate = to === "EUR" ? 1 : rates[to] ?? 1;
  // Actually we need to handle arbitrary base. Let's normalise via EUR as intermediary
  // But our fetch uses base=settlementCurrency, so rates are relative to that.
  // We'll pass baseCurrency alongside rates.
  return amount;
}

/** Convert amount from `from` currency to `to` currency.
 *  `rates` is keyed by currency code, values relative to `baseCurrency`.
 *  e.g. baseCurrency=EUR, rates={USD:1.08, GBP:0.86} means 1 EUR = 1.08 USD */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  baseCurrency: string,
  rates: Rates
): number {
  if (from === to) return amount;
  // Convert to base first, then to target
  const fromRate = from === baseCurrency ? 1 : rates[from];
  const toRate = to === baseCurrency ? 1 : rates[to];
  if (fromRate == null || toRate == null) return amount; // fallback 1:1
  // 1 base = fromRate units of `from`, so `amount` in `from` = amount / fromRate in base
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
  splits: { user_id: string; share_amount: number }[];
}

export function calcNetBalances(
  expenses: ExpenseWithSplits[],
  settlementCurrency: string,
  baseCurrency: string,
  rates: Rates,
  profiles: Record<string, string>
): BalanceEntry[] {
  const balances: Record<string, number> = {};

  for (const exp of expenses) {
    const payerAmount = convertAmount(exp.amount, exp.currency, settlementCurrency, baseCurrency, rates);
    balances[exp.payer_id] = (balances[exp.payer_id] || 0) + payerAmount;

    for (const split of exp.splits) {
      const splitAmount = convertAmount(split.share_amount, exp.currency, settlementCurrency, baseCurrency, rates);
      balances[split.user_id] = (balances[split.user_id] || 0) - splitAmount;
    }
  }

  return Object.entries(balances)
    .filter(([, b]) => Math.abs(b) > 0.005)
    .map(([userId, balance]) => ({
      userId,
      displayName: profiles[userId] || "Unknown",
      balance: Math.round(balance * 100) / 100,
    }));
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

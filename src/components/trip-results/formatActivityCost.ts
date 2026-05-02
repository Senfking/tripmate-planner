/**
 * Shared cost formatter for activity / per-person amounts on the trip-results
 * surface. Mirrors the budget bar's behaviour: primary line is the user's
 * profile.default_currency (converted via EUR cross-rate), with the destination
 * currency as a smaller subtitle when it differs.
 *
 * Falls back to destination-currency only when conversion is unavailable
 * (rates not loaded, or currency missing from the EUR rate row).
 */
export interface ActivityCostFormatter {
  /** Primary line, e.g. "~AED 28" — always in user currency when conversion works. */
  primary: (amount: number) => string;
  /** Secondary line, e.g. "≈ SGD 28". Returns null when no conversion happened. */
  secondary: (amount: number) => string | null;
}

interface BuildArgs {
  destCurrency: string;
  userCurrency: string;
  convertToUserCurrency: (amount: number) => number | null;
  /** Localised currency formatter — same one TripResultsView uses for the budget bar. */
  formatBudget: (amount: number, code: string) => string;
}

export function buildActivityCostFormatter({
  destCurrency,
  userCurrency,
  convertToUserCurrency,
  formatBudget,
}: BuildArgs): ActivityCostFormatter {
  const sameCurrency = destCurrency.toUpperCase() === userCurrency.toUpperCase();
  return {
    primary: (amount: number) => {
      if (sameCurrency) return `~${formatBudget(amount, destCurrency)}`;
      const converted = convertToUserCurrency(amount);
      if (converted == null) {
        // Rates unavailable — fall back to destination currency rather than
        // hiding the price entirely.
        return `~${formatBudget(amount, destCurrency)}`;
      }
      return `~${formatBudget(converted, userCurrency)}`;
    },
    secondary: (amount: number) => {
      if (sameCurrency) return null;
      const converted = convertToUserCurrency(amount);
      if (converted == null) return null;
      return `≈ ${formatBudget(amount, destCurrency)}`;
    },
  };
}

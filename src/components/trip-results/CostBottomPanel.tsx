import { useState } from "react";
import { Wallet, ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  totalActivities: number;
  total: number;
  dailyAvg: number;
  /** Destination/native currency code, e.g. "THB". Used for the secondary line. */
  currency: string;
  categories: [string, number][];
  /** Optional user profile currency code, e.g. "AED". When provided AND
   * different from `currency`, the primary display uses converted values
   * with the destination-currency total/daily as a smaller subtitle. */
  userCurrency?: string;
  /** Converter from destination-currency amount → user-currency amount.
   * Returns null when rates are unavailable so we fall back to native. */
  convertToUserCurrency?: (amount: number) => number | null;
  /** Locale-aware currency formatter. */
  formatBudget?: (amount: number, code: string) => string;
}

export function CostBottomPanel({
  totalActivities,
  total,
  dailyAvg,
  currency,
  categories,
  userCurrency,
  convertToUserCurrency,
  formatBudget,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const conversionEnabled =
    !!userCurrency && !!convertToUserCurrency && !!formatBudget && userCurrency.toUpperCase() !== currency.toUpperCase();
  const totalConverted = conversionEnabled ? convertToUserCurrency!(total) : null;
  const dailyConverted = conversionEnabled ? convertToUserCurrency!(dailyAvg) : null;
  const showConverted = conversionEnabled && totalConverted !== null;

  const totalPrimary = showConverted
    ? `~${formatBudget!(totalConverted!, userCurrency!)}`
    : `~${currency}${total.toLocaleString()}`;
  const dailyPrimary =
    showConverted && dailyConverted !== null
      ? `~${formatBudget!(dailyConverted, userCurrency!)}/day`
      : `~${currency}${dailyAvg.toLocaleString()}/day`;

  return (
    <>
      {/* Slide-up category breakdown */}
      {expanded && (
        <div className="absolute bottom-full left-0 right-0 bg-card border-t border-x border-border rounded-t-xl shadow-lg animate-fade-in">
          <div className="max-w-[700px] mx-auto px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-foreground mb-2">Cost breakdown per person</p>
            {categories.map(([cat, amount]) => {
              const catConverted = conversionEnabled ? convertToUserCurrency!(amount) : null;
              const catPrimary =
                showConverted && catConverted !== null
                  ? `~${formatBudget!(catConverted, userCurrency!)}`
                  : `~${currency}${Math.round(amount)}`;
              return (
                <div key={cat} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{cat}</span>
                  <span className="text-xs font-mono text-foreground">{catPrimary}</span>
                </div>
              );
            })}
            <div className="border-t border-border pt-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Total per person</span>
              <span className="text-xs font-mono font-semibold text-[#0D9488]">{totalPrimary}</span>
            </div>
            {showConverted && (
              <div className="flex items-center justify-end">
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                  ≈ {currency} {total.toLocaleString()} locally
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cost summary line */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-w-0"
      >
        <Wallet className="h-3.5 w-3.5 text-[#0D9488] shrink-0" />
        <span className="truncate text-left">
          <span className="font-medium text-foreground">{totalActivities} activities</span>
          {" · "}
          <span className="font-mono">{totalPrimary}</span>
          {" · "}
          <span className="font-mono">{dailyPrimary}</span>
          {showConverted && (
            <span className="block text-[10px] text-muted-foreground/60 font-mono">
              ≈ {currency} {total.toLocaleString()} locally
            </span>
          )}
        </span>
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronUp className="h-3 w-3 shrink-0" />}
      </button>
    </>
  );
}

import { useMemo } from "react";
import { ExpenseRow, SplitRow, MemberProfile } from "@/hooks/useExpenses";
import { convertAmount, formatCurrency, Rates } from "@/lib/settlementCalc";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  displayName: string;
  expenses: ExpenseRow[];
  splits: SplitRow[];
  members: MemberProfile[];
  settlementCurrency: string;
  rates: Rates;
  ratesFetchedAt: Date | null;
}

interface AuditLine {
  title: string;
  payer?: string;
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number | null;
  runningTotal: number;
}

export function BalanceAuditSheet({
  open, onOpenChange, userId, displayName, expenses, splits,
  members, settlementCurrency, rates, ratesFetchedAt,
}: Props) {
  const profileMap = useMemo(
    () => Object.fromEntries(members.map((m) => [m.userId, m.displayName])),
    [members]
  );

  const audit = useMemo(() => {
    const paid: AuditLine[] = [];
    const owed: AuditLine[] = [];
    const conversions: { from: string; amount: number; converted: number; currency: string }[] = [];
    let totalPaid = 0;
    let totalOwed = 0;

    for (const exp of expenses) {
      // What they paid
      if (exp.payer_id === userId) {
        const converted = convertAmount(exp.amount, exp.currency, settlementCurrency, settlementCurrency, rates);
        if (converted != null) {
          totalPaid += converted;
          if (exp.currency !== settlementCurrency) {
            conversions.push({ from: exp.currency, amount: exp.amount, converted, currency: settlementCurrency });
          }
        }
        paid.push({
          title: exp.title,
          originalAmount: exp.amount,
          originalCurrency: exp.currency,
          convertedAmount: converted,
          runningTotal: totalPaid,
        });
      }

      // What they owe (their split share)
      const mySplits = splits.filter((s) => s.expense_id === exp.id && s.user_id === userId);
      for (const s of mySplits) {
        const converted = convertAmount(s.share_amount, exp.currency, settlementCurrency, settlementCurrency, rates);
        if (converted != null) {
          totalOwed += converted;
          if (exp.currency !== settlementCurrency) {
            conversions.push({ from: exp.currency, amount: s.share_amount, converted, currency: settlementCurrency });
          }
        }
        owed.push({
          title: exp.title,
          payer: profileMap[exp.payer_id] || "Unknown",
          originalAmount: s.share_amount,
          originalCurrency: exp.currency,
          convertedAmount: converted,
          runningTotal: totalOwed,
        });
      }
    }

    const netBalance = totalPaid - totalOwed;
    // Deduplicate conversions by currency
    const uniqueConversions = new Map<string, typeof conversions[0]>();
    for (const c of conversions) {
      if (!uniqueConversions.has(c.from)) uniqueConversions.set(c.from, c);
    }

    return { paid, owed, totalPaid, totalOwed, netBalance, conversions: [...uniqueConversions.values()] };
  }, [expenses, splits, userId, settlementCurrency, rates, profileMap]);

  const ratesDateStr = ratesFetchedAt ? format(ratesFetchedAt, "MMM d, yyyy 'at' HH:mm") : "unknown date";

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`How ${displayName}'s balance was calculated`}
    >
      <div className="space-y-5 pb-4 max-h-[70vh] overflow-y-auto">
        {/* What they paid */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            What {displayName} paid
          </h3>
          {audit.paid.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No expenses paid</p>
          ) : (
            <div className="space-y-1">
              {audit.paid.map((line, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[180px]">{line.title}</span>
                  <div className="text-right shrink-0">
                    {line.originalCurrency !== settlementCurrency ? (
                      <span>
                        <span className="text-muted-foreground">
                          {formatCurrency(line.originalAmount, line.originalCurrency)}
                        </span>
                        {line.convertedAmount != null && (
                          <>
                            <ArrowRight className="inline h-3 w-3 mx-0.5 text-muted-foreground" />
                            <span className="font-medium">{formatCurrency(line.convertedAmount, settlementCurrency)}</span>
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="font-medium">{formatCurrency(line.originalAmount, settlementCurrency)}</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-muted mt-1">
                <span className="font-semibold">Total paid</span>
                <span className="font-semibold">{formatCurrency(audit.totalPaid, settlementCurrency)}</span>
              </div>
            </div>
          )}
        </div>

        {/* What they owe */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {displayName}'s share of expenses
          </h3>
          {audit.owed.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No expense shares</p>
          ) : (
            <div className="space-y-1">
              {audit.owed.map((line, i) => (
                <div key={i} className="flex items-center justify-between text-xs gap-2">
                  <div className="min-w-0">
                    <span className="truncate block max-w-[160px]">{line.title}</span>
                    <span className="text-[11px] text-muted-foreground">paid by {line.payer}</span>
                  </div>
                  <div className="text-right shrink-0">
                    {line.originalCurrency !== settlementCurrency ? (
                      <span>
                        <span className="text-muted-foreground">
                          {formatCurrency(line.originalAmount, line.originalCurrency)}
                        </span>
                        {line.convertedAmount != null && (
                          <>
                            <ArrowRight className="inline h-3 w-3 mx-0.5 text-muted-foreground" />
                            <span className="font-medium">{formatCurrency(line.convertedAmount, settlementCurrency)}</span>
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="font-medium">{formatCurrency(line.originalAmount, settlementCurrency)}</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-muted mt-1">
                <span className="font-semibold">Total share</span>
                <span className="font-semibold">{formatCurrency(audit.totalOwed, settlementCurrency)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Final calculation */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Final calculation
          </h3>
          <div className="flex justify-between text-sm">
            <span>{displayName} paid</span>
            <span className="font-medium">{formatCurrency(audit.totalPaid, settlementCurrency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>{displayName}'s total share</span>
            <span className="font-medium">−{formatCurrency(audit.totalOwed, settlementCurrency)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold pt-1 border-t border-muted">
            <span>Net balance</span>
            <span className={audit.netBalance > 0.005 ? "text-emerald-600" : audit.netBalance < -0.005 ? "text-red-500" : ""}>
              {formatCurrency(Math.abs(audit.netBalance), settlementCurrency)}
              {audit.netBalance > 0.005 ? " (owed)" : audit.netBalance < -0.005 ? " (owes)" : " (settled)"}
            </span>
          </div>
        </div>

        {/* Conversion notes */}
        {audit.conversions.length > 0 && (
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <p className="font-medium">Currency conversions used:</p>
            {audit.conversions.map((c, i) => (
              <p key={i}>
                * {formatCurrency(c.amount, c.from)} → {formatCurrency(c.converted, c.currency)} using rate from {ratesDateStr}
              </p>
            ))}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

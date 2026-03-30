import { useMemo, useState } from "react";
import { ExpenseRow, SplitRow, MemberProfile } from "@/hooks/useExpenses";
import { convertAmount, formatCurrency, Rates } from "@/lib/settlementCalc";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
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
}

export function BalanceAuditSheet({
  open, onOpenChange, userId, displayName, expenses, splits,
  members, settlementCurrency, rates, ratesFetchedAt,
}: Props) {
  const [showPaidDetail, setShowPaidDetail] = useState(false);
  const [showOwedDetail, setShowOwedDetail] = useState(false);

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
      if (exp.payer_id === userId) {
        const converted = convertAmount(exp.amount, exp.currency, settlementCurrency, settlementCurrency, rates);
        if (converted != null) totalPaid += converted;
        if (exp.currency !== settlementCurrency && converted != null) {
          conversions.push({ from: exp.currency, amount: exp.amount, converted, currency: settlementCurrency });
        }
        paid.push({
          title: exp.title,
          originalAmount: exp.amount,
          originalCurrency: exp.currency,
          convertedAmount: converted,
        });
      }

      const mySplits = splits.filter((s) => s.expense_id === exp.id && s.user_id === userId);
      for (const s of mySplits) {
        const converted = convertAmount(s.share_amount, exp.currency, settlementCurrency, settlementCurrency, rates);
        if (converted != null) totalOwed += converted;
        if (exp.currency !== settlementCurrency && converted != null) {
          conversions.push({ from: exp.currency, amount: s.share_amount, converted, currency: settlementCurrency });
        }
        owed.push({
          title: exp.title,
          payer: profileMap[exp.payer_id] || "Unknown",
          originalAmount: s.share_amount,
          originalCurrency: exp.currency,
          convertedAmount: converted,
        });
      }
    }

    const netBalance = totalPaid - totalOwed;
    const uniqueConversions = new Map<string, typeof conversions[0]>();
    for (const c of conversions) {
      if (!uniqueConversions.has(c.from)) uniqueConversions.set(c.from, c);
    }

    return { paid, owed, totalPaid, totalOwed, netBalance, conversions: [...uniqueConversions.values()] };
  }, [expenses, splits, userId, settlementCurrency, rates, profileMap]);

  const ratesDateStr = ratesFetchedAt ? format(ratesFetchedAt, "MMM d, yyyy 'at' HH:mm") : "unknown date";

  const renderLine = (line: AuditLine, i: number) => (
    <div key={i} className="flex items-center justify-between text-xs gap-2">
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
  );

  const renderOwedLine = (line: AuditLine, i: number) => (
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
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`How ${displayName}'s balance was calculated`}
    >
      <div className="space-y-5 pb-4 max-h-[70vh] overflow-y-auto">
        {/* Final calculation — always visible at top */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-1">
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

        {/* What they paid — collapsed by default */}
        <div>
          <button
            onClick={() => setShowPaidDetail((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1"
          >
            <span>What {displayName} paid ({audit.paid.length})</span>
            {showPaidDetail ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {!showPaidDetail && audit.paid.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {audit.paid.length} expense{audit.paid.length !== 1 ? "s" : ""} · {formatCurrency(audit.totalPaid, settlementCurrency)} total
            </p>
          )}
          {showPaidDetail && (
            <div className="space-y-1 mt-1">
              {audit.paid.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No expenses paid</p>
              ) : (
                audit.paid.map(renderLine)
              )}
            </div>
          )}
        </div>

        {/* What they owe — collapsed by default */}
        <div>
          <button
            onClick={() => setShowOwedDetail((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1"
          >
            <span>{displayName}'s share ({audit.owed.length})</span>
            {showOwedDetail ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {!showOwedDetail && audit.owed.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {audit.owed.length} share{audit.owed.length !== 1 ? "s" : ""} · {formatCurrency(audit.totalOwed, settlementCurrency)} total
            </p>
          )}
          {showOwedDetail && (
            <div className="space-y-1 mt-1">
              {audit.owed.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No expense shares</p>
              ) : (
                audit.owed.map(renderOwedLine)
              )}
            </div>
          )}
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

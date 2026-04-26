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
  ratesFetchedAtMs: number | null;
}

interface AuditLine {
  title: string;
  date: string;
  payer?: string;
  isSelfPaid: boolean;
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number | null;
}

export function BalanceAuditSheet({
  open, onOpenChange, userId, displayName, expenses, splits,
  members, settlementCurrency, rates, ratesFetchedAtMs,
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
    const foreignCurrencies = new Set<string>();
    let totalPaid = 0;
    let totalOwed = 0;

    for (const exp of expenses) {
      const dateStr = format(new Date(exp.incurred_on), "MMM d");

      if (exp.payer_id === userId) {
        const converted = convertAmount(exp.amount, exp.currency, settlementCurrency, settlementCurrency, rates);
        if (converted != null) totalPaid += converted;
        if (exp.currency !== settlementCurrency) foreignCurrencies.add(exp.currency);
        paid.push({
          title: exp.title,
          date: dateStr,
          isSelfPaid: true,
          originalAmount: exp.amount,
          originalCurrency: exp.currency,
          convertedAmount: converted,
        });
      }

      const mySplits = splits.filter((s) => s.expense_id === exp.id && s.user_id === userId);
      for (const s of mySplits) {
        const converted = convertAmount(s.share_amount, exp.currency, settlementCurrency, settlementCurrency, rates);
        if (converted != null) totalOwed += converted;
        if (exp.currency !== settlementCurrency) foreignCurrencies.add(exp.currency);
        owed.push({
          title: exp.title,
          date: dateStr,
          payer: profileMap[exp.payer_id] || "Unknown",
          isSelfPaid: exp.payer_id === userId,
          originalAmount: s.share_amount,
          originalCurrency: exp.currency,
          convertedAmount: converted,
        });
      }
    }

    const netBalance = totalPaid - totalOwed;
    return { paid, owed, totalPaid, totalOwed, netBalance, foreignCurrencies: [...foreignCurrencies] };
  }, [expenses, splits, userId, settlementCurrency, rates, profileMap]);

  const ratesDateStr = ratesFetchedAtMs ? format(ratesFetchedAtMs, "d MMM yyyy") : null;

  const renderRow = (line: AuditLine, i: number, section: "paid" | "owed") => {
    const isForeign = line.originalCurrency !== settlementCurrency;
    const showPayer = section === "owed" && !line.isSelfPaid;
    const subLeft = [line.date, showPayer ? `paid by ${line.payer}` : null].filter(Boolean).join(" · ");

    return (
      <div key={i} className={`py-2 ${i > 0 ? "border-t border-border" : ""}`}>
        <div className="flex items-start justify-between gap-2 text-xs">
          <span className="font-medium line-clamp-2 leading-snug">{line.title}</span>
          <span className="font-medium shrink-0">
            {formatCurrency(line.convertedAmount ?? line.originalAmount, settlementCurrency)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[11px] text-muted-foreground">{subLeft}</span>
          {isForeign && (
            <span className="text-[11px] text-muted-foreground">
              {formatCurrency(line.originalAmount, line.originalCurrency)}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`How ${displayName}'s balance was calculated`}
    >
      <div className="divide-y divide-border/30 pb-4 max-h-[70vh] overflow-y-auto [&>*]:pt-3 [&>*:first-child]:pt-0">
        {/* Summary card */}
        <div className="rounded-lg bg-muted/60 p-3">
          <div className="flex justify-between text-sm py-1.5">
            <span>{displayName} paid</span>
            <span className="font-medium">{formatCurrency(audit.totalPaid, settlementCurrency)}</span>
          </div>
          <div className="flex justify-between text-sm py-1.5 border-t border-border">
            <span>Total share</span>
            <span className="font-medium">−{formatCurrency(audit.totalOwed, settlementCurrency)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold py-1.5 border-t border-border">
            <span>Net balance</span>
            <span className={audit.netBalance > 0.005 ? "text-emerald-600" : audit.netBalance < -0.005 ? "text-red-500" : ""}>
              {formatCurrency(Math.abs(audit.netBalance), settlementCurrency)}
              {audit.netBalance > 0.005 ? " owed" : audit.netBalance < -0.005 ? " owes" : " settled"}
            </span>
          </div>
        </div>

        {/* What they paid */}
        <div>
          <button
            onClick={() => setShowPaidDetail((v) => !v)}
            className="flex w-full items-center justify-between py-0.5"
          >
            <span className="text-[13px] font-semibold text-foreground">
              What {displayName} paid ({audit.paid.length})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {formatCurrency(audit.totalPaid, settlementCurrency)}
              </span>
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showPaidDetail ? "rotate-90" : ""}`} />
            </span>
          </button>
          {showPaidDetail && (
            <div className="mt-2">
              {audit.paid.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No expenses paid</p>
              ) : (
                audit.paid.map((line, i) => renderRow(line, i, "paid"))
              )}
            </div>
          )}
        </div>

        {/* Their share */}
        <div>
          <button
            onClick={() => setShowOwedDetail((v) => !v)}
            className="flex w-full items-center justify-between py-0.5"
          >
            <span className="text-[13px] font-semibold text-foreground">
              {displayName}'s share ({audit.owed.length})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {formatCurrency(audit.totalOwed, settlementCurrency)}
              </span>
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showOwedDetail ? "rotate-90" : ""}`} />
            </span>
          </button>
          {showOwedDetail && (
            <div className="mt-2">
              {audit.owed.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No expense shares</p>
              ) : (
                audit.owed.map((line, i) => renderRow(line, i, "owed"))
              )}
            </div>
          )}
        </div>

        {/* Conversion footnote */}
        {audit.foreignCurrencies.length > 0 && (
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            {audit.foreignCurrencies.map((cur) => (
              <p key={cur}>
                {cur} converted {ratesDateStr ? `using rate from ${ratesDateStr}` : "at time of recording"}
              </p>
            ))}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

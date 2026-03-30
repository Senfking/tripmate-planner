import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { BalanceEntry, formatCurrency, Rates } from "@/lib/settlementCalc";
import { ExpenseRow, SplitRow, MemberProfile } from "@/hooks/useExpenses";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BalanceAuditSheet } from "./BalanceAuditSheet";

interface Props {
  balances: BalanceEntry[];
  currency: string;
  expenses: ExpenseRow[];
  splits: SplitRow[];
  members: MemberProfile[];
  rates: Rates;
  ratesFetchedAt: Date | null;
}

export function BalancesSummary({ balances, currency, expenses, splits, members, rates, ratesFetchedAt }: Props) {
  const { user } = useAuth();
  const [auditUserId, setAuditUserId] = useState<string | null>(null);

  if (balances.length === 0) {
    return null;
  }

  const sorted = [...balances].sort((a, b) => {
    if (a.userId === user?.id) return -1;
    if (b.userId === user?.id) return 1;
    return b.balance - a.balance;
  });

  const auditEntry = auditUserId ? balances.find((b) => b.userId === auditUserId) : null;

  return (
    <>
      <div className="space-y-1.5">
        {sorted.map((b) => {
          const isMe = b.userId === user?.id;
          return (
            <div key={b.userId} className="space-y-0.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="truncate max-w-[140px]">{b.displayName}</span>
                  {isMe && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">You</Badge>
                  )}
                </span>
                {b.balance > 0.005 ? (
                  <span className="text-emerald-600 font-medium">
                    is owed {formatCurrency(b.balance, currency)}
                  </span>
                ) : b.balance < -0.005 ? (
                  <span className="text-red-500 font-medium">
                    owes {formatCurrency(Math.abs(b.balance), currency)}
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> settled
                  </span>
                )}
              </div>
              <button
                onClick={() => setAuditUserId(b.userId)}
                className="text-[11px] text-primary/70 hover:text-primary transition-colors pl-0"
              >
                See breakdown →
              </button>
            </div>
          );
        })}
      </div>

      {auditEntry && (
        <BalanceAuditSheet
          open={!!auditUserId}
          onOpenChange={(open) => { if (!open) setAuditUserId(null); }}
          userId={auditEntry.userId}
          displayName={auditEntry.displayName}
          expenses={expenses}
          splits={splits}
          members={members}
          settlementCurrency={currency}
          rates={rates}
          ratesFetchedAt={ratesFetchedAt}
        />
      )}
    </>
  );
}

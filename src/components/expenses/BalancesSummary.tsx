import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { BalanceEntry, formatCurrency, Rates } from "@/lib/settlementCalc";
import { ExpenseRow, SplitRow, MemberProfile } from "@/hooks/useExpenses";
import { CheckCircle2 } from "lucide-react";
import { BalanceAuditSheet } from "./BalanceAuditSheet";

interface Props {
  balances: BalanceEntry[];
  currency: string;
  expenses: ExpenseRow[];
  splits: SplitRow[];
  members: MemberProfile[];
  rates: Rates;
  ratesFetchedAtMs: number | null;
}

export function BalancesSummary({ balances, currency, expenses, splits, members, rates, ratesFetchedAtMs }: Props) {
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
      <div className="divide-y divide-border/40">
        {sorted.map((b) => {
          const isMe = b.userId === user?.id;
          return (
            <div key={b.userId} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-foreground truncate max-w-[160px]">
                  {b.displayName}{isMe ? " (you)" : ""}
                </span>
                {b.balance > 0.005 ? (
                  <span className="text-[15px] font-semibold tabular-nums" style={{ color: "#0D9488" }}>
                    +{formatCurrency(b.balance, currency)}
                  </span>
                ) : b.balance < -0.005 ? (
                  <span className="text-[15px] font-semibold tabular-nums" style={{ color: "#EF4444" }}>
                    −{formatCurrency(Math.abs(b.balance), currency)}
                  </span>
                ) : (
                  <span className="text-[14px] text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> settled
                  </span>
                )}
              </div>
              <button
                onClick={() => setAuditUserId(b.userId)}
                className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                View breakdown →
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
          ratesFetchedAtMs={ratesFetchedAtMs}
        />
      )}
    </>
  );
}

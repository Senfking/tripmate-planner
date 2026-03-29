import { useAuth } from "@/contexts/AuthContext";
import { BalanceEntry, formatCurrency } from "@/lib/settlementCalc";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  balances: BalanceEntry[];
  currency: string;
}

export function BalancesSummary({ balances, currency }: Props) {
  const { user } = useAuth();

  if (balances.length === 0) {
    return null;
  }

  const sorted = [...balances].sort((a, b) => {
    if (a.userId === user?.id) return -1;
    if (b.userId === user?.id) return 1;
    return b.balance - a.balance;
  });

  return (
    <div className="space-y-3">
      {/* Net balances */}
      <div className="rounded-xl border bg-card p-3 space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Balances</h3>
        <div className="space-y-1.5">
          {sorted.map((b) => {
            const isMe = b.userId === user?.id;
            return (
              <div key={b.userId} className="flex items-center justify-between text-sm">
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
            );
          })}
        </div>
      </div>

      {/* Settle up */}
      {settlements.length > 0 && (
        <div className="rounded-xl border bg-card p-3 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Settle Up</h3>
          <div className="space-y-1.5">
            {settlements.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="truncate max-w-[100px]">{s.fromName}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[100px]">{s.toName}</span>
                <span className="ml-auto font-medium text-foreground">
                  {formatCurrency(s.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

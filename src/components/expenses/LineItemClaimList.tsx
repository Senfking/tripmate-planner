import { useMemo } from "react";
import { MemberProfile } from "@/hooks/useExpenses";
import { LineItemRow, ClaimRow } from "@/hooks/useLineItemClaims";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/settlementCalc";
import { Hand } from "lucide-react";

interface Props {
  lineItems: LineItemRow[];
  claims: ClaimRow[];
  members: MemberProfile[];
  currency: string;
  totalAmount: number;
  onToggleClaim: (lineItemId: string) => void;
  isToggling: boolean;
}

export function LineItemClaimList({
  lineItems, claims, members, currency, totalAmount, onToggleClaim, isToggling,
}: Props) {
  const { user } = useAuth();

  const perPersonTotals = useMemo(() => {
    const memberIds = members.map((m) => m.userId);
    const totals: Record<string, number> = {};
    for (const uid of memberIds) totals[uid] = 0;

    let claimedTotal = 0;

    for (const item of lineItems) {
      const itemClaims = claims.filter((c) => c.line_item_id === item.id);
      if (itemClaims.length > 0) {
        const perPerson = item.total_price / itemClaims.length;
        for (const claim of itemClaims) {
          if (totals[claim.user_id] !== undefined) {
            totals[claim.user_id] += perPerson;
          }
        }
        claimedTotal += item.total_price;
      }
    }

    // Unclaimed items split equally
    const remainder = totalAmount - claimedTotal;
    if (remainder > 0.005 && memberIds.length > 0) {
      const perPerson = remainder / memberIds.length;
      for (const uid of memberIds) {
        totals[uid] += perPerson;
      }
    }

    return totals;
  }, [lineItems, claims, members, totalAmount]);

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
        Claim your items
      </p>

      <div className="space-y-2">
        {lineItems.map((item) => {
          const itemClaims = claims.filter((c) => c.line_item_id === item.id);
          const isClaimed = itemClaims.some((c) => c.user_id === user?.id);

          return (
            <div
              key={item.id}
              className="rounded-lg border border-border/60 p-2.5 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{item.name}</p>
                  {item.quantity > 1 && (
                    <p className="text-[11px] text-muted-foreground">
                      {item.quantity}× {item.unit_price?.toFixed(2)}
                    </p>
                  )}
                </div>
                <span className="text-[13px] font-semibold tabular-nums shrink-0">
                  {formatCurrency(item.total_price, currency)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isToggling}
                  onClick={() => onToggleClaim(item.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                    isClaimed
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-muted text-muted-foreground border border-border hover:border-primary/30 hover:text-primary"
                  )}
                >
                  <Hand className="h-3 w-3" />
                  {isClaimed ? "Mine ✓" : "Mine"}
                </button>

                {itemClaims.length > 0 && (
                  <div className="flex -space-x-1.5">
                    {itemClaims.map((claim) => {
                      const member = members.find((m) => m.userId === claim.user_id);
                      const initials = (member?.displayName || "?")
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase();
                      return (
                        <Avatar key={claim.id} className="h-5 w-5 border border-background">
                          <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      );
                    })}
                    {itemClaims.length > 1 && (
                      <span className="text-[10px] text-muted-foreground ml-2">
                        {formatCurrency(item.total_price / itemClaims.length, currency)} each
                      </span>
                    )}
                  </div>
                )}

                {itemClaims.length === 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    Split equally if unclaimed
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-person summary */}
      <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-1.5">
          Per person total
        </p>
        {members.map((m) => {
          const total = perPersonTotals[m.userId] || 0;
          if (total < 0.005) return null;
          return (
            <div key={m.userId} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {m.displayName}{m.userId === user?.id ? " (You)" : ""}
              </span>
              <span className="font-medium tabular-nums">
                {formatCurrency(total, currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

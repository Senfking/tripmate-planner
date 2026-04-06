import { useMemo } from "react";
import { MemberProfile } from "@/hooks/useExpenses";
import { LineItemRow, ClaimRow } from "@/hooks/useLineItemClaims";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { calculateLineItemTotals } from "@/lib/expenseLineItems";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/settlementCalc";
import { Hand, Link2 } from "lucide-react";

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

  const claimableItems = useMemo(() => lineItems.filter((li) => !li.is_shared), [lineItems]);
  const sharedItems = useMemo(() => lineItems.filter((li) => li.is_shared), [lineItems]);
  const claimsByItemId = useMemo(() => {
    const map = new Map<string, ClaimRow[]>();
    for (const claim of claims) {
      map.set(claim.line_item_id, [...(map.get(claim.line_item_id) ?? []), claim]);
    }
    return map;
  }, [claims]);

  const { totals: perPersonTotals, sharedTotal } = useMemo(
    () => calculateLineItemTotals({
      lineItems,
      memberIds: members.map((member) => member.userId),
      totalAmount,
      getAssigneeIds: (item) => (claimsByItemId.get(item.id) ?? []).map((claim) => claim.user_id),
    }),
    [claimsByItemId, lineItems, members, totalAmount],
  );

  return (
    <div className="space-y-3">
      {/* Claimable items */}
      {claimableItems.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
            Claim your items
          </p>
          <div className="space-y-2">
            {claimableItems.map((item) => {
              const itemClaims = claimsByItemId.get(item.id) ?? [];
              const isClaimed = itemClaims.some((c) => c.user_id === user?.id);

              return (
                <div key={item.id} className="rounded-lg border border-border/60 p-2.5 space-y-2">
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
        </>
      )}

      {/* Shared costs */}
      {Math.abs(sharedTotal) > 0.005 && (
        <>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mt-2">
            Shared costs — split automatically
          </p>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-[13px] font-medium truncate">Taxes, service, and receipt adjustments</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Auto</Badge>
                <span className="text-[13px] font-semibold tabular-nums">
                  {formatCurrency(sharedTotal, currency)}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Split pro rata based on each person&apos;s ordered items.
            </p>
            {sharedItems.length > 0 && (
              <p className="text-[10px] text-muted-foreground truncate">
                Includes: {sharedItems.map((item) => item.name).join(", ")}
              </p>
            )}
          </div>
        </>
      )}

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

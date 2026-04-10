import { useMemo } from "react";
import { MemberProfile } from "@/hooks/useExpenses";
import { LineItemRow, ClaimRow } from "@/hooks/useLineItemClaims";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { calculateLineItemTotals } from "@/lib/expenseLineItems";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/settlementCalc";
import { Hand, Link2, ChevronDown } from "lucide-react";
import { useState } from "react";

interface Props {
  lineItems: LineItemRow[];
  claims: ClaimRow[];
  members: MemberProfile[];
  currency: string;
  totalAmount: number;
  onToggleClaim: (lineItemId: string) => void;
  isToggling: boolean;
  storedSplits?: { user_id: string; share_amount: number }[];
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function LineItemClaimList({
  lineItems, claims, members, currency, totalAmount, onToggleClaim, isToggling,
}: Props) {
  const { user } = useAuth();
  const [showAll, setShowAll] = useState(false);

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

  const COLLAPSED_COUNT = 4;
  const visibleItems = showAll ? claimableItems : claimableItems.slice(0, COLLAPSED_COUNT);
  const hiddenCount = claimableItems.length - COLLAPSED_COUNT;

  return (
    <div className="space-y-3">
      {/* Claimable items */}
      {claimableItems.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
            Claim your items
          </p>
          <div className="space-y-1.5">
            {visibleItems.map((item) => {
              const itemClaims = claimsByItemId.get(item.id) ?? [];
              const isClaimed = itemClaims.some((c) => c.user_id === user?.id);

              return (
                <div key={item.id} className="flex items-center gap-2.5 rounded-lg border border-border/60 px-2.5 py-2">
                  {/* Mine button */}
                  <button
                    type="button"
                    disabled={isToggling}
                    onClick={() => onToggleClaim(item.id)}
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all border",
                      isClaimed
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-muted text-muted-foreground border-border hover:border-primary/30 hover:text-primary"
                    )}
                  >
                    {isClaimed ? "✓ Mine" : "Mine"}
                  </button>

                  {/* Item info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{item.name}</p>
                  </div>

                  {/* Price */}
                  <span className="text-[12px] font-semibold tabular-nums shrink-0">
                    {formatCurrency(item.total_price, currency)}
                  </span>

                  {/* Claimed avatars */}
                  {itemClaims.length > 0 && (
                    <div className="flex -space-x-1.5 shrink-0">
                      {itemClaims.map((claim) => {
                        const member = members.find((m) => m.userId === claim.user_id);
                        return (
                          <Avatar key={claim.id} className="h-5 w-5 border-2 border-background">
                            {member?.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.displayName} />}
                            <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                              {getInitials(member?.displayName || "?")}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Show more/less toggle */}
          {claimableItems.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline w-full justify-center py-1"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", showAll && "rotate-180")} />
              {showAll ? "Show less" : `Show ${hiddenCount} more items`}
            </button>
          )}
        </>
      )}

      {/* Shared costs */}
      {Math.abs(sharedTotal) > 0.005 && (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-[12px] font-medium truncate">Taxes & service (auto-split)</p>
            </div>
            <span className="text-[12px] font-semibold tabular-nums shrink-0">
              {formatCurrency(sharedTotal, currency)}
            </span>
          </div>
        </div>
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
            <div key={m.userId} className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Avatar className="h-4 w-4">
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName} />}
                  <AvatarFallback className="text-[7px] bg-primary/10 text-primary">
                    {getInitials(m.displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground truncate">
                  {m.displayName}{m.userId === user?.id ? " (You)" : ""}
                </span>
              </div>
              <span className="font-medium tabular-nums shrink-0">
                {formatCurrency(total, currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

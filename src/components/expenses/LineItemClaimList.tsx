import { useMemo } from "react";
import { MemberProfile } from "@/hooks/useExpenses";
import { LineItemRow, ClaimRow, getTotalClaimedQuantity, getRemainingQuantity } from "@/hooks/useLineItemClaims";

/** Safe accessor — old rows from before the migration lack the column */
function claimQty(c: ClaimRow): number {
  return typeof c.claimed_quantity === "number" ? c.claimed_quantity : 1;
}
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { calculateLineItemTotals } from "@/lib/expenseLineItems";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/settlementCalc";
import { Link2, ChevronDown, Minus, Plus } from "lucide-react";
import { useState } from "react";

interface Props {
  lineItems: LineItemRow[];
  claims: ClaimRow[];
  members: MemberProfile[];
  currency: string;
  totalAmount: number;
  onToggleClaim: (lineItemId: string) => void;
  onSetClaimQuantity: (lineItemId: string, quantity: number) => void;
  isToggling: boolean;
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function LineItemClaimList({
  lineItems, claims, members, currency, totalAmount, onToggleClaim, onSetClaimQuantity, isToggling,
}: Props) {
  const { user } = useAuth();
  const [showAll, setShowAll] = useState(false);

  const claimableItems = useMemo(() => lineItems.filter((li) => !li.is_shared), [lineItems]);
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
      getClaimQuantity: (item, userId) => {
        const claim = (claimsByItemId.get(item.id) ?? []).find((c) => c.user_id === userId);
        return claim ? claimQty(claim) : 0;
      },
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
              const isMultiQty = item.quantity > 1;

              if (isMultiQty) {
                return (
                  <MultiQuantityItem
                    key={item.id}
                    item={item}
                    itemClaims={itemClaims}
                    members={members}
                    currency={currency}
                    currentUserId={user?.id}
                    isToggling={isToggling}
                    onSetQuantity={(qty) => onSetClaimQuantity(item.id, qty)}
                  />
                );
              }

              // Single-quantity item: keep "Mine" toggle
              const isClaimed = itemClaims.some((c) => c.user_id === user?.id);
              return (
                <div key={item.id} className="flex items-center gap-2.5 rounded-lg border border-border/60 px-2.5 py-2">
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
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{item.name}</p>
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums shrink-0">
                    {formatCurrency(item.total_price, currency)}
                  </span>
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

/** Multi-quantity item with stepper and claim summary */
function MultiQuantityItem({
  item,
  itemClaims,
  members,
  currency,
  currentUserId,
  isToggling,
  onSetQuantity,
}: {
  item: LineItemRow;
  itemClaims: ClaimRow[];
  members: MemberProfile[];
  currency: string;
  currentUserId: string | undefined;
  isToggling: boolean;
  onSetQuantity: (qty: number) => void;
}) {
  const myClaim = itemClaims.find((c) => c.user_id === currentUserId);
  const myQty = myClaim ? claimQty(myClaim) : 0;
  const totalClaimed = getTotalClaimedQuantity(itemClaims, item.id);
  const remaining = getRemainingQuantity(item.quantity, itemClaims, item.id);
  // Max this user can claim = their current qty + whatever is unclaimed
  const maxClaimable = myQty + remaining;

  const unitPrice = (item.unit_price > 0)
    ? item.unit_price
    : item.total_price / Math.max(item.quantity, 1);

  return (
    <div className="rounded-lg border border-border/60 px-2.5 py-2 space-y-1.5">
      {/* Top row: item name + total price */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium truncate">
            {item.quantity}× {item.name}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {formatCurrency(unitPrice, currency)} each
          </p>
        </div>
        <span className="text-[12px] font-semibold tabular-nums shrink-0">
          {formatCurrency(item.total_price, currency)}
        </span>
      </div>

      {/* Quantity stepper row */}
      <div className="flex items-center gap-2">
        <div className="flex items-center border border-border rounded-lg overflow-hidden shrink-0">
          <button
            type="button"
            disabled={isToggling || myQty <= 0}
            onClick={() => onSetQuantity(myQty - 1)}
            className={cn(
              "h-8 w-8 flex items-center justify-center transition-colors",
              myQty <= 0
                ? "text-muted-foreground/30 cursor-not-allowed"
                : "text-foreground hover:bg-muted active:bg-muted/80"
            )}
            aria-label="Decrease quantity"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="h-8 w-8 flex items-center justify-center text-[13px] font-semibold tabular-nums border-x border-border bg-background">
            {myQty}
          </span>
          <button
            type="button"
            disabled={isToggling || myQty >= maxClaimable}
            onClick={() => onSetQuantity(myQty + 1)}
            className={cn(
              "h-8 w-8 flex items-center justify-center transition-colors",
              myQty >= maxClaimable
                ? "text-muted-foreground/30 cursor-not-allowed"
                : "text-foreground hover:bg-muted active:bg-muted/80"
            )}
            aria-label="Increase quantity"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {myQty > 0 && (
          <span className="text-[11px] text-muted-foreground">
            = {formatCurrency(unitPrice * myQty, currency)}
          </span>
        )}

        <span className={cn(
          "text-[10px] ml-auto tabular-nums",
          remaining === 0 ? "text-muted-foreground" : "text-primary"
        )}>
          {remaining === 0
            ? `All ${item.quantity} claimed`
            : `${remaining} of ${item.quantity} unclaimed`}
        </span>
      </div>

      {/* Claim summary: who claimed how many */}
      {itemClaims.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {itemClaims.map((claim) => {
            const member = members.find((m) => m.userId === claim.user_id);
            const isMe = claim.user_id === currentUserId;
            return (
              <div key={claim.id} className="flex items-center gap-1">
                <Avatar className="h-4 w-4 border border-background">
                  {member?.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.displayName} />}
                  <AvatarFallback className="text-[7px] bg-primary/10 text-primary">
                    {getInitials(member?.displayName || "?")}
                  </AvatarFallback>
                </Avatar>
                <span className={cn("text-[10px]", isMe ? "text-primary font-medium" : "text-muted-foreground")}>
                  {member?.displayName?.split(" ")[0] || "?"}: {claimQty(claim)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

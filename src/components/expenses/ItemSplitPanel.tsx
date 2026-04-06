import { useMemo } from "react";
import { MemberProfile } from "@/hooks/useExpenses";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link2 } from "lucide-react";

export interface LineItem {
  name: string;
  quantity: number;
  unit_price: number | null;
  total_price: number;
  is_shared?: boolean;
}

interface Props {
  lineItems: LineItem[];
  members: MemberProfile[];
  /** Map of item index → set of assigned user IDs */
  assignments: Record<number, Set<string>>;
  onToggle: (itemIndex: number, userId: string) => void;
  onToggleShared?: (itemIndex: number) => void;
  currency: string;
}

export function ItemSplitPanel({ lineItems, members, assignments, onToggle, onToggleShared, currency }: Props) {
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {lineItems.map((item, idx) => {
        const assigned = assignments[idx] ?? new Set<string>();
        const isShared = item.is_shared ?? false;
        return (
          <div key={idx} className="rounded-lg border border-border/60 p-2.5 space-y-2">
            {/* Item info */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                {onToggleShared && (
                  <button
                    type="button"
                    onClick={() => onToggleShared(idx)}
                    className={cn(
                      "shrink-0 rounded p-0.5 transition-colors",
                      isShared
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground/40 hover:text-muted-foreground"
                    )}
                    title={isShared ? "Shared cost (split proportionally)" : "Mark as shared cost"}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  {item.quantity > 1 && (
                    <p className="text-[11px] text-muted-foreground">
                      {item.quantity}× {item.unit_price != null ? `${item.unit_price.toFixed(2)}` : ""}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isShared && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                    Shared
                  </Badge>
                )}
                <span className="text-sm font-semibold tabular-nums">
                  {item.total_price.toFixed(2)} {currency}
                </span>
              </div>
            </div>

            {/* Member avatars — hidden for shared items */}
            {!isShared && (
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const isAssigned = assigned.has(m.userId);
                  const initials = (m.displayName || "?")
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => onToggle(idx, m.userId)}
                      className="focus:outline-none"
                      title={m.displayName}
                    >
                      <Avatar
                        className={cn(
                          "h-7 w-7 transition-all border-2",
                          isAssigned
                            ? "border-primary ring-1 ring-primary/30 opacity-100"
                            : "border-transparent opacity-40 hover:opacity-70"
                        )}
                      >
                        <AvatarFallback
                          className={cn(
                            "text-[10px] font-medium",
                            isAssigned ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  );
                })}
              </div>
            )}

            {isShared && (
              <p className="text-[10px] text-muted-foreground">Split proportionally based on item totals</p>
            )}

            {/* Per-person cost for this item */}
            {!isShared && assigned.size > 0 && assigned.size < members.length && (
              <p className="text-[10px] text-muted-foreground">
                {(item.total_price / assigned.size).toFixed(2)} {currency} each
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compute per-member totals from item assignments with proportional shared costs.
 * Unassigned claimable items split equally among ALL members.
 * Shared items distributed proportionally by each person's claimable subtotal.
 */
export function computeItemSplits(
  lineItems: LineItem[],
  assignments: Record<number, Set<string>>,
  memberIds: string[],
  totalAmount: number,
): { user_id: string; share_amount: number }[] {
  const totals: Record<string, number> = {};
  for (const uid of memberIds) totals[uid] = 0;

  let claimableTotal = 0;
  let sharedTotal = 0;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];

    if (item.is_shared) {
      sharedTotal += item.total_price;
      continue;
    }

    const assigned = assignments[i];
    const hasAssignees = assigned && assigned.size > 0;

    if (hasAssignees) {
      const perPerson = item.total_price / assigned.size;
      for (const uid of assigned) {
        if (totals[uid] !== undefined) totals[uid] += perPerson;
      }
      claimableTotal += item.total_price;
    }
  }

  // Unassigned claimable items split equally
  const unassignedClaimable = totalAmount - sharedTotal - claimableTotal;
  if (unassignedClaimable > 0.005 && memberIds.length > 0) {
    const perPerson = unassignedClaimable / memberIds.length;
    for (const uid of memberIds) {
      totals[uid] += perPerson;
    }
  }

  // Distribute shared costs proportionally
  if (sharedTotal > 0.005 && memberIds.length > 0) {
    const itemSubtotalSum = memberIds.reduce((s, uid) => s + totals[uid], 0);
    if (itemSubtotalSum > 0.005) {
      for (const uid of memberIds) {
        totals[uid] += sharedTotal * (totals[uid] / itemSubtotalSum);
      }
    } else {
      // All items shared → split equally
      const perPerson = sharedTotal / memberIds.length;
      for (const uid of memberIds) {
        totals[uid] += perPerson;
      }
    }
  }

  // Round to 2 decimals, fix rounding to match total
  const splits = memberIds.map((uid) => ({
    user_id: uid,
    share_amount: Math.round(totals[uid] * 100) / 100,
  }));

  const splitSum = splits.reduce((s, x) => s + x.share_amount, 0);
  const diff = Math.round((totalAmount - splitSum) * 100) / 100;
  if (Math.abs(diff) >= 0.01 && splits.length > 0) {
    splits[0].share_amount = Math.round((splits[0].share_amount + diff) * 100) / 100;
  }

  return splits.filter((s) => s.share_amount > 0);
}

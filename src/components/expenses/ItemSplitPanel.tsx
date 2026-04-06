import { useMemo } from "react";
import { MemberProfile } from "@/hooks/useExpenses";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface LineItem {
  name: string;
  quantity: number;
  unit_price: number | null;
  total_price: number;
}

interface Props {
  lineItems: LineItem[];
  members: MemberProfile[];
  /** Map of item index → set of assigned user IDs */
  assignments: Record<number, Set<string>>;
  onToggle: (itemIndex: number, userId: string) => void;
  currency: string;
}

export function ItemSplitPanel({ lineItems, members, assignments, onToggle, currency }: Props) {
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {lineItems.map((item, idx) => {
        const assigned = assignments[idx] ?? new Set<string>();
        return (
          <div key={idx} className="rounded-lg border border-border/60 p-2.5 space-y-2">
            {/* Item info */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                {item.quantity > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    {item.quantity}× {item.unit_price != null ? `${item.unit_price.toFixed(2)}` : ""}
                  </p>
                )}
              </div>
              <span className="text-sm font-semibold tabular-nums shrink-0">
                {item.total_price.toFixed(2)} {currency}
              </span>
            </div>

            {/* Member avatars */}
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

            {/* Per-person cost for this item */}
            {assigned.size > 0 && assigned.size < members.length && (
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
 * Compute per-member totals from item assignments.
 * Unassigned items split equally among ALL members.
 */
export function computeItemSplits(
  lineItems: LineItem[],
  assignments: Record<number, Set<string>>,
  memberIds: string[],
  totalAmount: number,
): { user_id: string; share_amount: number }[] {
  const totals: Record<string, number> = {};
  for (const uid of memberIds) totals[uid] = 0;

  let assignedTotal = 0;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const assigned = assignments[i];
    const hasAssignees = assigned && assigned.size > 0;

    if (hasAssignees) {
      const perPerson = item.total_price / assigned.size;
      for (const uid of assigned) {
        if (totals[uid] !== undefined) totals[uid] += perPerson;
      }
      assignedTotal += item.total_price;
    }
  }

  // Remainder (unassigned items + rounding diff) split equally
  const remainder = totalAmount - assignedTotal;
  if (remainder > 0.005 && memberIds.length > 0) {
    const perPerson = remainder / memberIds.length;
    for (const uid of memberIds) {
      totals[uid] += perPerson;
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

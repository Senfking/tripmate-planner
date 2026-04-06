import { useMemo } from "react";
import { MemberProfile } from "@/hooks/useExpenses";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { calculateLineItemTotals, sumLineItemTotals } from "@/lib/expenseLineItems";
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
  const claimableItems = useMemo(
    () => lineItems.map((item, index) => ({ item, index })).filter(({ item }) => !item.is_shared),
    [lineItems],
  );
  const sharedItems = useMemo(
    () => lineItems.map((item, index) => ({ item, index })).filter(({ item }) => item.is_shared),
    [lineItems],
  );
  const sharedTotal = useMemo(
    () => sumLineItemTotals(sharedItems.map(({ item }) => item)),
    [sharedItems],
  );

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {claimableItems.map(({ item, index }) => {
        const assigned = assignments[index] ?? new Set<string>();
        return (
          <div key={`${index}-${item.name}`} className="rounded-lg border border-border/60 p-2.5 space-y-2">
            {/* Item info */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                {onToggleShared && (
                  <button
                    type="button"
                    onClick={() => onToggleShared(index)}
                    className={cn(
                      "shrink-0 rounded p-0.5 transition-colors",
                      "text-muted-foreground/40 hover:text-muted-foreground"
                    )}
                    title="Mark as shared cost"
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
                <span className="text-sm font-semibold tabular-nums">
                  {item.total_price.toFixed(2)} {currency}
                </span>
              </div>
            </div>

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
                    onClick={() => onToggle(index, m.userId)}
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

      {sharedItems.length > 0 && (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                Auto
              </Badge>
              <p className="text-xs font-medium truncate">Taxes & service split pro rata</p>
            </div>
            <span className="text-sm font-semibold tabular-nums shrink-0">
              {sharedTotal.toFixed(2)} {currency}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Based on each person&apos;s ordered item total.
          </p>
          {onToggleShared && (
            <div className="flex flex-wrap gap-1.5">
              {sharedItems.map(({ item, index }) => (
                <button
                  key={`${index}-${item.name}-shared`}
                  type="button"
                  onClick={() => onToggleShared(index)}
                  className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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
  const { totals } = calculateLineItemTotals({
    lineItems,
    memberIds,
    totalAmount,
    getAssigneeIds: (_item, index) => assignments[index] ?? [],
  });

  return memberIds
    .map((userId) => ({ user_id: userId, share_amount: totals[userId] || 0 }))
    .filter((split) => split.share_amount > 0);
}

import { useMemo, useState } from "react";
import { MemberProfile } from "@/hooks/useExpenses";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { calculateLineItemTotals, sumLineItemTotals } from "@/lib/expenseLineItems";
import { cn } from "@/lib/utils";
import { Link2, ChevronDown } from "lucide-react";

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

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function ItemSplitPanel({ lineItems, members, assignments, onToggle, onToggleShared, currency }: Props) {
  const [showAll, setShowAll] = useState(false);

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

  const COLLAPSED_COUNT = 5;
  const visibleItems = showAll ? claimableItems : claimableItems.slice(0, COLLAPSED_COUNT);
  const hiddenCount = claimableItems.length - COLLAPSED_COUNT;

  return (
    <div className="space-y-1.5 max-h-72 overflow-y-auto">
      {visibleItems.map(({ item, index }) => {
        const assigned = assignments[index] ?? new Set<string>();
        return (
          <div key={`${index}-${item.name}`} className="rounded-lg border border-border/60 px-2.5 py-2 space-y-1.5">
            {/* Item row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                {onToggleShared && (
                  <button
                    type="button"
                    onClick={() => onToggleShared(index)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    title="Mark as shared cost"
                  >
                    <Link2 className="h-3 w-3" />
                  </button>
                )}
                <p className="text-[13px] font-medium truncate">{item.name}</p>
                {item.quantity > 1 && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    ×{item.quantity}
                  </span>
                )}
              </div>
              <span className="text-[12px] font-semibold tabular-nums shrink-0">
                {item.total_price.toFixed(2)} {currency}
              </span>
            </div>

            {/* Avatar row */}
            <div className="flex items-center gap-1">
              {members.map((m) => {
                const isAssigned = assigned.has(m.userId);
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
                        "h-6 w-6 transition-all border-2",
                        isAssigned
                          ? "border-primary ring-1 ring-primary/30 opacity-100"
                          : "border-transparent opacity-30 hover:opacity-60"
                      )}
                    >
                      {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName} />}
                      <AvatarFallback
                        className={cn(
                          "text-[9px] font-medium",
                          isAssigned ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {getInitials(m.displayName)}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                );
              })}
              {assigned.size > 0 && assigned.size < members.length && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  {(item.total_price / assigned.size).toFixed(2)} each
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Show more/less */}
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

      {sharedItems.length > 0 && (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-2.5 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Auto</Badge>
              <p className="text-[11px] font-medium truncate">Taxes & service (pro rata)</p>
            </div>
            <span className="text-[12px] font-semibold tabular-nums shrink-0">
              {sharedTotal.toFixed(2)} {currency}
            </span>
          </div>
          {onToggleShared && (
            <div className="flex flex-wrap gap-1">
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

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSharedCostItem, calculateLineItemTotals } from "@/lib/expenseLineItems";
import { toast } from "sonner";

export interface LineItemRow {
  id: string;
  expense_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_shared: boolean;
  created_at: string;
}

export interface ClaimRow {
  id: string;
  line_item_id: string;
  user_id: string;
  claimed_quantity: number;
  created_at: string;
}

/** Safe accessor — old rows from before the migration lack the column */
function claimQty(c: ClaimRow): number {
  return typeof c.claimed_quantity === "number" ? c.claimed_quantity : 1;
}

/** Helpers to aggregate claim quantities for a line item */
export function getTotalClaimedQuantity(claims: ClaimRow[], lineItemId: string): number {
  return claims
    .filter((c) => c.line_item_id === lineItemId)
    .reduce((sum, c) => sum + claimQty(c), 0);
}

export function getRemainingQuantity(itemQuantity: number, claims: ClaimRow[], lineItemId: string): number {
  return Math.max(0, itemQuantity - getTotalClaimedQuantity(claims, lineItemId));
}

export function useLineItemClaims(expenseId: string | null, tripId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const lineItemsQuery = useQuery({
    queryKey: ["expense-line-items", expenseId],
    queryFn: async () => {
      if (!expenseId) return [];
      const { data, error } = await supabase
        .from("expense_line_items")
        .select("*")
        .eq("expense_id", expenseId)
        .order("created_at");
      if (error) throw error;
      return data as LineItemRow[];
    },
    enabled: !!expenseId && !!user,
  });

  const claimsQuery = useQuery({
    queryKey: ["expense-line-item-claims", expenseId],
    queryFn: async () => {
      const itemIds = lineItemsQuery.data?.map((li) => li.id) || [];
      if (itemIds.length === 0) return [];
      const { data, error } = await supabase
        .from("expense_line_item_claims")
        .select("*")
        .in("line_item_id", itemIds);
      if (error) throw error;
      return data as ClaimRow[];
    },
    enabled: !!lineItemsQuery.data && lineItemsQuery.data.length > 0,
  });

  /** Recalculate and persist splits based on current claims */
  const recalcSplits = async () => {
    const items = lineItemsQuery.data || [];
    if (items.length === 0 || !expenseId) return;

    const { data: expense } = await supabase
      .from("expenses")
      .select("amount")
      .eq("id", expenseId)
      .single();
    if (!expense) return;

    const { data: tripMembers } = await supabase
      .from("trip_members")
      .select("user_id")
      .eq("trip_id", tripId);
    if (!tripMembers || tripMembers.length === 0) return;

    const itemIds = items.map((li) => li.id);
    const { data: freshClaims } = await supabase
      .from("expense_line_item_claims")
      .select("*")
      .in("line_item_id", itemIds);

    const claimsByItemId = new Map<string, ClaimRow[]>();
    for (const c of (freshClaims || []) as ClaimRow[]) {
      const existing = claimsByItemId.get(c.line_item_id) || [];
      existing.push(c);
      claimsByItemId.set(c.line_item_id, existing);
    }

    const memberIds = tripMembers.map((m) => m.user_id);
    const { totals } = calculateLineItemTotals({
      lineItems: items,
      memberIds,
      totalAmount: expense.amount,
      getAssigneeIds: (item) => (claimsByItemId.get(item.id) ?? []).map((c) => c.user_id),
      getClaimQuantity: (item, userId) => {
        const claim = (claimsByItemId.get(item.id) ?? []).find((c) => c.user_id === userId);
        return claim ? claimQty(claim) : 0;
      },
    });

    const splitsPayload = memberIds
      .filter((uid) => (totals[uid] || 0) >= 0.005)
      .map((uid) => ({ user_id: uid, share_amount: totals[uid] }));

    await supabase.rpc("replace_expense_splits", {
      _expense_id: expenseId,
      _splits: splitsPayload as any,
    });

    qc.invalidateQueries({ queryKey: ["expenses", tripId] });
  };

  /** Toggle claim for quantity=1 items (backward-compatible binary toggle) */
  const toggleClaim = useMutation({
    mutationFn: async (lineItemId: string) => {
      if (!user || !expenseId) throw new Error("Not authenticated");
      const existing = claimsQuery.data?.find(
        (c) => c.line_item_id === lineItemId && c.user_id === user.id
      );
      if (existing) {
        const { error } = await supabase
          .from("expense_line_item_claims")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Don't send claimed_quantity here — let the DB column default (1) handle it.
        // This keeps toggleClaim working even before the migration is applied.
        const { error } = await supabase
          .from("expense_line_item_claims")
          .insert({ line_item_id: lineItemId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["expense-line-item-claims", expenseId] });
      await recalcSplits();
    },
    onError: (e: any) => {
      toast.error(e?.message || "Failed to update claim");
    },
  });

  /**
   * Set claim quantity for multi-quantity items.
   * quantity=0 removes the claim; quantity>0 upserts.
   *
   * Uses upsert with onConflict to avoid race conditions when the
   * local claims cache is stale (e.g. rapid clicks before refetch).
   */
  const setClaimQuantity = useMutation({
    mutationFn: async ({ lineItemId, quantity }: { lineItemId: string; quantity: number }) => {
      if (!user || !expenseId) throw new Error("Not authenticated");

      if (quantity <= 0) {
        // Remove claim — need to find the row to delete
        const existing = claimsQuery.data?.find(
          (c) => c.line_item_id === lineItemId && c.user_id === user.id
        );
        if (existing) {
          const { error } = await supabase
            .from("expense_line_item_claims")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          // No cached row — try deleting by composite key
          const { error } = await supabase
            .from("expense_line_item_claims")
            .delete()
            .eq("line_item_id", lineItemId)
            .eq("user_id", user.id);
          if (error) throw error;
        }
      } else {
        // Upsert: insert or update in one call.
        // This avoids the stale-cache race where the local claimsQuery.data
        // doesn't yet reflect a row that was just inserted.
        const { error } = await supabase
          .from("expense_line_item_claims")
          .upsert(
            {
              line_item_id: lineItemId,
              user_id: user.id,
              claimed_quantity: quantity,
            } as any,
            { onConflict: "line_item_id,user_id" }
          );
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["expense-line-item-claims", expenseId] });
      await recalcSplits();
    },
  });

  return {
    lineItems: lineItemsQuery.data || [],
    claims: claimsQuery.data || [],
    hasLineItems: (lineItemsQuery.data?.length || 0) > 0,
    isLoading: lineItemsQuery.isLoading,
    toggleClaim,
    setClaimQuantity,
  };
}

/**
 * Save scanned line items for an expense (called after expense creation).
 */
export async function saveLineItems(
  expenseId: string,
  items: { name: string; quantity: number; unit_price: number | null; total_price: number; is_shared?: boolean }[],
  assignments?: Record<number, Set<string> | string[]>,
  /** For multi-quantity items: maps item index → { userId → quantity } */
  quantityAssignments?: Record<number, Record<string, number>>,
) {
  if (items.length === 0) return;

  const itemsPayload = items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unit_price: item.unit_price ?? item.total_price / Math.max(item.quantity || 1, 1),
    total_price: item.total_price,
    is_shared: item.is_shared ?? isSharedCostItem(item.name),
  }));

  const assignmentsPayload: Record<string, (string | { user_id: string; quantity: number })[]> = {};
  if (assignments) {
    for (const [indexStr, userIds] of Object.entries(assignments)) {
      const ids = userIds instanceof Set ? Array.from(userIds) : userIds;
      if (ids.length === 0) continue;

      const qtyMap = quantityAssignments?.[Number(indexStr)];
      if (qtyMap) {
        // Send objects with quantity for multi-quantity items
        assignmentsPayload[indexStr] = ids.map((uid) => ({
          user_id: uid,
          quantity: qtyMap[uid] || 1,
        }));
      } else {
        assignmentsPayload[indexStr] = ids;
      }
    }
  }

  const { error } = await supabase.rpc("create_expense_line_items_with_claims", {
    _expense_id: expenseId,
    _items: itemsPayload as any,
    _assignments: assignmentsPayload as any,
  });
  if (error) throw error;
}

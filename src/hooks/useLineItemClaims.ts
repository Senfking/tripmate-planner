import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSharedCostItem, calculateLineItemTotals } from "@/lib/expenseLineItems";

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
  created_at: string;
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
        const { error } = await supabase
          .from("expense_line_item_claims")
          .insert({ line_item_id: lineItemId, user_id: user.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      // Refetch claims first so we have latest data
      await qc.invalidateQueries({ queryKey: ["expense-line-item-claims", expenseId] });

      // Now recompute and persist splits from the updated claims
      const items = lineItemsQuery.data || [];
      if (items.length === 0 || !expenseId) return;

      // Get the expense to know totalAmount and trip members
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

      // Re-fetch fresh claims after invalidation
      const itemIds = items.map((li) => li.id);
      const { data: freshClaims } = await supabase
        .from("expense_line_item_claims")
        .select("*")
        .in("line_item_id", itemIds);

      const claimsByItemId = new Map<string, string[]>();
      for (const c of (freshClaims || [])) {
        const existing = claimsByItemId.get(c.line_item_id) || [];
        existing.push(c.user_id);
        claimsByItemId.set(c.line_item_id, existing);
      }

      const memberIds = tripMembers.map((m) => m.user_id);
      const { totals } = calculateLineItemTotals({
        lineItems: items,
        memberIds,
        totalAmount: expense.amount,
        getAssigneeIds: (item) => claimsByItemId.get(item.id) ?? [],
      });

      const splitsPayload = memberIds
        .filter((uid) => (totals[uid] || 0) >= 0.005)
        .map((uid) => ({ user_id: uid, share_amount: totals[uid] }));

      await supabase.rpc("replace_expense_splits", {
        _expense_id: expenseId,
        _splits: splitsPayload as any,
      });

      // Invalidate splits/expenses queries so the card header updates
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
    },
  });

  return {
    lineItems: lineItemsQuery.data || [],
    claims: claimsQuery.data || [],
    hasLineItems: (lineItemsQuery.data?.length || 0) > 0,
    isLoading: lineItemsQuery.isLoading,
    toggleClaim,
  };
}

/**
 * Save scanned line items for an expense (called after expense creation).
 */
export async function saveLineItems(
  expenseId: string,
  items: { name: string; quantity: number; unit_price: number | null; total_price: number; is_shared?: boolean }[],
  assignments?: Record<number, Set<string> | string[]>,
) {
  if (items.length === 0) return;

  const itemsPayload = items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unit_price: item.unit_price ?? item.total_price / Math.max(item.quantity || 1, 1),
    total_price: item.total_price,
    is_shared: item.is_shared ?? isSharedCostItem(item.name),
  }));

  // Convert assignments to { "0": ["uid1","uid2"], ... } format
  const assignmentsPayload: Record<string, string[]> = {};
  if (assignments) {
    for (const [indexStr, userIds] of Object.entries(assignments)) {
      const ids = userIds instanceof Set ? Array.from(userIds) : userIds;
      if (ids.length > 0) {
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

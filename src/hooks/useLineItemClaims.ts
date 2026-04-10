import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isSharedCostItem } from "@/lib/expenseLineItems";

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
      if (!user) throw new Error("Not authenticated");
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-line-item-claims", expenseId] });
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
  const rows = items.map((item) => ({
    expense_id: expenseId,
    name: item.name,
    quantity: item.quantity,
    unit_price: item.unit_price ?? item.total_price / Math.max(item.quantity || 1, 1),
    total_price: item.total_price,
    is_shared: item.is_shared ?? isSharedCostItem(item.name),
  }));
  const { data: inserted, error } = await supabase
    .from("expense_line_items")
    .insert(rows as any)
    .select("id");
  if (error) throw error;

  // Save claims from assignments made during creation
  if (assignments && inserted) {
    const claimRows: { line_item_id: string; user_id: string }[] = [];
    for (const [indexStr, userIds] of Object.entries(assignments)) {
      const idx = Number(indexStr);
      const lineItemId = inserted[idx]?.id;
      if (!lineItemId) continue;
      const ids = userIds instanceof Set ? Array.from(userIds) : userIds;
      for (const userId of ids) {
        claimRows.push({ line_item_id: lineItemId, user_id: userId });
      }
    }
    if (claimRows.length > 0) {
      const { error: claimErr } = await supabase
        .from("expense_line_item_claims")
        .insert(claimRows as any);
      if (claimErr) throw claimErr;
    }
  }
}

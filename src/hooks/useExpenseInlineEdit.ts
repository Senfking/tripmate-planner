import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { ExpenseRow, SplitRow, SplitType, snapshotFxRate } from "@/hooks/useExpenses";
import { isSharedCostItem } from "@/lib/expenseLineItems";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";

type SplitMode = "equal" | "percent" | "custom";

/**
 * Hook for the inline-editing flow inside the expanded ExpenseCard.
 * Each mutation patches ONE expense field (or splits) and invalidates
 * just enough cache so the change appears instantly.
 */
export function useExpenseInlineEdit(tripId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();

  /** Patch one or more scalar columns on the expenses row */
  const patchExpense = useMutation({
    mutationFn: async (params: { id: string; patch: Partial<Pick<ExpenseRow, "title" | "amount" | "currency" | "category" | "incurred_on" | "payer_id" | "notes" | "itinerary_item_id" | "split_type">> }) => {
      const { id, patch } = params;

      // If currency is being changed, refresh the fx_rate snapshot. The
      // existing snapshot was pinned to the previous currency and would
      // produce wrong settlement totals after the swap.
      let fxPatch: { fx_rate: number | null; fx_base: string | null } | null = null;
      if (typeof patch.currency === "string") {
        fxPatch = await snapshotFxRate(qc, patch.currency);
      }

      const { error } = await supabase
        .from("expenses")
        .update({
          ...patch,
          ...(fxPatch ? { fx_rate: fxPatch.fx_rate, fx_base: fxPatch.fx_base } : {}),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      trackEvent("expense_inline_edit", { trip_id: tripId, expense_id: vars.id, fields: Object.keys(vars.patch) }, user?.id);
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses-summary", tripId] });
      qc.invalidateQueries({ queryKey: ["global-expenses"] });
    },
    onError: (e: any) => toast.error(friendlyErrorMessage(e, "Couldn't save change")),
  });

  /**
   * Re-split an expense by mode and (optionally) write the new split_type
   * onto the expense row in the same flow. Used when the user toggles
   * Equal/%/Custom inline.
   *
   * When `previousSplitType` is 'byItem' and the new mode is not, we also
   * call delete_expense_line_items_and_claims to remove the orphan line
   * items + claims rows. Without that cleanup, the row keeps stale data
   * that legacy display paths used to interpret as 'byItem' (the bug this
   * fix is closing).
   */
  const replaceSplits = useMutation({
    mutationFn: async (params: {
      expenseId: string;
      splits: { user_id: string; share_amount: number }[];
      splitType?: SplitType;
      previousSplitType?: SplitType;
    }) => {
      const { expenseId, splits, splitType, previousSplitType } = params;

      if (splitType) {
        const { error: uErr } = await supabase
          .from("expenses")
          .update({ split_type: splitType, updated_at: new Date().toISOString() } as any)
          .eq("id", expenseId);
        if (uErr) throw uErr;
      }

      if (previousSplitType === "byItem" && splitType && splitType !== "byItem") {
        const { error: dErr } = await supabase.rpc("delete_expense_line_items_and_claims", {
          _expense_id: expenseId,
        });
        if (dErr) throw dErr;
      }

      const { error } = await supabase.rpc("replace_expense_splits", {
        _expense_id: expenseId,
        _splits: splits as any,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["expense-splits", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses-summary", tripId] });
      qc.invalidateQueries({ queryKey: ["global-expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-line-items", vars.expenseId] });
      qc.invalidateQueries({ queryKey: ["expense-line-item-claims", vars.expenseId] });
    },
    onError: (e: any) => toast.error(friendlyErrorMessage(e, "Couldn't update split")),
  });

  /** Insert a single new line item under an expense */
  const addLineItem = useMutation({
    mutationFn: async (params: {
      expenseId: string;
      name: string;
      quantity: number;
      unitPrice: number;
    }) => {
      const totalPrice = Math.round(params.quantity * params.unitPrice * 100) / 100;
      const { error } = await supabase.from("expense_line_items").insert({
        expense_id: params.expenseId,
        name: params.name,
        quantity: params.quantity,
        unit_price: params.unitPrice,
        total_price: totalPrice,
        is_shared: isSharedCostItem(params.name),
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["expense-line-items", vars.expenseId] });
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
    },
    onError: (e: any) => toast.error(friendlyErrorMessage(e, "Couldn't add item")),
  });

  return { patchExpense, replaceSplits, addLineItem };
}

/**
 * Read the current split mode from the expense row.
 *
 * Previously this inferred from the splits' shape (single row -> equal,
 * all-equal amounts -> equal, else -> custom). That worked for live data
 * but disagreed with the form modal in edge cases (byItem expenses with
 * one non-zero claimant looked like 'equal' because length<=1). Reading
 * the persisted column makes both surfaces agree.
 *
 * The inline toggle UI only handles 'equal' and 'custom'; 'byItem' is
 * surfaced to the caller as-is so it can render the correct read-only
 * label and hide the toggle.
 */
export function detectSplitMode(expense: { split_type: SplitType }): SplitType {
  return expense.split_type;
}

/** Recalculate splits for the chosen mode, preserving participants */
export function recomputeSplits(
  mode: SplitMode,
  participants: string[],
  totalAmount: number,
  currentSplits: SplitRow[],
): { user_id: string; share_amount: number }[] {
  if (participants.length === 0) return [];

  if (mode === "equal") {
    const base = Math.floor((totalAmount / participants.length) * 100) / 100;
    const remainder = Math.round((totalAmount - base * participants.length) * 100) / 100;
    return participants.map((uid, i) => ({
      user_id: uid,
      share_amount: i === 0 ? Math.round((base + remainder) * 100) / 100 : base,
    }));
  }

  if (mode === "percent") {
    // Convert existing shares to percentages, redistribute
    const totalCurrent = currentSplits.reduce((s, x) => s + x.share_amount, 0) || totalAmount;
    return participants.map((uid) => {
      const cur = currentSplits.find((s) => s.user_id === uid)?.share_amount ?? totalAmount / participants.length;
      const pct = totalCurrent > 0 ? cur / totalCurrent : 1 / participants.length;
      return { user_id: uid, share_amount: Math.round(totalAmount * pct * 100) / 100 };
    });
  }

  // custom: keep existing values, default new participants to even share of remainder
  const known = new Map(currentSplits.map((s) => [s.user_id, s.share_amount]));
  const knownSum = participants.reduce((s, uid) => s + (known.get(uid) ?? 0), 0);
  const missing = participants.filter((uid) => !known.has(uid));
  const fallback = missing.length > 0 ? Math.max(0, totalAmount - knownSum) / missing.length : 0;
  return participants.map((uid) => ({
    user_id: uid,
    share_amount: known.has(uid) ? known.get(uid)! : Math.round(fallback * 100) / 100,
  }));
}

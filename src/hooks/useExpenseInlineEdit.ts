import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { ExpenseRow, SplitRow, snapshotFxRate } from "@/hooks/useExpenses";
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
    mutationFn: async (params: { id: string; patch: Partial<Pick<ExpenseRow, "title" | "amount" | "currency" | "category" | "incurred_on" | "payer_id" | "notes" | "itinerary_item_id">> }) => {
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
   * Re-split an expense by mode while keeping the same set of participants.
   * Used when the user toggles Equal/%/Custom inline.
   */
  const replaceSplits = useMutation({
    mutationFn: async (params: {
      expenseId: string;
      splits: { user_id: string; share_amount: number }[];
    }) => {
      const { error } = await supabase.rpc("replace_expense_splits", {
        _expense_id: params.expenseId,
        _splits: params.splits as any,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["expense-splits", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses-summary", tripId] });
      qc.invalidateQueries({ queryKey: ["global-expenses"] });
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

/** Detect current split mode from a set of splits + total amount */
export function detectSplitMode(splits: SplitRow[], total: number): SplitMode {
  if (splits.length <= 1) return "equal";
  const first = splits[0].share_amount;
  const allEqual = splits.every((s) => Math.abs(s.share_amount - first) < 0.01);
  if (allEqual) return "equal";
  return "custom";
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

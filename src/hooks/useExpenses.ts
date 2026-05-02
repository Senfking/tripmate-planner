import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { saveLineItems } from "@/hooks/useLineItemClaims";
import { parseRates, fetchEurRates, crossCalculateRates } from "@/lib/fetchCrossRates";
import { showErrorToast } from "@/lib/supabaseErrors";
import { withAuthRetry } from "@/lib/safeQuery";
import { expectAffectedRows } from "@/lib/safeMutate";
import { isValidTripId } from "@/lib/tripId";

// Belt-and-suspenders gate alongside `enabled: isValidTripId(tripId)`. JUNTO-3
// observed `op="members_select"` firing with the literal string "undefined" as
// a uuid, even though every query here already gates on isValidTripId. The
// remaining bypass paths are (a) cached tabs running pre-PR-#181 code and
// (b) React Query refetches that re-invoke the latest queryFn closure after
// the parent has re-rendered with an invalidated tripId. Validating again at
// the queryFn boundary stops the bad request from reaching Supabase.
function tripIdGuard(tripId: string, op: string, userId: string | undefined): boolean {
  if (isValidTripId(tripId)) return true;
  trackEvent(
    "app_error",
    {
      type: "invalid_trip_id_query",
      op,
      trip_id: tripId,
      route: typeof window !== "undefined" ? window.location.pathname : null,
      severity: "low",
    },
    userId,
  );
  return false;
}

export interface ExpenseRow {
  id: string;
  trip_id: string;
  payer_id: string;
  amount: number;
  currency: string;
  category: string;
  title: string;
  notes: string | null;
  incurred_on: string;
  itinerary_item_id: string | null;
  receipt_image_path: string | null;
  /** FX snapshot at insert/edit time. Null on legacy rows pre-backfill. */
  fx_rate: number | null;
  fx_base: string | null;
  created_at: string;
  updated_at: string;
}

/** Resolve the EUR-base FX rate for `currency` from the cached EUR rate row,
 *  reusing the same query key as useExpenses' ratesQuery so we hit cache.
 *  Returns null fields when the rate is unavailable — caller stores NULL and
 *  display code falls back to live conversion. */
export async function snapshotFxRate(
  qc: ReturnType<typeof useQueryClient>,
  currency: string,
): Promise<{ fx_rate: number | null; fx_base: string | null }> {
  if (currency === "EUR") return { fx_rate: 1, fx_base: "EUR" };
  try {
    const eurRates = await qc.fetchQuery({
      queryKey: ["exchange-rates", "EUR"],
      queryFn: fetchEurRates,
      staleTime: 1000 * 60 * 60,
    });
    const rate = eurRates[currency];
    if (typeof rate === "number" && rate > 0) {
      return { fx_rate: rate, fx_base: "EUR" };
    }
  } catch {
    // Network/cache miss — leave snapshot null, display falls back to live rates.
  }
  return { fx_rate: null, fx_base: null };
}

export interface SplitRow {
  id: string;
  expense_id: string;
  user_id: string;
  share_amount: number;
}

export interface MemberProfile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  attendanceStatus: string;
}



export function useExpenses(tripId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [refreshingRates, setRefreshingRates] = useState(false);

  // Fetch expenses
  const expensesQuery = useQuery({
    queryKey: ["expenses", tripId],
    queryFn: () =>
      withAuthRetry(
        async () => {
          if (!tripIdGuard(tripId, "expenses_select", user?.id)) return [] as ExpenseRow[];
          const { data, error } = await supabase
            .from("expenses")
            .select("*")
            .eq("trip_id", tripId)
            .order("incurred_on", { ascending: false })
            .limit(500);
          if (error) throw error;
          return data as ExpenseRow[];
        },
        { name: "expenses_select", context: { trip_id: tripId }, userId: user?.id },
      ),
    enabled: isValidTripId(tripId) && !!user,
    placeholderData: keepPreviousData,
  });

  // Fetch all splits for this trip's expenses
  const splitsQuery = useQuery({
    queryKey: ["expense-splits", tripId],
    queryFn: () =>
      withAuthRetry(
        async () => {
          // Read expense IDs from query cache to avoid stale closure
          const cachedExpenses = qc.getQueryData<ExpenseRow[]>(["expenses", tripId]);
          const expenseIds = (cachedExpenses ?? expensesQuery.data)?.map((e) => e.id) || [];
          if (expenseIds.length === 0) return [] as SplitRow[];
          const { data, error } = await supabase
            .from("expense_splits")
            .select("*")
            .in("expense_id", expenseIds);
          if (error) throw error;
          return data as SplitRow[];
        },
        { name: "expense_splits_select", context: { trip_id: tripId }, userId: user?.id },
      ),
    enabled: !!expensesQuery.data,
  });

  // Fetch trip members with profiles
  const membersQuery = useQuery({
    queryKey: ["members", tripId],
    queryFn: () =>
      withAuthRetry(
        async () => {
          if (!tripIdGuard(tripId, "members_select", user?.id)) return [] as MemberProfile[];
          const { data, error } = await supabase
            .from("trip_members")
            .select("user_id, role, joined_at, attendance_status")
            .eq("trip_id", tripId)
            .order("joined_at");
          if (error) throw error;

          const userIds = data.map((m) => m.user_id);
          const { data: profiles, error: pErr } = await supabase
            .rpc("get_public_profiles", { _user_ids: userIds });
          if (pErr) throw pErr;

          const profileMap = Object.fromEntries(
            (profiles || []).map((p) => [p.id, { name: p.display_name || "Member", avatar: p.avatar_url }])
          );

          return data.map((m) => ({
            userId: m.user_id,
            displayName: profileMap[m.user_id]?.name || "Member",
            avatarUrl: profileMap[m.user_id]?.avatar || null,
            role: m.role,
            joinedAt: m.joined_at,
            attendanceStatus: (m as any).attendance_status ?? "pending",
          })) as MemberProfile[];
        },
        { name: "members_select", context: { trip_id: tripId }, userId: user?.id },
      ),
    enabled: isValidTripId(tripId) && !!user,
    placeholderData: keepPreviousData,
  });

  // Fetch settlement currency from trip
  const settlementQuery = useQuery({
    queryKey: ["settlement-currency", tripId],
    queryFn: () =>
      withAuthRetry(
        async () => {
          if (!tripIdGuard(tripId, "settlement_currency_select", user?.id)) return "EUR";
          const { data, error } = await supabase
            .from("trips")
            .select("settlement_currency")
            .eq("id", tripId)
            .single();
          if (error) throw error;
          return (data as any).settlement_currency as string || "EUR";
        },
        { name: "settlement_currency_select", context: { trip_id: tripId }, userId: user?.id },
      ),
    enabled: isValidTripId(tripId) && !!user,
    placeholderData: keepPreviousData,
  });

  // Exchange rates: DB cache first, then live API fallback
  const settlementCurrency = settlementQuery.data || "EUR";

  const ratesQuery = useQuery({
    queryKey: ["exchange-rates-trip", settlementCurrency],
    // fetchedAtMs is epoch milliseconds, not a Date — query results must be
    // JSON-serializable so they survive the localStorage persister round-trip.
    queryFn: async (): Promise<{
      rates: Record<string, number>;
      fetchedAtMs: number | null;
      source: "cache" | "live" | "none";
    }> => {
      const eurRates = await qc.fetchQuery({
        queryKey: ["exchange-rates", "EUR"],
        queryFn: fetchEurRates,
        staleTime: 1000 * 60 * 60,
      });

      const { data: eurMeta } = await supabase
        .from("exchange_rate_cache")
        .select("fetched_at")
        .eq("base_currency", "EUR")
        .maybeSingle();

      const fetchedAtMs = eurMeta?.fetched_at ? new Date(eurMeta.fetched_at).getTime() : null;
      const source: "cache" | "live" | "none" =
        Object.keys(eurRates).length === 0 ? "none" : fetchedAtMs ? "cache" : "live";

      const rates = crossCalculateRates(eurRates, settlementCurrency);
      const effectiveSource = Object.keys(rates).length === 0 ? "none" : source;
      return { rates, fetchedAtMs, source: effectiveSource };
    },
    // No staleTime here - the expensive DB call is already cached for 1hr by
    // the inner qc.fetchQuery(["exchange-rates", "EUR"]).  The outer query is
    // just a trivial cross-calculation wrapper; caching it independently means
    // it can stay stale with empty rates for an hour while the inner cache has
    // been updated, causing multi-currency expenses to be silently excluded.
    retry: 1,
  });

  // Cached currency codes (from EUR cache row or live rates for the picker)
  const cachedCodesQuery = useQuery({
    queryKey: ["cached-currency-codes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("exchange_rate_cache")
        .select("rates")
        .eq("base_currency", "EUR")
        .maybeSingle();
      const parsed = parseRates(data?.rates);
      if (parsed) return Object.keys(parsed);
      // Fallback: use rates from the main query if available
      const mainRates = ratesQuery.data?.rates;
      if (mainRates && Object.keys(mainRates).length > 0) {
        return Object.keys(mainRates);
      }
      return [] as string[];
    },
    staleTime: 1000 * 60 * 60,
  });

  const rates = ratesQuery.data?.rates || {};
  const ratesFetchedAtMs = ratesQuery.data?.fetchedAtMs ?? null;
  const ratesSource = ratesQuery.data?.source || "none";
  const ratesStale = ratesSource === "cache" && ratesFetchedAtMs != null
    ? Date.now() - ratesFetchedAtMs > 12 * 60 * 60 * 1000
    : false;
  const ratesEmpty = ratesSource === "none" && !ratesQuery.isLoading;

  // If all expenses use the settlement currency, no conversion needed
  const allSameCurrency =
    (expensesQuery.data || []).length > 0 &&
    (expensesQuery.data || []).every((e) => e.currency === settlementCurrency);

  // Silent background refresh when rates are stale
  useEffect(() => {
    if (!ratesStale || ratesQuery.isError) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    supabase.functions.invoke("refresh-exchange-rates")
      .then(() => new Promise<void>((r) => { timer = setTimeout(r, 2000); }))
      .then(() => {
        if (cancelled) return;
        qc.invalidateQueries({ queryKey: ["exchange-rates"] });
        qc.invalidateQueries({ queryKey: ["exchange-rates-trip"] });
        qc.invalidateQueries({ queryKey: ["cached-currency-codes"] });
      })
      .catch(() => {});
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ratesStale, ratesQuery.isError, qc]);

  // Fetch itinerary items for linking
  const itineraryQuery = useQuery({
    queryKey: ["itinerary-items-for-expenses", tripId],
    queryFn: async () => {
      if (!tripIdGuard(tripId, "itinerary_items_for_expenses_select", user?.id)) return [];
      const { data, error } = await supabase
        .from("itinerary_items")
        .select("id, title, day_date, start_time")
        .eq("trip_id", tripId)
        .order("day_date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
    enabled: isValidTripId(tripId) && !!user,
  });

  // Update settlement currency - any member can do this
  const updateSettlementCurrency = useMutation({
    mutationFn: (currency: string) =>
      withAuthRetry(
        async () => {
          expectAffectedRows(
            await supabase
              .from("trips")
              .update({ settlement_currency: currency } as any)
              .eq("id", tripId)
              .select("id"),
            "Settlement currency could not be updated. Please refresh and try again.",
          );
        },
        { name: "settlement_currency_update", context: { trip_id: tripId, currency }, userId: user?.id },
      ),
    onSuccess: (_data, currency) => {
      trackEvent("settlement_currency_changed", { trip_id: tripId, currency }, user?.id);
      qc.invalidateQueries({ queryKey: ["settlement-currency", tripId] });
      qc.invalidateQueries({ queryKey: ["exchange-rates"] });
      toast.success("Settlement currency updated");
    },
    onError: (e) => showErrorToast(e, "Failed to update currency"),
  });

  // Add expense
  //
  // Each Supabase call is wrapped in withAuthRetry individually rather than
  // wrapping the whole mutationFn — the helper retries on auth errors, and
  // an outer-level retry would re-INSERT the expense row, leaving an
  // orphaned duplicate if the splits insert (or line-items RPC) is what
  // actually failed.
  const addExpense = useMutation({
    mutationFn: async (params: {
      trip_id: string;
      title: string;
      amount: number;
      currency: string;
      category: string;
      incurred_on: string;
      payer_id: string;
      notes?: string;
      itinerary_item_id?: string | null;
      receipt_image_path?: string | null;
      splits: { user_id: string; share_amount: number }[];
      lineItems?: { name: string; quantity: number; unit_price: number | null; total_price: number; is_shared?: boolean }[];
      itemAssignments?: Record<number, Set<string> | string[]>;
      quantityAssignments?: Record<number, Record<string, number>>;
    }) => {
      // Use the trip_id from params, not the closure-captured tripId. The hook
      // can be torn down and re-created with a different tripId between when
      // the form opens and when the user submits; the form's own tripId is the
      // source of truth at mutation time.
      const { splits, lineItems, itemAssignments, quantityAssignments, trip_id, ...expenseData } = params;

      if (!isValidTripId(trip_id)) {
        throw new Error("Cannot add expense: trip context is missing. Please refresh the page.");
      }

      // Snapshot the EUR-base FX rate so settlement totals don't drift as the
      // global exchange_rate_cache row is overwritten by cron.
      const fx = await snapshotFxRate(qc, params.currency);

      const insertedExpense = await withAuthRetry<ExpenseRow>(
        async () => {
          const { data, error } = await supabase
            .from("expenses")
            .insert({ ...expenseData, trip_id, fx_rate: fx.fx_rate, fx_base: fx.fx_base } as any)
            .select("*")
            .single();
          if (error) throw error;
          return data as ExpenseRow;
        },
        { name: "expense_insert", context: { trip_id, currency: params.currency, category: params.category }, userId: user?.id },
      );

      const splitRows = splits.map((s) => ({
        expense_id: insertedExpense.id,
        user_id: s.user_id,
        share_amount: s.share_amount,
      }));

      let insertedSplits: SplitRow[];
      try {
        insertedSplits = await withAuthRetry<SplitRow[]>(
          async () => {
            const { data, error } = await supabase
              .from("expense_splits")
              .insert(splitRows)
              .select("*");
            if (error) throw error;
            return (data ?? []) as SplitRow[];
          },
          { name: "expense_splits_insert", context: { trip_id, expense_id: insertedExpense.id, split_count: splitRows.length }, userId: user?.id },
        );
      } catch (sErr) {
        // Compensating delete: supabase-js can't atomically wrap the two
        // inserts, and an expense without splits is invalid balance state.
        try {
          await supabase.from("expenses").delete().eq("id", insertedExpense.id);
        } catch {}
        throw sErr;
      }

      // Save line items + claims if using "Split by item" mode
      if (lineItems && lineItems.length > 0) {
        await withAuthRetry(
          () => saveLineItems(insertedExpense.id, lineItems, itemAssignments, quantityAssignments),
          { name: "expense_line_items_save", context: { trip_id, expense_id: insertedExpense.id, item_count: lineItems.length }, userId: user?.id },
        );
      }

      return {
        expense: insertedExpense,
        splits: insertedSplits,
      };
    },
    onSuccess: (result, params) => {
      const targetTripId = params.trip_id;
      trackEvent("expense_created", { trip_id: targetTripId, currency: params.currency, category: params.category }, user?.id);
      // setQueryData required: invalidate-only doesn't update the UI in
      // time when paired with placeholderData: keepPreviousData. See
      // CLAUDE.md "Resolved Bugs" note 11.
      qc.setQueryData<ExpenseRow[]>(["expenses", targetTripId], (old) =>
        old ? [result.expense, ...old] : [result.expense]
      );
      qc.setQueryData<SplitRow[]>(["expense-splits", targetTripId], (old) =>
        old ? [...old, ...result.splits] : result.splits
      );
      qc.invalidateQueries({ queryKey: ["expenses", targetTripId] });
      qc.invalidateQueries({ queryKey: ["expense-splits", targetTripId] });
      qc.invalidateQueries({ queryKey: ["expenses-summary", targetTripId] });
      qc.invalidateQueries({ queryKey: ["global-expenses"] });
      toast.success("Expense added");
    },
    onError: (e) => showErrorToast(e, "Failed to add expense"),
  });

  // Update expense — both ops are idempotent (UPDATE with same values, RPC
  // that replaces splits in a single transaction), so withAuthRetry is safe
  // at the per-call granularity.
  const updateExpense = useMutation({
    mutationFn: async (params: {
      id: string;
      title: string;
      amount: number;
      currency: string;
      category: string;
      incurred_on: string;
      payer_id: string;
      notes?: string;
      itinerary_item_id?: string | null;
      splits: { user_id: string; share_amount: number }[];
    }) => {
      const { id, splits, ...expenseData } = params;

      // If currency changed, the row's stored fx_rate is now wrong (it was
      // pinned to the previous currency). Re-snapshot before writing so
      // settlement totals stay frozen against the new currency.
      const cachedExpenses = qc.getQueryData<ExpenseRow[]>(["expenses", tripId]);
      const prev = cachedExpenses?.find((e) => e.id === id);
      const currencyChanged = !prev || prev.currency !== params.currency;
      const fxPatch = currencyChanged
        ? await snapshotFxRate(qc, params.currency)
        : null;

      await withAuthRetry(
        async () => {
          expectAffectedRows(
            await supabase
              .from("expenses")
              .update({
                ...expenseData,
                ...(fxPatch ? { fx_rate: fxPatch.fx_rate, fx_base: fxPatch.fx_base } : {}),
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", id)
              .select("id"),
            "Expense could not be updated. Please refresh and try again.",
          );
        },
        { name: "expense_update", context: { trip_id: tripId, expense_id: id }, userId: user?.id },
      );

      await withAuthRetry(
        async () => {
          const { error: sErr } = await (supabase.rpc as any)("replace_expense_splits", {
            _expense_id: id,
            _splits: splits.map((s) => ({ user_id: s.user_id, share_amount: s.share_amount })),
          });
          if (sErr) throw sErr;
        },
        { name: "expense_splits_replace", context: { trip_id: tripId, expense_id: id, split_count: splits.length }, userId: user?.id },
      );

      return { fxPatch };
    },
    onSuccess: (result, params) => {
      const { id, splits, ...expenseData } = params;
      const fxPatch = result?.fxPatch;
      qc.setQueryData<ExpenseRow[]>(["expenses", tripId], (old) =>
        old?.map((e) => e.id === id ? {
          ...e,
          ...expenseData,
          ...(fxPatch ? { fx_rate: fxPatch.fx_rate, fx_base: fxPatch.fx_base } : {}),
          updated_at: new Date().toISOString(),
        } : e)
      );
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expense-splits", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses-summary", tripId] });
      qc.invalidateQueries({ queryKey: ["global-expenses"] });
      trackEvent("expense_updated", { trip_id: tripId, expense_id: id }, user?.id);
      toast.success("Expense updated");
    },
    onError: (e) => showErrorToast(e, "Failed to update expense"),
  });

  // Delete expense — DELETE is idempotent.
  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      // The splits delete may legitimately affect zero rows (an expense can be
      // saved without splits in some legacy paths). Only the expenses delete
      // must affect a row — that's the user-visible action.
      await withAuthRetry(
        async () => {
          const { error } = await supabase.from("expense_splits").delete().eq("expense_id", id);
          if (error) throw error;
        },
        { name: "expense_splits_delete", context: { trip_id: tripId, expense_id: id }, userId: user?.id },
      );
      await withAuthRetry(
        async () => {
          expectAffectedRows(
            await supabase.from("expenses").delete().eq("id", id).select("id"),
            "Expense could not be deleted. Please refresh and try again.",
          );
        },
        { name: "expense_delete", context: { trip_id: tripId, expense_id: id }, userId: user?.id },
      );
    },
    onSuccess: (_data, id) => {
      qc.setQueryData<ExpenseRow[]>(["expenses", tripId], (old) =>
        old?.filter((e) => e.id !== id)
      );
      qc.setQueryData<SplitRow[]>(["expense-splits", tripId], (old) =>
        old?.filter((s) => s.expense_id !== id)
      );
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expense-splits", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses-summary", tripId] });
      qc.invalidateQueries({ queryKey: ["global-expenses"] });
      trackEvent("expense_deleted", { trip_id: tripId, expense_id: id }, user?.id);
      toast.success("Expense deleted");
    },
    onError: (e) => showErrorToast(e, "Failed to delete expense"),
  });

  // Manual refresh function
  const refreshRates = async () => {
    setRefreshingRates(true);
    try {
      await supabase.functions.invoke("refresh-exchange-rates");
      await new Promise((r) => setTimeout(r, 2000));
      await qc.invalidateQueries({ queryKey: ["exchange-rates"] });
      await qc.invalidateQueries({ queryKey: ["exchange-rates-trip"] });
      await qc.invalidateQueries({ queryKey: ["cached-currency-codes"] });
      await qc.invalidateQueries({ queryKey: ["global-expenses"] });
      toast.success("Rates updated");
    } catch {
      toast.error("Failed to refresh rates");
    } finally {
      setRefreshingRates(false);
    }
  };

  return {
    expenses: expensesQuery.data || [],
    splits: splitsQuery.data || [],
    members: membersQuery.data || [],
    settlementCurrency,
    rates,
    ratesFetchedAtMs,
    ratesStale: ratesStale && !allSameCurrency,
    ratesEmpty: ratesEmpty && !allSameCurrency,
    ratesError: ratesQuery.isError,
    refreshingRates,
    refreshRates,
    cachedCurrencyCodes: cachedCodesQuery.data || [],
    itineraryItems: itineraryQuery.data || [],
    // isLoading = isPending && isFetching. Disabled queries (enabled:false) have
    // isFetching=false so they don't contribute to the loading state, preventing
    // the auth-init race where user=null briefly disables queries but isPending
    // stays true, causing permanent skeletons on first load.
    isLoading: expensesQuery.isLoading || membersQuery.isLoading || settlementQuery.isLoading,
    isError: expensesQuery.isError || membersQuery.isError || settlementQuery.isError,
    refetch: async () => {
      await Promise.all([
        expensesQuery.refetch(),
        membersQuery.refetch(),
        settlementQuery.refetch(),
      ]);
    },
    isFetchingExpenses: expensesQuery.isFetching,
    isExpensesSuccess: expensesQuery.isSuccess,
    ratesLoading: ratesQuery.isLoading,
    updateSettlementCurrency,
    addExpense,
    updateExpense,
    deleteExpense,
  };
}

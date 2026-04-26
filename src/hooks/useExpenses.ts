import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { saveLineItems } from "@/hooks/useLineItemClaims";
import { parseRates, fetchEurRates, crossCalculateRates } from "@/lib/fetchCrossRates";
import { friendlyErrorMessage, isAuthOrRlsError } from "@/lib/supabaseErrors";
import { ensureFreshSession, forceRefreshSession } from "@/lib/sessionRefresh";
import { isValidTripId } from "@/lib/tripId";

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
  created_at: string;
  updated_at: string;
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



// Wraps a query body in:
//  1. ensureFreshSession() pre-flight (avoids the JWT expiry race that fires
//     when a backgrounded tab resumes faster than auto-refresh).
//  2. forceRefreshSession() + retry-once on auth/RLS errors.
//  3. TEMPORARY trackEvent log on terminal failure so we can see what's
//     actually breaking the expenses page in browser. Remove the trackEvent
//     in a follow-up once production data confirms (or refutes) the
//     auth-race hypothesis.
async function withAuthRetry<T>(
  exec: () => Promise<T>,
  queryName: string,
  context: Record<string, unknown>,
  userId?: string,
): Promise<T> {
  await ensureFreshSession();
  try {
    return await exec();
  } catch (err) {
    if (isAuthOrRlsError(err)) {
      await forceRefreshSession();
      try {
        return await exec();
      } catch (retryErr) {
        logExpensesQueryFailure(queryName, retryErr, { ...context, retried: true }, userId);
        throw retryErr;
      }
    }
    logExpensesQueryFailure(queryName, err, context, userId);
    throw err;
  }
}

// TEMPORARY diagnostic logger — capture the real error shape for the
// "Couldn't load expenses" UI we sometimes hit in browser. Strip after we've
// seen real data.
function logExpensesQueryFailure(
  queryName: string,
  err: unknown,
  context: Record<string, unknown>,
  userId?: string,
) {
  const e = err as Record<string, unknown> | null;
  trackEvent(
    "expenses_query_error",
    {
      query: queryName,
      code: typeof e?.code === "string" ? e.code : null,
      status: typeof e?.status === "number" ? e.status : null,
      name: typeof e?.name === "string" ? e.name : null,
      message: typeof e?.message === "string" ? e.message.slice(0, 300) : null,
      details: typeof e?.details === "string" ? e.details.slice(0, 300) : null,
      hint: typeof e?.hint === "string" ? e.hint.slice(0, 200) : null,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      display_mode:
        typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches
          ? "standalone"
          : "browser",
      ...context,
    },
    userId,
  );
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
          const { data, error } = await supabase
            .from("expenses")
            .select("*")
            .eq("trip_id", tripId)
            .order("incurred_on", { ascending: false })
            .limit(500);
          if (error) throw error;
          return data as ExpenseRow[];
        },
        "expenses",
        { trip_id: tripId },
        user?.id,
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
        "expense_splits",
        { trip_id: tripId },
        user?.id,
      ),
    enabled: !!expensesQuery.data,
  });

  // Fetch trip members with profiles
  const membersQuery = useQuery({
    queryKey: ["members", tripId],
    queryFn: () =>
      withAuthRetry(
        async () => {
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
        "members",
        { trip_id: tripId },
        user?.id,
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
          const { data, error } = await supabase
            .from("trips")
            .select("settlement_currency")
            .eq("id", tripId)
            .single();
          if (error) throw error;
          return (data as any).settlement_currency as string || "EUR";
        },
        "settlement_currency",
        { trip_id: tripId },
        user?.id,
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
    mutationFn: async (currency: string) => {
      const { error } = await supabase
        .from("trips")
        .update({ settlement_currency: currency } as any)
        .eq("id", tripId);
      if (error) throw error;
    },
    onSuccess: (_data, currency) => {
      trackEvent("settlement_currency_changed", { trip_id: tripId, currency }, user?.id);
      qc.invalidateQueries({ queryKey: ["settlement-currency", tripId] });
      qc.invalidateQueries({ queryKey: ["exchange-rates"] });
      toast.success("Settlement currency updated");
    },
    onError: () => toast.error("Failed to update currency"),
  });

  // Add expense
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

      // Pre-flight: make sure the cached JWT isn't within its expiry window.
      // Without this, an insert fired immediately after returning from a
      // backgrounded tab can race the auth client's auto-refresh and get
      // rejected as an RLS violation.
      await ensureFreshSession();

      const insertExpense = () =>
        supabase
          .from("expenses")
          .insert({ ...expenseData, trip_id } as any)
          .select("*")
          .single();

      let { data: expense, error } = await insertExpense();

      // Recovery path: if the first attempt failed with an auth/RLS error,
      // the client likely had a stale token. Force a refresh and retry once
      // before surfacing the error to the user.
      if (error && isAuthOrRlsError(error)) {
        await forceRefreshSession();
        ({ data: expense, error } = await insertExpense());
      }

      if (error) throw error;
      const insertedExpense = expense as ExpenseRow;

      const splitRows = splits.map((s) => ({
        expense_id: insertedExpense.id,
        user_id: s.user_id,
        share_amount: s.share_amount,
      }));
      const { data: insertedSplits, error: sErr } = await supabase
        .from("expense_splits")
        .insert(splitRows)
        .select("*");
      if (sErr) {
        // Compensating delete: supabase-js can't atomically wrap the two
        // inserts, and an expense without splits is invalid balance state.
        try {
          await supabase.from("expenses").delete().eq("id", insertedExpense.id);
        } catch {}
        throw sErr;
      }

      // Save line items + claims if using "Split by item" mode
      if (lineItems && lineItems.length > 0) {
        await saveLineItems(insertedExpense.id, lineItems, itemAssignments, quantityAssignments);
      }

      return {
        expense: insertedExpense,
        splits: (insertedSplits ?? []) as SplitRow[],
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
    onError: (e) => toast.error(friendlyErrorMessage(e, "Failed to add expense")),
  });

  // Update expense
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

      await ensureFreshSession();

      const runUpdate = () =>
        supabase
          .from("expenses")
          .update({ ...expenseData, updated_at: new Date().toISOString() } as any)
          .eq("id", id);

      let { error } = await runUpdate();
      if (error && isAuthOrRlsError(error)) {
        await forceRefreshSession();
        ({ error } = await runUpdate());
      }
      if (error) throw error;

      // Atomically replace splits in a single DB transaction
      const { error: sErr } = await (supabase.rpc as any)("replace_expense_splits", {
        _expense_id: id,
        _splits: splits.map((s) => ({ user_id: s.user_id, share_amount: s.share_amount })),
      });
      if (sErr) throw sErr;
    },
    onSuccess: (_data, params) => {
      const { id, splits, ...expenseData } = params;
      qc.setQueryData<ExpenseRow[]>(["expenses", tripId], (old) =>
        old?.map((e) => e.id === id ? { ...e, ...expenseData, updated_at: new Date().toISOString() } : e)
      );
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expense-splits", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses-summary", tripId] });
      qc.invalidateQueries({ queryKey: ["global-expenses"] });
      trackEvent("expense_updated", { trip_id: tripId, expense_id: id }, user?.id);
      toast.success("Expense updated");
    },
    onError: (e) => toast.error(friendlyErrorMessage(e, "Failed to update expense")),
  });

  // Delete expense
  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error: sErr } = await supabase.from("expense_splits").delete().eq("expense_id", id);
      if (sErr) throw sErr;
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
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
    onError: (e) => toast.error(friendlyErrorMessage(e, "Failed to delete expense")),
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

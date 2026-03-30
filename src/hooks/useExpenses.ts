import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
  role: string;
}

const SESSION_KEY = "junto_rates_refresh_attempted";

export function useExpenses(tripId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [refreshingRates, setRefreshingRates] = useState(false);

  // Fetch expenses
  const expensesQuery = useQuery({
    queryKey: ["expenses", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("trip_id", tripId)
        .order("incurred_on", { ascending: false });
      if (error) throw error;
      return data as ExpenseRow[];
    },
    enabled: !!tripId && !!user,
  });

  // Fetch all splits for this trip's expenses
  const splitsQuery = useQuery({
    queryKey: ["expense-splits", tripId],
    queryFn: async () => {
      const expenseIds = expensesQuery.data?.map((e) => e.id) || [];
      if (expenseIds.length === 0) return [] as SplitRow[];
      const { data, error } = await supabase
        .from("expense_splits")
        .select("*")
        .in("expense_id", expenseIds);
      if (error) throw error;
      return data as SplitRow[];
    },
    enabled: !!expensesQuery.data,
  });

  // Fetch trip members with profiles
  const membersQuery = useQuery({
    queryKey: ["trip-members-profiles", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, role")
        .eq("trip_id", tripId);
      if (error) throw error;

      const userIds = data.map((m) => m.user_id);
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      if (pErr) throw pErr;

      const profileMap = Object.fromEntries(
        (profiles || []).map((p) => [p.id, p.display_name || "Member"])
      );

      return data.map((m) => ({
        userId: m.user_id,
        displayName: profileMap[m.user_id] || "Member",
        role: m.role,
      })) as MemberProfile[];
    },
    enabled: !!tripId && !!user,
  });

  // Fetch settlement currency from trip
  const settlementQuery = useQuery({
    queryKey: ["settlement-currency", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("settlement_currency")
        .eq("id", tripId)
        .single();
      if (error) throw error;
      return (data as any).settlement_currency as string || "EUR";
    },
    enabled: !!tripId && !!user,
  });

  // Exchange rates: DB cache first, then live API fallback
  const settlementCurrency = settlementQuery.data || "EUR";
  const ratesQuery = useQuery({
    queryKey: ["exchange-rates", settlementCurrency],
    queryFn: async (): Promise<{
      rates: Record<string, number>;
      fetchedAt: Date | null;
      source: "cache" | "live" | "none";
    }> => {
      // 1. Try direct cache hit for the settlement currency
      const { data } = await supabase
        .from("exchange_rate_cache")
        .select("rates, fetched_at")
        .eq("base_currency", settlementCurrency)
        .maybeSingle();

      if (data?.rates && Object.keys(data.rates as Record<string, number>).length > 0) {
        return {
          rates: data.rates as Record<string, number>,
          fetchedAt: new Date(data.fetched_at!),
          source: "cache",
        };
      }

      // 2. Cross-calculate via EUR as intermediate
      const { data: eurData } = await supabase
        .from("exchange_rate_cache")
        .select("rates, fetched_at")
        .eq("base_currency", "EUR")
        .maybeSingle();

      if (eurData?.rates && Object.keys(eurData.rates as Record<string, number>).length > 0) {
        const eurRates = eurData.rates as Record<string, number>;
        const eurToSettlement = eurRates[settlementCurrency];
        if (eurToSettlement) {
          const crossRates: Record<string, number> = {};
          for (const [code, eurRate] of Object.entries(eurRates)) {
            crossRates[code] = (eurRate as number) / eurToSettlement;
          }
          return { rates: crossRates, fetchedAt: new Date(eurData.fetched_at!), source: "cache" };
        }
      }

      // 3. DB empty — fetch directly from public API as fallback
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/EUR");
        const json = await res.json();
        if (json.result === "success" && json.rates) {
          // Fire and forget: populate DB cache for next time
          supabase.functions.invoke("refresh-exchange-rates").catch(() => {});

          const eurRates = json.rates as Record<string, number>;
          // If settlement !== EUR, cross-calculate
          if (settlementCurrency === "EUR") {
            return { rates: eurRates, fetchedAt: new Date(), source: "live" };
          }
          const eurToSettlement = eurRates[settlementCurrency];
          if (eurToSettlement) {
            const crossRates: Record<string, number> = {};
            for (const [code, eurRate] of Object.entries(eurRates)) {
              crossRates[code] = (eurRate as number) / eurToSettlement;
            }
            return { rates: crossRates, fetchedAt: new Date(), source: "live" };
          }
        }
      } catch {
        // API also failed
      }

      return { rates: {} as Record<string, number>, fetchedAt: null, source: "none" };
    },
    staleTime: 1000 * 60 * 60, // 1 hour
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
      if (data?.rates && Object.keys(data.rates as Record<string, number>).length > 0) {
        return Object.keys(data.rates as Record<string, number>);
      }
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
  const ratesFetchedAt = ratesQuery.data?.fetchedAt || null;
  const ratesSource = ratesQuery.data?.source || "none";
  const ratesStale = ratesSource === "cache" && ratesFetchedAt
    ? Date.now() - ratesFetchedAt.getTime() > 12 * 60 * 60 * 1000
    : false;
  const ratesEmpty = ratesSource === "none" && !ratesQuery.isLoading;

  // If all expenses use the settlement currency, no conversion needed
  const allSameCurrency =
    (expensesQuery.data || []).length > 0 &&
    (expensesQuery.data || []).every((e) => e.currency === settlementCurrency);

  // Auto-refresh rates when empty or stale (once per session)
  useEffect(() => {
    const shouldRefresh =
      (ratesEmpty || (ratesStale && !ratesQuery.isError)) &&
      !sessionStorage.getItem(SESSION_KEY);

    if (!shouldRefresh) return;

    sessionStorage.setItem(SESSION_KEY, "1");
    setRefreshingRates(true);

    (async () => {
      try {
        await supabase.functions.invoke("refresh-exchange-rates");
        // Give the edge function a moment to write to the DB before re-reading
        await new Promise((r) => setTimeout(r, 2000));
        await qc.invalidateQueries({ queryKey: ["exchange-rates"] });
        await qc.invalidateQueries({ queryKey: ["cached-currency-codes"] });
      } catch {
        // Silent — ignore failures
      } finally {
        setRefreshingRates(false);
      }
    })();
  }, [qc, ratesEmpty, ratesStale, ratesQuery.isError]);

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
    enabled: !!tripId && !!user,
  });

  // Update settlement currency — any member can do this
  const updateSettlementCurrency = useMutation({
    mutationFn: async (currency: string) => {
      const { error } = await supabase
        .from("trips")
        .update({ settlement_currency: currency } as any)
        .eq("id", tripId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settlement-currency", tripId] });
      qc.invalidateQueries({ queryKey: ["exchange-rates"] });
      toast.success("Settlement currency updated");
    },
    onError: () => toast.error("Failed to update currency"),
  });

  // Add expense
  const addExpense = useMutation({
    mutationFn: async (params: {
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
      const { splits, ...expenseData } = params;
      const { data: expense, error } = await supabase
        .from("expenses")
        .insert({ ...expenseData, trip_id: tripId } as any)
        .select("id")
        .single();
      if (error) throw error;

      const splitRows = splits.map((s) => ({
        expense_id: expense.id,
        user_id: s.user_id,
        share_amount: s.share_amount,
      }));
      const { error: sErr } = await supabase.from("expense_splits").insert(splitRows);
      if (sErr) throw sErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expense-splits", tripId] });
      toast.success("Expense added");
    },
    onError: (e) => toast.error(e.message || "Failed to add expense"),
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
      const { error } = await supabase
        .from("expenses")
        .update({ ...expenseData, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;

      // Delete old splits and re-insert
      const { error: dErr } = await supabase.from("expense_splits").delete().eq("expense_id", id);
      if (dErr) throw dErr;

      const splitRows = splits.map((s) => ({
        expense_id: id,
        user_id: s.user_id,
        share_amount: s.share_amount,
      }));
      const { error: sErr } = await supabase.from("expense_splits").insert(splitRows);
      if (sErr) throw sErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expense-splits", tripId] });
      toast.success("Expense updated");
    },
    onError: (e) => toast.error(e.message || "Failed to update expense"),
  });

  // Delete expense
  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error: sErr } = await supabase.from("expense_splits").delete().eq("expense_id", id);
      if (sErr) throw sErr;
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expense-splits", tripId] });
      toast.success("Expense deleted");
    },
    onError: () => toast.error("Failed to delete expense"),
  });

  return {
    expenses: expensesQuery.data || [],
    splits: splitsQuery.data || [],
    members: membersQuery.data || [],
    settlementCurrency,
    rates,
    ratesFetchedAt,
    ratesStale: ratesStale && !allSameCurrency,
    ratesEmpty: ratesEmpty && !allSameCurrency,
    ratesError: ratesQuery.isError,
    refreshingRates,
    cachedCurrencyCodes: cachedCodesQuery.data || [],
    itineraryItems: itineraryQuery.data || [],
    isLoading: expensesQuery.isLoading || membersQuery.isLoading || settlementQuery.isLoading,
    ratesLoading: ratesQuery.isLoading,
    updateSettlementCurrency,
    addExpense,
    updateExpense,
    deleteExpense,
  };
}

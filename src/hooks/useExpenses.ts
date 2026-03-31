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
        .rpc("get_public_profiles", { _user_ids: userIds });
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

  // Safely parse jsonb rates from Supabase (could be string, object, or null)
  const parseRates = (raw: unknown): Record<string, number> | null => {
    if (!raw) return null;
    let obj: Record<string, unknown>;
    if (typeof raw === "string") {
      try { obj = JSON.parse(raw); } catch { return null; }
    } else if (typeof raw === "object" && !Array.isArray(raw)) {
      obj = raw as Record<string, unknown>;
    } else {
      return null;
    }
    const entries = Object.entries(obj);
    if (entries.length === 0) return null;
    return obj as Record<string, number>;
  };

  const ratesQuery = useQuery({
    queryKey: ["exchange-rates", settlementCurrency],
    queryFn: async (): Promise<{
      rates: Record<string, number>;
      fetchedAt: Date | null;
      source: "cache" | "live" | "none";
    }> => {
      // 1. Try EUR cache row first (most likely to exist)
      const { data: eurRow } = await supabase
        .from("exchange_rate_cache")
        .select("rates, fetched_at")
        .eq("base_currency", "EUR")
        .maybeSingle();

      const eurRates = parseRates(eurRow?.rates);

      if (eurRates) {
        const fetchedAt = eurRow?.fetched_at ? new Date(eurRow.fetched_at) : new Date();

        if (settlementCurrency === "EUR") {
          return { rates: eurRates, fetchedAt, source: "cache" };
        }

        // Cross-calculate from EUR to settlement currency
        const eurToSettlement = eurRates[settlementCurrency];
        if (eurToSettlement && eurToSettlement > 0) {
          const crossRates: Record<string, number> = {};
          for (const [code, eurRate] of Object.entries(eurRates)) {
            crossRates[code] = (eurRate as number) / eurToSettlement;
          }
          return { rates: crossRates, fetchedAt, source: "cache" };
        }
      }

      // 2. Try direct cache hit for the settlement currency
      if (settlementCurrency !== "EUR") {
        const { data: directRow } = await supabase
          .from("exchange_rate_cache")
          .select("rates, fetched_at")
          .eq("base_currency", settlementCurrency)
          .maybeSingle();

        const directRates = parseRates(directRow?.rates);
        if (directRates) {
          return {
            rates: directRates,
            fetchedAt: directRow?.fetched_at ? new Date(directRow.fetched_at) : new Date(),
            source: "cache",
          };
        }
      }

      // 3. DB empty — fetch directly from public API as fallback
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/EUR");
        const json = await res.json();
        if (json.result === "success" && json.rates) {
          supabase.functions.invoke("refresh-exchange-rates").catch(() => {});

          const liveEurRates = json.rates as Record<string, number>;
          if (settlementCurrency === "EUR") {
            return { rates: liveEurRates, fetchedAt: new Date(), source: "live" };
          }
          const eurToSettlement = liveEurRates[settlementCurrency];
          if (eurToSettlement && eurToSettlement > 0) {
            const crossRates: Record<string, number> = {};
            for (const [code, eurRate] of Object.entries(liveEurRates)) {
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
    staleTime: 1000 * 60 * 60,
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

  // Manual refresh function
  const refreshRates = async () => {
    setRefreshingRates(true);
    try {
      await supabase.functions.invoke("refresh-exchange-rates");
      await new Promise((r) => setTimeout(r, 2000));
      await qc.invalidateQueries({ queryKey: ["exchange-rates"] });
      await qc.invalidateQueries({ queryKey: ["cached-currency-codes"] });
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
    ratesFetchedAt,
    ratesStale: ratesStale && !allSameCurrency,
    ratesEmpty: ratesEmpty && !allSameCurrency,
    ratesError: ratesQuery.isError,
    refreshingRates,
    refreshRates,
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

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

  // Exchange rates
  const settlementCurrency = settlementQuery.data || "EUR";
  const ratesQuery = useQuery({
    queryKey: ["exchange-rates", settlementCurrency],
    queryFn: async () => {
      const res = await fetch(
        `https://api.frankfurter.app/latest?from=${settlementCurrency}`
      );
      if (!res.ok) throw new Error("Failed to fetch rates");
      const json = await res.json();
      return json.rates as Record<string, number>;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
  });

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
    rates: ratesQuery.data || {},
    ratesError: ratesQuery.isError,
    itineraryItems: itineraryQuery.data || [],
    isLoading: expensesQuery.isLoading || membersQuery.isLoading || settlementQuery.isLoading,
    updateSettlementCurrency,
    addExpense,
    updateExpense,
    deleteExpense,
  };
}

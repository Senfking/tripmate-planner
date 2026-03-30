import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TripBalance {
  tripId: string;
  tripName: string;
  tripEmoji: string | null;
  currency: string;
  net: number; // positive = owed to user, negative = user owes
}

export interface GlobalExpensesResult {
  overallNet: number;
  currency: string; // primary currency (from first trip or EUR)
  trips: TripBalance[];
}

async function fetchEurRates(): Promise<Record<string, number>> {
  // Try DB cache first
  const { data } = await supabase
    .from("exchange_rate_cache")
    .select("rates")
    .eq("base_currency", "EUR")
    .maybeSingle();

  if (data?.rates && Object.keys(data.rates as Record<string, number>).length > 0) {
    return data.rates as Record<string, number>;
  }

  // Fallback: live API
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/EUR");
    const json = await res.json();
    if (json.result === "success" && json.rates) {
      return json.rates as Record<string, number>;
    }
  } catch {
    // ignore
  }
  return {};
}

function convertToEur(
  amount: number,
  currency: string,
  eurRates: Record<string, number>
): number | null {
  if (currency === "EUR") return amount;
  const rate = eurRates[currency];
  if (!rate) return null;
  return amount / rate;
}

export function useGlobalExpenses() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["global-expenses", user?.id],
    enabled: !!user,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<GlobalExpensesResult> => {
      const userId = user!.id;

      const { data: memberships } = await supabase
        .from("trip_members")
        .select("trip_id")
        .eq("user_id", userId);

      if (!memberships?.length)
        return { overallNet: 0, currency: "EUR", trips: [] };

      const tripIds = memberships.map((m) => m.trip_id);

      const [{ data: trips }, { data: expenses }, { data: splits }, eurRates] =
        await Promise.all([
          supabase
            .from("trips")
            .select("id, name, emoji, settlement_currency")
            .in("id", tripIds),
          supabase
            .from("expenses")
            .select("id, trip_id, payer_id, amount, currency")
            .in("trip_id", tripIds),
          supabase
            .from("expense_splits")
            .select("expense_id, user_id, share_amount")
            .eq("user_id", userId),
          fetchEurRates(),
        ]);

      const tripMap = new Map(
        (trips ?? []).map((t) => [t.id, t])
      );

      // Build expense→trip and expense→currency maps
      const expenseTripMap = new Map<string, string>();
      const expenseCurrencyMap = new Map<string, string>();
      for (const e of expenses ?? []) {
        expenseTripMap.set(e.id, e.trip_id);
        expenseCurrencyMap.set(e.id, e.currency);
      }

      // Build per-trip balances using settlement currency conversion
      const balanceMap = new Map<string, number>();

      // Helper to convert amount to trip's settlement currency
      const convertToSettlement = (
        amount: number,
        fromCurrency: string,
        settlementCurrency: string
      ): number | null => {
        if (fromCurrency === settlementCurrency) return amount;
        // Convert via EUR: amount → EUR → settlement
        const inEur = convertToEur(amount, fromCurrency, eurRates);
        if (inEur == null) return null;
        if (settlementCurrency === "EUR") return inEur;
        const settlementRate = eurRates[settlementCurrency];
        if (!settlementRate) return null;
        return inEur * settlementRate;
      };

      // Add amounts user paid
      for (const e of expenses ?? []) {
        if (e.payer_id === userId) {
          const trip = tripMap.get(e.trip_id);
          const sc = trip?.settlement_currency || "EUR";
          const converted = convertToSettlement(Number(e.amount), e.currency, sc);
          if (converted != null) {
            balanceMap.set(e.trip_id, (balanceMap.get(e.trip_id) ?? 0) + converted);
          }
        }
      }

      // Subtract user's splits
      for (const s of splits ?? []) {
        const tripId = expenseTripMap.get(s.expense_id);
        const currency = expenseCurrencyMap.get(s.expense_id);
        if (tripId && currency) {
          const trip = tripMap.get(tripId);
          const sc = trip?.settlement_currency || "EUR";
          const converted = convertToSettlement(Number(s.share_amount), currency, sc);
          if (converted != null) {
            balanceMap.set(tripId, (balanceMap.get(tripId) ?? 0) - converted);
          }
        }
      }

      const tripBalances: TripBalance[] = [];
      let overallNet = 0;

      for (const [tripId, net] of balanceMap) {
        const trip = tripMap.get(tripId);
        if (!trip) continue;
        if (Math.abs(net) < 0.005) continue; // skip settled trips

        tripBalances.push({
          tripId,
          tripName: trip.name,
          tripEmoji: trip.emoji,
          currency: trip.settlement_currency,
          net,
        });
        overallNet += net;
      }

      // Sort: largest absolute balance first
      tripBalances.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

      const primaryCurrency =
        tripBalances[0]?.currency ??
        (trips ?? [])[0]?.settlement_currency ??
        "EUR";

      return { overallNet, currency: primaryCurrency, trips: tripBalances };
    },
  });
}

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

      const [{ data: trips }, { data: expenses }, { data: splits }] =
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
        ]);

      const tripMap = new Map(
        (trips ?? []).map((t) => [t.id, t])
      );

      // Build per-trip balances
      const balanceMap = new Map<string, number>();

      // Add amounts user paid
      for (const e of expenses ?? []) {
        if (e.payer_id === userId) {
          balanceMap.set(e.trip_id, (balanceMap.get(e.trip_id) ?? 0) + Number(e.amount));
        }
      }

      // Build expense→trip map
      const expenseTripMap = new Map<string, string>();
      for (const e of expenses ?? []) {
        expenseTripMap.set(e.id, e.trip_id);
      }

      // Subtract user's splits
      for (const s of splits ?? []) {
        const tripId = expenseTripMap.get(s.expense_id);
        if (tripId) {
          balanceMap.set(tripId, (balanceMap.get(tripId) ?? 0) - Number(s.share_amount));
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

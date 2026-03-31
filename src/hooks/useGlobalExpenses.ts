import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calcNetBalances } from "@/lib/settlementCalc";

export interface TripBalance {
  tripId: string;
  tripName: string;
  tripEmoji: string | null;
  currency: string;
  net: number;
}

export interface GlobalExpensesResult {
  overallNet: number;
  currency: string;
  trips: TripBalance[];
}

async function fetchEurRates(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("exchange_rate_cache")
    .select("rates")
    .eq("base_currency", "EUR")
    .maybeSingle();

  if (data?.rates && Object.keys(data.rates as Record<string, number>).length > 0) {
    return data.rates as Record<string, number>;
  }

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

      const [{ data: trips }, { data: expenses }, eurRates] =
        await Promise.all([
          supabase
            .from("trips")
            .select("id, name, emoji, settlement_currency")
            .in("id", tripIds),
          supabase
            .from("expenses")
            .select("id, trip_id, payer_id, amount, currency")
            .in("trip_id", tripIds),
          fetchEurRates(),
        ]);

      const allExpenseIds = (expenses ?? []).map((e) => e.id);

      // Fetch all splits for these expenses (not just user's)
      let allSplits: { expense_id: string; user_id: string; share_amount: number }[] = [];
      if (allExpenseIds.length > 0) {
        const { data: splitsData } = await supabase
          .from("expense_splits")
          .select("expense_id, user_id, share_amount")
          .in("expense_id", allExpenseIds);
        allSplits = (splitsData ?? []).map((s) => ({
          expense_id: s.expense_id,
          user_id: s.user_id,
          share_amount: Number(s.share_amount),
        }));
      }

      // Collect all user IDs for profile lookup
      const userIdSet = new Set<string>();
      for (const e of expenses ?? []) userIdSet.add(e.payer_id);
      for (const s of allSplits) userIdSet.add(s.user_id);
      const allUserIds = Array.from(userIdSet);

      // Fetch profiles
      const profileMap: Record<string, string> = {};
      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase.rpc("get_public_profiles", {
          _user_ids: allUserIds,
        });
        for (const p of profiles ?? []) {
          profileMap[p.id] = p.display_name || "Unknown";
        }
      }

      const tripMap = new Map(
        (trips ?? []).map((t) => [t.id, t])
      );

      const expenseTripMap = new Map<string, string>();
      for (const e of expenses ?? []) {
        expenseTripMap.set(e.id, e.trip_id);
      }

      const tripBalances: TripBalance[] = [];
      let overallNet = 0;

      for (const [tripId, trip] of tripMap) {
        const sc = trip.settlement_currency || "EUR";

        // Build cross-rates for this trip's settlement currency
        let ratesForTrip = eurRates;
        if (sc !== "EUR" && eurRates[sc]) {
          const cross: Record<string, number> = {};
          for (const [code, rate] of Object.entries(eurRates)) {
            cross[code] = rate / eurRates[sc];
          }
          ratesForTrip = cross;
        }

        const expensesForTrip = (expenses ?? []).filter(
          (e) => e.trip_id === tripId
        );
        const splitsForTrip = allSplits.filter(
          (s) => expenseTripMap.get(s.expense_id) === tripId
        );

        const expensesWithSplits = expensesForTrip.map((e) => ({
          id: e.id,
          payer_id: e.payer_id,
          amount: Number(e.amount),
          currency: e.currency,
          splits: splitsForTrip
            .filter((s) => s.expense_id === e.id)
            .map((s) => ({
              user_id: s.user_id,
              share_amount: s.share_amount,
            })),
        }));

        const { balances } = calcNetBalances(
          expensesWithSplits,
          sc,
          sc,
          ratesForTrip,
          profileMap
        );

        const myBalance = balances.find((b) => b.userId === userId);
        const net = myBalance?.balance ?? 0;

        if (Math.abs(net) < 0.005) continue;

        tripBalances.push({
          tripId,
          tripName: trip.name,
          tripEmoji: trip.emoji,
          currency: sc,
          net,
        });
        overallNet += net;
      }

      tripBalances.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

      const primaryCurrency =
        tripBalances[0]?.currency ??
        (trips ?? [])[0]?.settlement_currency ??
        "EUR";

      return { overallNet, currency: primaryCurrency, trips: tripBalances };
    },
  });
}

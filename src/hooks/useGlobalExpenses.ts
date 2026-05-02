import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calcNetBalances } from "@/lib/settlementCalc";
import { fetchEurRates, crossCalculateRates } from "@/lib/fetchCrossRates";
import { resolvePhoto } from "@/lib/tripPhoto";

export interface TripBalance {
  tripId: string;
  tripName: string;
  tripEmoji: string | null;
  currency: string;
  net: number;
  photoUrl: string;
}

export interface GlobalExpensesResult {
  overallNet: number;
  currency: string;
  trips: TripBalance[];
}

// fetchEurRates and crossCalculateRates imported from @/lib/fetchCrossRates

export function useGlobalExpenses() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useQuery({
    queryKey: ["global-expenses", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<GlobalExpensesResult> => {
      const userId = user!.id;

      // Share the exact same cache entry as useExpenses - same key, same return
      // type (plain Record<string, number>), same staleTime.
      const eurRates = await qc.fetchQuery({
        queryKey: ["exchange-rates", "EUR"],
        queryFn: fetchEurRates,
        staleTime: 1000 * 60 * 60,
      });

      const { data: memberships } = await supabase
        .from("trip_members")
        .select("trip_id")
        .eq("user_id", userId);

      if (!memberships?.length)
        return { overallNet: 0, currency: "EUR", trips: [] };

      const tripIds = memberships.map((m) => m.trip_id);

      const [{ data: trips }, { data: expenses }, { data: routeStops }] = await Promise.all([
        supabase
          .from("trips")
          .select("id, name, emoji, settlement_currency, destination_image_url")
          .in("id", tripIds),
        supabase
          .from("expenses")
          .select("id, trip_id, payer_id, amount, currency, fx_rate, fx_base")
          .in("trip_id", tripIds),
        supabase
          .from("trip_route_stops")
          .select("trip_id, destination")
          .in("trip_id", tripIds)
          .order("start_date", { ascending: true }),
      ]);

      // Build destination map for photo resolution
      const stopDestsMap: Record<string, string[]> = {};
      (routeStops as any[] | null)?.forEach((s: any) => {
        if (!stopDestsMap[s.trip_id]) stopDestsMap[s.trip_id] = [];
        stopDestsMap[s.trip_id].push(s.destination);
      });

      const allExpenseIds = (expenses ?? []).map((e) => e.id);

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

      const userIdSet = new Set<string>();
      for (const e of expenses ?? []) userIdSet.add(e.payer_id);
      for (const s of allSplits) userIdSet.add(s.user_id);
      const allUserIds = Array.from(userIdSet);

      const profileMap: Record<string, string> = {};
      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase.rpc("get_public_profiles", {
          _user_ids: allUserIds,
        });
        for (const p of profiles ?? []) {
          profileMap[p.id] = p.display_name || "Unknown";
        }
      }

      const tripMap = new Map((trips ?? []).map((t) => [t.id, t]));

      const expenseTripMap = new Map<string, string>();
      for (const e of expenses ?? []) {
        expenseTripMap.set(e.id, e.trip_id);
      }

      const tripBalances: TripBalance[] = [];
      let overallNet = 0;

      for (const [tripId, trip] of tripMap) {
        const sc = trip.settlement_currency || "EUR";

        // Cross-calculate from EUR rates to this trip's settlement currency -
        // identical math to what useExpenses does in its ratesQuery.
        const ratesForTrip = crossCalculateRates(eurRates, sc);

        const expensesForTrip = (expenses ?? []).filter((e) => e.trip_id === tripId);
        const splitsForTrip = allSplits.filter(
          (s) => expenseTripMap.get(s.expense_id) === tripId
        );

        const expensesWithSplits = expensesForTrip.map((e: any) => ({
          id: e.id,
          payer_id: e.payer_id,
          amount: Number(e.amount),
          currency: e.currency,
          fx_rate: e.fx_rate != null ? Number(e.fx_rate) : null,
          fx_base: e.fx_base ?? null,
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
          photoUrl: resolvePhoto(
            trip.name,
            stopDestsMap[tripId] ?? [],
            (trip as any).destination_image_url ?? null,
          ),
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

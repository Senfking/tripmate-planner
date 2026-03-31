import { useQuery } from "@tanstack/react-query";
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

// Mirrors the parseRates helper in useExpenses exactly.
function parseRates(raw: unknown): Record<string, number> | null {
  if (!raw) return null;
  let obj: Record<string, unknown>;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return null; }
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else {
    return null;
  }
  return Object.keys(obj).length > 0 ? (obj as Record<string, number>) : null;
}

// Fetches raw EUR-based rates from DB cache with live-API fallback.
// Uses queryKey ["exchange-rates", "EUR"] — the same key useExpenses uses when
// settlementCurrency is "EUR" — so both hooks share a single React Query cache
// entry and can never diverge due to independent fetches.
async function fetchEurRates(): Promise<{
  rates: Record<string, number>;
  fetchedAt: Date | null;
  source: "cache" | "live" | "none";
}> {
  const { data: eurRow } = await supabase
    .from("exchange_rate_cache")
    .select("rates, fetched_at")
    .eq("base_currency", "EUR")
    .maybeSingle();

  const eurRates = parseRates(eurRow?.rates);
  if (eurRates) {
    return {
      rates: eurRates,
      fetchedAt: eurRow?.fetched_at ? new Date(eurRow.fetched_at) : new Date(),
      source: "cache",
    };
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/EUR");
    const json = await res.json();
    if (json.result === "success" && json.rates) {
      return { rates: json.rates as Record<string, number>, fetchedAt: new Date(), source: "live" };
    }
  } catch {
    // ignore
  }

  return { rates: {}, fetchedAt: null, source: "none" };
}

export function useGlobalExpenses() {
  const { user } = useAuth();

  // Shared cache: same queryKey and staleTime as useExpenses uses for EUR trips.
  // When useExpenses populates this entry (or vice versa) both hooks read
  // identical rate data for the lifetime of the 1-hour cache window.
  const ratesQuery = useQuery({
    queryKey: ["exchange-rates", "EUR"],
    queryFn: fetchEurRates,
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });

  // Include the rates timestamp in the key so the global query automatically
  // re-computes whenever the shared rates cache is refreshed.
  const ratesFetchedAt = ratesQuery.data?.fetchedAt?.getTime() ?? 0;
  const eurRates = ratesQuery.data?.rates ?? {};

  return useQuery({
    queryKey: ["global-expenses", user?.id, ratesFetchedAt],
    // Wait for the rates query to settle before computing balances so we never
    // run the calculation with an empty rates object on first render.
    enabled: !!user && !ratesQuery.isLoading,
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

      const [{ data: trips }, { data: expenses }] = await Promise.all([
        supabase
          .from("trips")
          .select("id, name, emoji, settlement_currency")
          .in("id", tripIds),
        supabase
          .from("expenses")
          .select("id, trip_id, payer_id, amount, currency")
          .in("trip_id", tripIds),
      ]);

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

        // Cross-calculate from the shared EUR rates to this trip's settlement
        // currency — identical math to what useExpenses does in its ratesQuery.
        let ratesForTrip = eurRates;
        if (sc !== "EUR" && eurRates[sc]) {
          const cross: Record<string, number> = {};
          for (const [code, rate] of Object.entries(eurRates)) {
            cross[code] = rate / eurRates[sc];
          }
          ratesForTrip = cross;
        }

        const expensesForTrip = (expenses ?? []).filter((e) => e.trip_id === tripId);
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

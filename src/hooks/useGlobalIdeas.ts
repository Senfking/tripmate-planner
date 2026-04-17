import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolvePhoto } from "@/lib/tripPhoto";

export interface TripIdeasSummary {
  tripId: string;
  tripName: string;
  tripEmoji: string | null;
  photoUrl: string;
  suggestedCount: number;
  plannedCount: number;
  totalCount: number;
}

export interface GlobalIdeasResult {
  totalSuggested: number;
  totalPlanned: number;
  trips: TripIdeasSummary[];
}

export function useGlobalIdeas() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["global-ideas", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<GlobalIdeasResult> => {
      const userId = user!.id;

      const { data: memberships } = await supabase
        .from("trip_members")
        .select("trip_id")
        .eq("user_id", userId);

      if (!memberships?.length) {
        return { totalSuggested: 0, totalPlanned: 0, trips: [] };
      }

      const tripIds = memberships.map((m) => m.trip_id);

      const [{ data: trips }, { data: ideas }, { data: routeStops }] = await Promise.all([
        supabase
          .from("trips")
          .select("id, name, emoji")
          .in("id", tripIds),
        (supabase.from("trip_ideas" as any) as any)
          .select("trip_id, status")
          .in("trip_id", tripIds)
          .neq("status", "dismissed"),
        supabase
          .from("trip_route_stops")
          .select("trip_id, destination")
          .in("trip_id", tripIds),
      ]);

      const stopsByTrip = new Map<string, string[]>();
      for (const stop of (routeStops as { trip_id: string; destination: string | null }[] | null) ?? []) {
        if (!stop.destination) continue;
        const list = stopsByTrip.get(stop.trip_id) ?? [];
        list.push(stop.destination);
        stopsByTrip.set(stop.trip_id, list);
      }

      const ideasByTrip = new Map<string, { suggested: number; planned: number }>();
      for (const idea of (ideas as { trip_id: string; status: string }[] | null) ?? []) {
        const bucket = ideasByTrip.get(idea.trip_id) ?? { suggested: 0, planned: 0 };
        if (idea.status === "planned") bucket.planned += 1;
        else bucket.suggested += 1;
        ideasByTrip.set(idea.trip_id, bucket);
      }

      const tripSummaries: TripIdeasSummary[] = (trips ?? [])
        .map((t) => {
          const counts = ideasByTrip.get(t.id) ?? { suggested: 0, planned: 0 };
          const total = counts.suggested + counts.planned;
          return {
            tripId: t.id,
            tripName: t.name,
            tripEmoji: t.emoji,
            photoUrl: resolvePhoto(t.name, stopsByTrip.get(t.id) ?? []),
            suggestedCount: counts.suggested,
            plannedCount: counts.planned,
            totalCount: total,
          };
        })
        .filter((t) => t.totalCount > 0)
        .sort((a, b) => b.totalCount - a.totalCount);

      const totalSuggested = tripSummaries.reduce((s, t) => s + t.suggestedCount, 0);
      const totalPlanned = tripSummaries.reduce((s, t) => s + t.plannedCount, 0);

      return { totalSuggested, totalPlanned, trips: tripSummaries };
    },
  });
}

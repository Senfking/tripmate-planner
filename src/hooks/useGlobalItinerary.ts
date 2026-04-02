import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

export interface ItineraryItemGlobal {
  id: string;
  title: string;
  dayDate: string;
  startTime: string | null;
  endTime: string | null;
  locationText: string | null;
  status: string;
  tripId: string;
  attendance: string | null; // 'in' | 'maybe' | 'out' | null
}

export interface RouteStopPlaceholder {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  tripId: string;
}

export interface TripItineraryGroup {
  tripId: string;
  tripName: string;
  tripEmoji: string | null;
  tripStartDate: string | null;
  tripEndDate: string | null;
  tripDestination: string | null;
  tripCoverImagePath: string | null;
  items: ItineraryItemGlobal[];
  placeholders: RouteStopPlaceholder[];
}

export function useGlobalItinerary() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["global-itinerary", user?.id],
    enabled: !!user,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<TripItineraryGroup[]> => {
      const userId = user!.id;
      const today = format(new Date(), "yyyy-MM-dd");

      const { data: memberships } = await supabase
        .from("trip_members")
        .select("trip_id")
        .eq("user_id", userId);

      if (!memberships?.length) return [];

      const tripIds = memberships.map((m) => m.trip_id);

      const [
        { data: trips },
        { data: items },
        { data: attendance },
        { data: routeStops },
      ] = await Promise.all([
        supabase.from("trips").select("id, name, emoji, tentative_start_date, tentative_end_date, destination, cover_image_path").in("id", tripIds),
        supabase
          .from("itinerary_items")
          .select("id, trip_id, title, day_date, start_time, end_time, location_text, status")
          .in("trip_id", tripIds)
          .gte("day_date", today)
          .order("day_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("itinerary_attendance")
          .select("itinerary_item_id, status")
          .eq("user_id", userId)
          .in("trip_id", tripIds),
        supabase
          .from("trip_route_stops")
          .select("id, trip_id, destination, start_date, end_date")
          .in("trip_id", tripIds)
          .gte("end_date", today)
          .order("start_date", { ascending: true }),
      ]);

      const attendanceMap = new Map<string, string>();
      (attendance ?? []).forEach((a) => attendanceMap.set(a.itinerary_item_id, a.status));

      const tripMap = new Map(
        (trips ?? []).map((t) => [t.id, t])
      );

      // Group items by trip
      const groupMap = new Map<string, TripItineraryGroup>();

      // Initialize groups for all trips that have dates or stops
      for (const trip of trips ?? []) {
        groupMap.set(trip.id, {
          tripId: trip.id,
          tripName: trip.name,
          tripEmoji: trip.emoji,
          tripStartDate: trip.tentative_start_date,
          tripEndDate: trip.tentative_end_date,
          tripDestination: trip.destination,
          tripCoverImagePath: trip.cover_image_path,
          items: [],
          placeholders: [],
        });
      }

      for (const item of items ?? []) {
        const trip = tripMap.get(item.trip_id);
        if (!trip) continue;

        if (!groupMap.has(trip.id)) {
          groupMap.set(trip.id, {
            tripId: trip.id,
            tripName: trip.name,
            tripEmoji: trip.emoji,
            tripStartDate: trip.tentative_start_date,
            tripEndDate: trip.tentative_end_date,
            tripDestination: trip.destination,
            tripCoverImagePath: trip.cover_image_path,
            items: [],
            placeholders: [],
          });
        }

        groupMap.get(trip.id)!.items.push({
          id: item.id,
          title: item.title,
          dayDate: item.day_date,
          startTime: item.start_time,
          endTime: item.end_time,
          locationText: item.location_text,
          status: item.status,
          tripId: item.trip_id,
          attendance: attendanceMap.get(item.id) ?? null,
        });
      }

      // Always add route stops as placeholders
      for (const stop of routeStops ?? []) {
        const trip = tripMap.get(stop.trip_id);
        if (!trip) continue;

        if (!groupMap.has(trip.id)) {
          groupMap.set(trip.id, {
            tripId: trip.id,
            tripName: trip.name,
            tripEmoji: trip.emoji,
            tripStartDate: trip.tentative_start_date,
            tripEndDate: trip.tentative_end_date,
            tripDestination: trip.destination,
            tripCoverImagePath: trip.cover_image_path,
            items: [],
            placeholders: [],
          });
        }

        groupMap.get(trip.id)!.placeholders.push({
          id: stop.id,
          destination: stop.destination,
          startDate: stop.start_date,
          endDate: stop.end_date,
          tripId: stop.trip_id,
        });
      }

      // Sort groups by earliest item date or stop date
      return Array.from(groupMap.values()).sort((a, b) => {
        const aDate = a.items[0]?.dayDate ?? a.placeholders[0]?.startDate ?? a.tripStartDate ?? "9999";
        const bDate = b.items[0]?.dayDate ?? b.placeholders[0]?.startDate ?? b.tripStartDate ?? "9999";
        return aDate.localeCompare(bDate);
      });
    },
  });
}

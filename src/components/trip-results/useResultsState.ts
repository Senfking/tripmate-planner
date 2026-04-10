import { useState, useCallback, useMemo } from "react";
import { useItinerary } from "@/hooks/useItinerary";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface AIActivity {
  id?: string;
  title: string;
  description: string;
  category: string;
  start_time: string;
  duration_minutes: number;
  estimated_cost_per_person: number | null;
  currency: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  booking_url: string | null;
  photo_query: string | null;
  tips: string | null;
  dietary_notes: string | null;
  travel_time_from_previous?: string | null;
  travel_mode_from_previous?: string | null;
}

export interface AIDay {
  date: string;
  day_number: number;
  theme: string;
  activities: AIActivity[];
}

export interface AIDestination {
  name: string;
  start_date: string;
  end_date: string;
  intro: string;
  days: AIDay[];
  accommodation?: {
    name: string;
    stars: number;
    price_per_night: number;
    currency: string;
    booking_url?: string;
  };
  transport_to_next?: {
    mode: string;
    duration: string;
    from: string;
    to: string;
  };
}

export interface AITripResult {
  trip_title: string;
  trip_summary: string;
  destinations: AIDestination[];
  map_center: { lat: number; lng: number };
  map_zoom: number;
  daily_budget_estimate: number;
  currency: string;
  packing_suggestions: string[];
  total_activities: number;
  origin_city?: string;
}

function activityKey(dayDate: string, title: string) {
  return `${dayDate}::${title}`;
}

export function useResultsState(tripId: string) {
  const { addItem, batchAddItems } = useItinerary(tripId);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [activeDayIndex, setActiveDayIndex] = useState<number>(-1);
  const [mapMode, setMapMode] = useState<"overview" | "day">("overview");
  const [alternativesFor, setAlternativesFor] = useState<{
    dayDate: string;
    activityIndex: number;
    activity: AIActivity;
  } | null>(null);
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);
  const [alternatives, setAlternatives] = useState<AIActivity[]>([]);

  const isAdded = useCallback(
    (dayDate: string, title: string) => addedIds.has(activityKey(dayDate, title)),
    [addedIds]
  );

  const addedCount = addedIds.size;

  function computeEndTime(startTime: string, durationMin: number): string {
    const [h, m] = startTime.split(":").map(Number);
    const totalMin = h * 60 + m + durationMin;
    const eh = Math.floor(totalMin / 60) % 24;
    const em = totalMin % 60;
    return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
  }

  const toggleActivity = useCallback(
    async (day: AIDay, activity: AIActivity) => {
      const key = activityKey(day.date, activity.title);
      if (addedIds.has(key)) {
        setAddedIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return;
      }

      try {
        await addItem.mutateAsync({
          day_date: day.date,
          title: activity.title,
          start_time: activity.start_time || null,
          end_time: activity.start_time
            ? computeEndTime(activity.start_time, activity.duration_minutes || 60)
            : null,
          location_text: activity.location_name || null,
          notes: [
            activity.description,
            activity.tips ? `\n💡 Tip: ${activity.tips}` : "",
            activity.estimated_cost_per_person
              ? `\n💰 ~${activity.currency || "€"}${activity.estimated_cost_per_person}/person`
              : "",
            activity.dietary_notes ? `\n🥬 ${activity.dietary_notes}` : "",
          ]
            .filter(Boolean)
            .join(""),
          status: "planned",
        });

        setAddedIds((prev) => new Set(prev).add(key));
      } catch {
        toast.error("Failed to add activity");
      }
    },
    [addedIds, addItem]
  );

  const addAllActivities = useCallback(
    async (result: AITripResult) => {
      const batch: Parameters<typeof batchAddItems.mutateAsync>[0] = [];

      for (const dest of result.destinations) {
        for (const day of dest.days) {
          for (const act of day.activities) {
            const key = activityKey(day.date, act.title);
            if (addedIds.has(key)) continue;

            batch.push({
              day_date: day.date,
              title: act.title,
              start_time: act.start_time || null,
              end_time: act.start_time
                ? computeEndTime(act.start_time, act.duration_minutes || 60)
                : null,
              location_text: act.location_name || null,
              notes: [
                act.description,
                act.tips ? `\n💡 Tip: ${act.tips}` : "",
                act.estimated_cost_per_person
                  ? `\n💰 ~${act.currency || "€"}${act.estimated_cost_per_person}/person`
                  : "",
                act.dietary_notes ? `\n🥬 ${act.dietary_notes}` : "",
              ]
                .filter(Boolean)
                .join(""),
              status: "planned",
            });
          }
        }
      }

      if (batch.length === 0) {
        toast.info("All activities already added!");
        return;
      }

      try {
        await batchAddItems.mutateAsync(batch);
        const allKeys = new Set(addedIds);
        for (const dest of result.destinations) {
          for (const day of dest.days) {
            for (const act of day.activities) {
              allKeys.add(activityKey(day.date, act.title));
            }
          }
        }
        setAddedIds(allKeys);
        toast.success(`Added ${batch.length} activities to your itinerary! 🎉`);
      } catch {
        toast.error("Failed to add activities");
      }
    },
    [addedIds, batchAddItems]
  );

  const requestAlternatives = useCallback(
    async (dayDate: string, activityIndex: number, activity: AIActivity, tripId: string) => {
      setAlternativesFor({ dayDate, activityIndex, activity });
      setLoadingAlternatives(true);
      setAlternatives([]);

      try {
        const { data, error } = await supabase.functions.invoke("generate-trip-itinerary", {
          body: {
            trip_id: tripId,
            notes: `Suggest 3 alternative activities to replace "${activity.title}" at ${activity.start_time} in ${activity.location_name}. Same category (${activity.category}), same time slot. Return only the alternatives array.`,
            alternatives_mode: true,
          },
        });

        if (error) throw error;
        setAlternatives(data?.alternatives || []);
      } catch {
        toast.error("Failed to get alternatives");
        setAlternativesFor(null);
      } finally {
        setLoadingAlternatives(false);
      }
    },
    []
  );

  return {
    addedIds,
    addedCount,
    isAdded,
    toggleActivity,
    addAllActivities,
    activeDayIndex,
    setActiveDayIndex,
    mapMode,
    setMapMode,
    alternativesFor,
    setAlternativesFor,
    loadingAlternatives,
    alternatives,
    requestAlternatives,
    isAddingAll: batchAddItems.isPending,
  };
}

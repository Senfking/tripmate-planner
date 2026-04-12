import { useState, useCallback, useMemo } from "react";
import { useItinerary } from "@/hooks/useItinerary";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CostProfile } from "@/lib/calibrateCost";

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
  cost_profile?: CostProfile;
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
  const [replacedActivities, setReplacedActivities] = useState<Map<string, AIActivity>>(new Map());

  // Local mutations for optimistic edits
  const [removedActivities, setRemovedActivities] = useState<Set<string>>(new Set());
  const [addedActivities, setAddedActivities] = useState<Map<string, AIActivity[]>>(new Map());

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

  const removeActivity = useCallback(
    (dayDate: string, index: number, activity: AIActivity) => {
      const key = `${dayDate}::${index}::${activity.title}`;
      setRemovedActivities((prev) => new Set(prev).add(key));

      const toastId = toast("Activity removed", {
        action: {
          label: "Undo",
          onClick: () => {
            setRemovedActivities((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          },
        },
        duration: 5000,
      });
    },
    []
  );

  const isActivityRemoved = useCallback(
    (dayDate: string, index: number, title: string) =>
      removedActivities.has(`${dayDate}::${index}::${title}`),
    [removedActivities]
  );

  const addLocalActivity = useCallback(
    (dayDate: string, activity: AIActivity) => {
      setAddedActivities((prev) => {
        const next = new Map(prev);
        const existing = next.get(dayDate) || [];
        next.set(dayDate, [...existing, activity]);
        return next;
      });
      toast.success(`Added "${activity.title}"`);
    },
    []
  );

  const getLocalAdditions = useCallback(
    (dayDate: string): AIActivity[] => addedActivities.get(dayDate) || [],
    [addedActivities]
  );

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
            activity.tips ? `\nTip: ${activity.tips}` : "",
            activity.estimated_cost_per_person
              ? `\n~${activity.currency || "€"}${activity.estimated_cost_per_person}/person`
              : "",
            activity.dietary_notes ? `\nDietary: ${activity.dietary_notes}` : "",
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
                act.tips ? `\nTip: ${act.tips}` : "",
                act.estimated_cost_per_person
                  ? `\n~${act.currency || "€"}${act.estimated_cost_per_person}/person`
                  : "",
                act.dietary_notes ? `\nDietary: ${act.dietary_notes}` : "",
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

  const replaceActivity = useCallback(
    (dayDate: string, activityIndex: number, newActivity: AIActivity) => {
      const key = `${dayDate}::${activityIndex}`;
      setReplacedActivities((prev) => {
        const next = new Map(prev);
        next.set(key, newActivity);
        return next;
      });
      toast.success(`Swapped to "${newActivity.title}"`);
    },
    []
  );

  const getReplacedActivity = useCallback(
    (dayDate: string, activityIndex: number): AIActivity | null => {
      return replacedActivities.get(`${dayDate}::${activityIndex}`) || null;
    },
    [replacedActivities]
  );

  const requestAlternatives = useCallback(
    async (dayDate: string, activityIndex: number, activity: AIActivity, tripId: string, userDescription?: string) => {
      setAlternativesFor({ dayDate, activityIndex, activity });
      setLoadingAlternatives(true);
      setAlternatives([]);

      try {
        const notesPrompt = userDescription
          ? `The user wants to replace "${activity.title}" with something matching this description: "${userDescription}". Suggest 3 alternatives that match. Same time slot (${activity.start_time}), same location area (${activity.location_name}).`
          : `Suggest 3 alternative activities to replace "${activity.title}" at ${activity.start_time} in ${activity.location_name}. Same category (${activity.category}), same time slot. Return only the alternatives array.`;

        const { data, error } = await supabase.functions.invoke("generate-trip-itinerary", {
          body: {
            trip_id: tripId,
            notes: notesPrompt,
            alternatives_mode: true,
            ...(userDescription ? { user_description: userDescription } : {}),
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

  const requestCustomPlaceSwap = useCallback(
    async (dayDate: string, activityIndex: number, placeName: string, destination: string) => {
      try {
        const { data, error } = await supabase.functions.invoke("get-place-details", {
          body: { query: `${placeName} ${destination}` },
        });
        if (error) throw error;
        if (!data || (!data.rating && !data.address && (!data.photos || data.photos.length === 0))) {
          toast.error("Place not found, try a more specific name");
          return null;
        }
        const newActivity: AIActivity = {
          title: placeName,
          description: data.address || "",
          category: "experience",
          start_time: "",
          duration_minutes: 60,
          estimated_cost_per_person: null,
          currency: "USD",
          location_name: destination,
          latitude: data.latitude || null,
          longitude: data.longitude || null,
          google_maps_url: data.googleMapsUrl || null,
          booking_url: null,
          photo_query: null,
          tips: null,
          dietary_notes: null,
        };
        replaceActivity(dayDate, activityIndex, newActivity);
        return newActivity;
      } catch {
        toast.error("Failed to find place. Try a more specific name.");
        return null;
      }
    },
    [replaceActivity]
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
    requestCustomPlaceSwap,
    replaceActivity,
    getReplacedActivity,
    isAddingAll: batchAddItems.isPending,
    // Local edits
    removeActivity,
    isActivityRemoved,
    addLocalActivity,
    getLocalAdditions,
  };
}

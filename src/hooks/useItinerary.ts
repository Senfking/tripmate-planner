import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { friendlyErrorMessage } from "@/lib/supabaseErrors";

export interface ItineraryItem {
  id: string;
  trip_id: string;
  day_date: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  location_text: string | null;
  notes: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export function useItinerary(tripId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["itinerary", tripId];

  const { data: items = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itinerary_items")
        .select("*")
        .eq("trip_id", tripId)
        .order("day_date")
        .order("sort_order")
        .limit(500);
      if (error) throw error;
      return data as ItineraryItem[];
    },
    enabled: !!tripId && !!user,
  });

  const addItem = useMutation({
    mutationFn: async (item: {
      day_date: string;
      title: string;
      start_time?: string | null;
      end_time?: string | null;
      location_text?: string | null;
      notes?: string | null;
      status?: string;
    }) => {
      // Get max sort_order for this day
      const dayItems = items.filter((i) => i.day_date === item.day_date);
      const maxSort = dayItems.length > 0 ? Math.max(...dayItems.map((i) => i.sort_order)) : -1;

      const { error } = await supabase.from("itinerary_items").insert({
        trip_id: tripId,
        day_date: item.day_date,
        title: item.title,
        start_time: item.start_time || null,
        end_time: item.end_time || null,
        location_text: item.location_text || null,
        notes: item.notes || null,
        status: item.status || "idea",
        sort_order: maxSort + 1,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: (_data, item) => {
      trackEvent("itinerary_item_created", { trip_id: tripId, status: item.status || "idea" }, user?.id);
      qc.invalidateQueries({ queryKey: key });
      toast.success("Activity added");
    },
    onError: (e: any) => toast.error(friendlyErrorMessage(e, "Failed to add activity")),
  });

  const updateItem = useMutation({
    mutationFn: async (item: {
      id: string;
      title: string;
      start_time?: string | null;
      end_time?: string | null;
      location_text?: string | null;
      notes?: string | null;
      status?: string;
    }) => {
      const { error } = await supabase
        .from("itinerary_items")
        .update({
          title: item.title,
          start_time: item.start_time || null,
          end_time: item.end_time || null,
          location_text: item.location_text || null,
          notes: item.notes || null,
          status: item.status || "idea",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: (_data, item) => {
      trackEvent("itinerary_item_updated", { trip_id: tripId, item_id: item.id, status: item.status || "idea" }, user?.id);
      qc.invalidateQueries({ queryKey: key });
      toast.success("Activity updated");
    },
    onError: (e: any) => toast.error(friendlyErrorMessage(e, "Failed to update activity")),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("itinerary_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      trackEvent("itinerary_item_deleted", { trip_id: tripId, item_id: id }, user?.id);
      qc.invalidateQueries({ queryKey: key });
      toast.success("Activity deleted");
    },
    onError: (e: any) => toast.error(friendlyErrorMessage(e, "Failed to delete activity")),
  });

  const batchAddItems = useMutation({
    mutationFn: async (
      batch: {
        day_date: string;
        title: string;
        start_time?: string | null;
        end_time?: string | null;
        location_text?: string | null;
        notes?: string | null;
        status?: string;
      }[]
    ) => {
      // Pre-compute sort_order per day
      const maxByDay: Record<string, number> = {};
      for (const item of items) {
        maxByDay[item.day_date] = Math.max(maxByDay[item.day_date] ?? -1, item.sort_order);
      }

      const rows = batch.map((item) => {
        const current = (maxByDay[item.day_date] ?? -1) + 1;
        maxByDay[item.day_date] = current;
        return {
          trip_id: tripId,
          day_date: item.day_date,
          title: item.title,
          start_time: item.start_time || null,
          end_time: item.end_time || null,
          location_text: item.location_text || null,
          notes: item.notes || null,
          status: item.status || "idea",
          sort_order: current,
          created_by: user!.id,
        };
      });

      const { error } = await supabase.from("itinerary_items").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(friendlyErrorMessage(e, "Failed to add activities")),
  });

  const reorderItems = useMutation({
    mutationFn: async (reordered: { id: string; sort_order: number }[]) => {
      const promises = reordered.map((r) =>
        supabase.from("itinerary_items").update({ sort_order: r.sort_order }).eq("id", r.id)
      );
      const results = await Promise.all(promises);
      const err = results.find((r) => r.error);
      if (err?.error) throw err.error;
    },
    onMutate: async (reordered) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ItineraryItem[]>(key);
      qc.setQueryData<ItineraryItem[]>(key, (old) => {
        if (!old) return old;
        const updated = old.map((item) => {
          const match = reordered.find((r) => r.id === item.id);
          return match ? { ...item, sort_order: match.sort_order } : item;
        });
        return updated;
      });
      return { previous };
    },
    onError: (e: any, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
      toast.error(friendlyErrorMessage(e, "Failed to reorder activities"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { items, isLoading, addItem, batchAddItems, updateItem, deleteItem, reorderItems };
}

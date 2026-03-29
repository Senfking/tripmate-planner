import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
        .order("sort_order");
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Activity added");
    },
    onError: (e: any) => toast.error(e.message),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Activity updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("itinerary_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Activity deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reorderItems = useMutation({
    mutationFn: async (reordered: { id: string; sort_order: number }[]) => {
      // Batch update sort orders
      const promises = reordered.map((r) =>
        supabase.from("itinerary_items").update({ sort_order: r.sort_order }).eq("id", r.id)
      );
      const results = await Promise.all(promises);
      const err = results.find((r) => r.error);
      if (err?.error) throw err.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e.message),
  });

  return { items, isLoading, addItem, updateItem, deleteItem, reorderItems };
}

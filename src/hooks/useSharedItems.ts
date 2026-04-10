import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

const KEY = (tripId: string) => ["shared-items", tripId];

export function useSharedItems(tripId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: KEY(tripId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shared_items")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`shared-items-${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shared_items", filter: `trip_id=eq.${tripId}` }, () => {
        qc.invalidateQueries({ queryKey: KEY(tripId) });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tripId, qc]);

  const addItem = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase
        .from("shared_items")
        .insert({ trip_id: tripId, title, created_by: user!.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(tripId) }),
  });

  const claimItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("shared_items")
        .update({ claimed_by: user!.id })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(tripId) }),
  });

  const unclaimItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("shared_items")
        .update({ claimed_by: null })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(tripId) }),
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("shared_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(tripId) }),
  });

  return { items, isLoading, addItem, claimItem, unclaimItem, deleteItem };
}

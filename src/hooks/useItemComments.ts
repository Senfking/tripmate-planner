import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface ItemComment {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
  display_name: string | null;
}

export function useItemComments(tripId: string, itemId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["item-comments", itemId];

  const { data: comments = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, body, user_id, created_at")
        .eq("itinerary_item_id", itemId)
        .eq("trip_id", tripId)
        .order("created_at");
      if (error) throw error;
      if (!data || data.length === 0) return [] as ItemComment[];

      // Fetch display names for unique user ids
      const userIds = [...new Set(data.map((c) => c.user_id))];
      const { data: profiles } = await supabase
        .rpc("get_public_profiles", { _user_ids: userIds });
      const nameMap = new Map(
        (profiles || []).map((p) => [p.id, p.display_name])
      );

      return data.map((c) => ({
        id: c.id,
        body: c.body,
        user_id: c.user_id,
        created_at: c.created_at,
        display_name: nameMap.get(c.user_id) || null,
      })) as ItemComment[];
    },
    enabled: !!itemId && !!tripId && !!user,
  });

  const postComment = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from("comments").insert({
        trip_id: tripId,
        itinerary_item_id: itemId,
        user_id: user!.id,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from("comments").delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Comment deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { comments, isLoading, postComment, deleteComment };
}

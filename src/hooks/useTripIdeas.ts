import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TripIdea {
  id: string;
  trip_id: string;
  created_by: string;
  title: string;
  category: string | null;
  status: string;
  created_at: string;
  voteCount: number;
  hasVoted: boolean;
  author?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

const ideasKey = (tripId: string) => ["trip-ideas", tripId];

export function useTripIdeas(tripId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ideasKey(tripId ?? ""),
    enabled: !!tripId && !!user,
    staleTime: 15_000,
    queryFn: async (): Promise<TripIdea[]> => {
      const { data: ideas, error } = await (supabase.from("trip_ideas" as any) as any)
        .select("id, trip_id, created_by, title, category, status, created_at")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (ideas ?? []) as Omit<TripIdea, "voteCount" | "hasVoted" | "author">[];
      if (list.length === 0) return [];

      const ids = list.map((i) => i.id);
      const authorIds = Array.from(new Set(list.map((i) => i.created_by)));

      const [{ data: votes }, { data: profiles }] = await Promise.all([
        (supabase.from("trip_idea_votes" as any) as any)
          .select("idea_id, user_id")
          .in("idea_id", ids),
        supabase.from("profiles").select("id, display_name, avatar_url").in("id", authorIds),
      ]);

      const voteMap = new Map<string, { count: number; mine: boolean }>();
      for (const v of (votes as { idea_id: string; user_id: string }[] | null) ?? []) {
        const cur = voteMap.get(v.idea_id) ?? { count: 0, mine: false };
        cur.count += 1;
        if (v.user_id === user?.id) cur.mine = true;
        voteMap.set(v.idea_id, cur);
      }
      const profileMap = new Map(
        ((profiles ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]).map(
          (p) => [p.id, p],
        ),
      );

      return list.map((i) => ({
        ...i,
        voteCount: voteMap.get(i.id)?.count ?? 0,
        hasVoted: voteMap.get(i.id)?.mine ?? false,
        author: profileMap.get(i.created_by) ?? null,
      }));
    },
  });

  // Realtime
  useEffect(() => {
    if (!tripId) return;
    const ch = supabase
      .channel(`trip-ideas-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_ideas", filter: `trip_id=eq.${tripId}` },
        () => qc.invalidateQueries({ queryKey: ideasKey(tripId) }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trip_idea_votes" },
        () => qc.invalidateQueries({ queryKey: ideasKey(tripId) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tripId, qc]);

  const addIdea = useMutation({
    mutationFn: async ({ title, category }: { title: string; category?: string | null }) => {
      if (!tripId || !user) throw new Error("Missing trip or user");
      const { data, error } = await (supabase.from("trip_ideas" as any) as any)
        .insert({ trip_id: tripId, created_by: user.id, title: title.trim(), category: category ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      if (tripId) qc.invalidateQueries({ queryKey: ideasKey(tripId) });
    },
  });

  const toggleVote = useMutation({
    mutationFn: async ({ ideaId, hasVoted }: { ideaId: string; hasVoted: boolean }) => {
      if (!user) throw new Error("Not signed in");
      if (hasVoted) {
        const { error } = await (supabase.from("trip_idea_votes" as any) as any)
          .delete()
          .eq("idea_id", ideaId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("trip_idea_votes" as any) as any)
          .insert({ idea_id: ideaId, user_id: user.id });
        if (error) throw error;
      }
    },
    onMutate: async ({ ideaId, hasVoted }) => {
      if (!tripId) return;
      await qc.cancelQueries({ queryKey: ideasKey(tripId) });
      const prev = qc.getQueryData<TripIdea[]>(ideasKey(tripId));
      qc.setQueryData<TripIdea[]>(ideasKey(tripId), (old) =>
        (old ?? []).map((i) =>
          i.id === ideaId
            ? { ...i, hasVoted: !hasVoted, voteCount: i.voteCount + (hasVoted ? -1 : 1) }
            : i,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (tripId && ctx?.prev) qc.setQueryData(ideasKey(tripId), ctx.prev);
    },
    onSettled: () => {
      if (tripId) qc.invalidateQueries({ queryKey: ideasKey(tripId) });
    },
  });

  const deleteIdea = useMutation({
    mutationFn: async (ideaId: string) => {
      const { error } = await (supabase.from("trip_ideas" as any) as any).delete().eq("id", ideaId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (tripId) qc.invalidateQueries({ queryKey: ideasKey(tripId) });
    },
  });

  return { ...query, addIdea, toggleVote, deleteIdea };
}

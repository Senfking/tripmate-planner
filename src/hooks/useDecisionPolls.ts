import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PollWithOptions = {
  id: string;
  trip_id: string;
  type: string;
  title: string;
  status: string;
  multi_select: boolean;
  options: {
    id: string;
    label: string;
    start_date: string | null;
    end_date: string | null;
    sort_order: number;
  }[];
};

export type VoteTally = Record<string, Record<string, number>>; // { optionId: { value: count } }

export function useDecisionPolls(tripId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const polls = useQuery({
    queryKey: ["decision-polls", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("polls")
        .select("*, poll_options(*)")
        .eq("trip_id", tripId!)
        .eq("type", "preference")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        options: (p.poll_options || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
      })) as PollWithOptions[];
    },
    enabled: !!tripId && !!user,
  });

  // Fetch vote counts for all polls in this trip at once
  const voteCounts = useQuery({
    queryKey: ["poll-vote-counts", tripId],
    queryFn: async () => {
      const pollList = polls.data || [];
      if (pollList.length === 0) return {} as Record<string, VoteTally>;

      const results: Record<string, VoteTally> = {};
      // Batch all RPCs in parallel
      const rpcs = pollList.map(async (p) => {
        const { data, error } = await supabase.rpc("get_poll_vote_counts", { _poll_id: p.id });
        if (error) throw error;
        const tally: VoteTally = {};
        for (const row of (data as any[]) || []) {
          if (!tally[row.poll_option_id]) tally[row.poll_option_id] = {};
          tally[row.poll_option_id][row.value] = Number(row.count);
        }
        results[p.id] = tally;
      });
      await Promise.all(rpcs);
      return results;
    },
    enabled: !!tripId && !!user && (polls.data || []).length > 0,
  });

  // My votes across all decision polls
  const myVotes = useQuery({
    queryKey: ["my-poll-votes", tripId, user?.id],
    queryFn: async () => {
      const pollList = polls.data || [];
      const optionIds = pollList.flatMap((p) => p.options.map((o) => o.id));
      if (optionIds.length === 0) return {} as Record<string, string>;

      const { data, error } = await supabase
        .from("votes")
        .select("poll_option_id, value")
        .eq("user_id", user!.id)
        .in("poll_option_id", optionIds);
      if (error) throw error;

      const map: Record<string, string> = {};
      for (const v of data || []) {
        map[v.poll_option_id] = v.value;
      }
      return map;
    },
    enabled: !!tripId && !!user && (polls.data || []).length > 0,
  });

  const createPoll = useMutation({
    mutationFn: async (input: { type: string; title: string; options?: string[] }) => {
      const { data, error } = await supabase
        .from("polls")
        .insert({
          trip_id: tripId!,
          type: input.type,
          title: input.title,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Insert initial options if provided
      if (input.options && input.options.length > 0) {
        const optionRows = input.options.map((label, i) => ({
          poll_id: data.id,
          label,
          sort_order: i,
        }));
        const { error: optErr } = await supabase
          .from("poll_options")
          .insert(optionRows);
        if (optErr) throw optErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decision-polls", tripId] });
    },
  });

  const deleteOption = useMutation({
    mutationFn: async (optionId: string) => {
      await supabase.from("votes").delete().eq("poll_option_id", optionId);
      const { error } = await supabase.from("poll_options").delete().eq("id", optionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decision-polls", tripId] });
      qc.invalidateQueries({ queryKey: ["poll-vote-counts", tripId] });
      qc.invalidateQueries({ queryKey: ["my-poll-votes", tripId, user?.id] });
    },
  });

  const addOption = useMutation({
    mutationFn: async (input: {
      pollId: string;
      label: string;
      startDate?: string;
      endDate?: string;
    }) => {
      // Get current max sort_order
      const { data: existing } = await supabase
        .from("poll_options")
        .select("sort_order")
        .eq("poll_id", input.pollId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = ((existing?.[0]?.sort_order ?? -1) + 1);

      const { error } = await supabase.from("poll_options").insert({
        poll_id: input.pollId,
        label: input.label,
        start_date: input.startDate || null,
        end_date: input.endDate || null,
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decision-polls", tripId] });
    },
  });

  const vote = useMutation({
    mutationFn: async ({ optionId, value }: { optionId: string; value: string }) => {
      // Check if vote exists
      const { data: existing } = await supabase
        .from("votes")
        .select("id, value")
        .eq("poll_option_id", optionId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (existing) {
        if (existing.value === value) {
          // Same value → unselect (delete)
          const { error } = await supabase
            .from("votes")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("votes")
            .update({ value })
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from("votes").insert({
          poll_option_id: optionId,
          user_id: user!.id,
          value,
        });
        if (error) throw error;
      }
    },
    onMutate: async ({ optionId, value }) => {
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: ["my-poll-votes", tripId, user?.id] });
      await qc.cancelQueries({ queryKey: ["poll-vote-counts", tripId] });

      // Snapshot previous values
      const prevMyVotes = qc.getQueryData<Record<string, string>>(["my-poll-votes", tripId, user?.id]);
      const prevCounts = qc.getQueryData<Record<string, VoteTally>>(["poll-vote-counts", tripId]);

      // Optimistically update myVotes
      qc.setQueryData<Record<string, string>>(["my-poll-votes", tripId, user?.id], (old) => {
        const next = { ...(old || {}) };
        if (next[optionId] === value) {
          delete next[optionId]; // toggle off
        } else {
          next[optionId] = value;
        }
        return next;
      });

      return { prevMyVotes, prevCounts };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.prevMyVotes !== undefined) {
        qc.setQueryData(["my-poll-votes", tripId, user?.id], context.prevMyVotes);
      }
      if (context?.prevCounts !== undefined) {
        qc.setQueryData(["poll-vote-counts", tripId], context.prevCounts);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["poll-vote-counts", tripId] });
      qc.invalidateQueries({ queryKey: ["my-poll-votes", tripId, user?.id] });
    },
  });

  const lockPoll = useMutation({
    mutationFn: async (pollId: string) => {
      const { error } = await supabase
        .from("polls")
        .update({ status: "locked" })
        .eq("id", pollId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decision-polls", tripId] });
    },
  });

  const deletePoll = useMutation({
    mutationFn: async (pollId: string) => {
      // Get option IDs to delete votes
      const { data: opts } = await supabase
        .from("poll_options")
        .select("id")
        .eq("poll_id", pollId);
      const optIds = (opts || []).map((o) => o.id);
      if (optIds.length > 0) {
        await supabase.from("votes").delete().in("poll_option_id", optIds);
      }
      await supabase.from("poll_options").delete().eq("poll_id", pollId);
      const { error } = await supabase.from("polls").delete().eq("id", pollId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decision-polls", tripId] });
      qc.invalidateQueries({ queryKey: ["poll-vote-counts", tripId] });
      qc.invalidateQueries({ queryKey: ["my-poll-votes", tripId, user?.id] });
    },
  });

  const updatePollTitle = useMutation({
    mutationFn: async ({ pollId, title }: { pollId: string; title: string }) => {
      const { error } = await supabase
        .from("polls")
        .update({ title })
        .eq("id", pollId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decision-polls", tripId] });
    },
  });

  const prefPolls = (polls.data || []).filter((p) => p.type === "preference");

  return {
    polls: polls.data || [],
    prefPolls,
    voteCounts: voteCounts.data || {},
    myVotes: myVotes.data || ({} as Record<string, string>),
    isLoading: polls.isLoading,
    createPoll,
    addOption,
    deleteOption,
    vote,
    lockPoll,
    deletePoll,
    updatePollTitle,
  };
}

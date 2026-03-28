import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type Proposal = {
  id: string;
  trip_id: string;
  created_by: string;
  destination: string;
  start_date: string;
  end_date: string;
  note: string | null;
  adopted: boolean;
  created_at: string;
  creator_name?: string;
};

export type ReactionMap = Record<string, { in: number; maybe: number; no: number }>;

function indexByProposal(rows: { proposal_id: string; value: string; count: number }[] | null): ReactionMap {
  const map: ReactionMap = {};
  for (const r of rows || []) {
    if (!map[r.proposal_id]) map[r.proposal_id] = { in: 0, maybe: 0, no: 0 };
    map[r.proposal_id][r.value as "in" | "maybe" | "no"] = Number(r.count);
  }
  return map;
}

export function useProposals(tripId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const proposals = useQuery({
    queryKey: ["trip-proposals", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_proposals")
        .select("*")
        .eq("trip_id", tripId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch creator display names
      const userIds = [...new Set((data || []).map((p: any) => p.created_by))];
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);
        for (const p of profiles || []) {
          profileMap[p.id] = p.display_name || "Someone";
        }
      }

      return (data || []).map((p: any) => ({
        ...p,
        creator_name: profileMap[p.created_by] || "Someone",
      })) as Proposal[];
    },
    enabled: !!tripId && !!user,
  });

  const reactionCounts = useQuery({
    queryKey: ["proposal-reactions", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_trip_proposal_reaction_counts", {
        _trip_id: tripId!,
      });
      if (error) throw error;
      return indexByProposal(data as any);
    },
    enabled: !!tripId && !!user,
  });

  const myReactions = useQuery({
    queryKey: ["my-proposal-reactions", tripId, user?.id],
    queryFn: async () => {
      // Get all my reactions for proposals in this trip
      const { data: props } = await supabase
        .from("trip_proposals")
        .select("id")
        .eq("trip_id", tripId!);
      const propIds = (props || []).map((p: any) => p.id);
      if (propIds.length === 0) return {} as Record<string, string>;

      const { data, error } = await supabase
        .from("proposal_reactions")
        .select("proposal_id, value")
        .eq("user_id", user!.id)
        .in("proposal_id", propIds);
      if (error) throw error;

      const map: Record<string, string> = {};
      for (const r of data || []) {
        map[r.proposal_id] = r.value;
      }
      return map;
    },
    enabled: !!tripId && !!user,
  });

  const createProposal = useMutation({
    mutationFn: async (input: { destination: string; start_date: string; end_date: string; note?: string }) => {
      const { error } = await supabase.from("trip_proposals").insert({
        trip_id: tripId!,
        created_by: user!.id,
        ...input,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip-proposals", tripId] });
    },
  });

  const react = useMutation({
    mutationFn: async ({ proposalId, value }: { proposalId: string; value: string }) => {
      // Upsert reaction
      const { data: existing } = await supabase
        .from("proposal_reactions")
        .select("id")
        .eq("proposal_id", proposalId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("proposal_reactions")
          .update({ value } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("proposal_reactions").insert({
          proposal_id: proposalId,
          user_id: user!.id,
          value,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal-reactions", tripId] });
      qc.invalidateQueries({ queryKey: ["my-proposal-reactions", tripId, user?.id] });
    },
  });

  const adoptProposal = useMutation({
    mutationFn: async (proposal: Proposal) => {
      // Mark proposal as adopted
      const { error: upErr } = await supabase
        .from("trip_proposals")
        .update({ adopted: true } as any)
        .eq("id", proposal.id);
      if (upErr) throw upErr;

      // Create locked destination poll
      const { data: destPoll, error: dpErr } = await supabase
        .from("polls")
        .insert({
          trip_id: tripId!,
          type: "destination",
          title: "Where are we going?",
          status: "locked",
        })
        .select("id")
        .single();
      if (dpErr) throw dpErr;

      await supabase.from("poll_options").insert({
        poll_id: destPoll.id,
        label: proposal.destination,
        sort_order: 0,
      });

      // Create locked date poll
      const { data: datePoll, error: dtErr } = await supabase
        .from("polls")
        .insert({
          trip_id: tripId!,
          type: "date",
          title: "When are we going?",
          status: "locked",
        })
        .select("id")
        .single();
      if (dtErr) throw dtErr;

      await supabase.from("poll_options").insert({
        poll_id: datePoll.id,
        label: `${proposal.start_date} → ${proposal.end_date}`,
        start_date: proposal.start_date,
        end_date: proposal.end_date,
        sort_order: 0,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip-proposals", tripId] });
      qc.invalidateQueries({ queryKey: ["decision-polls", tripId] });
    },
  });

  return {
    proposals: proposals.data || [],
    reactionCounts: reactionCounts.data || ({} as ReactionMap),
    myReactions: myReactions.data || ({} as Record<string, string>),
    isLoading: proposals.isLoading,
    createProposal,
    react,
    adoptProposal,
  };
}

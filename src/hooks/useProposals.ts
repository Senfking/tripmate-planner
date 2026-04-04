import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";

export type Proposal = {
  id: string;
  trip_id: string;
  created_by: string;
  destination: string;
  note: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  creator_name?: string;
};

export type DateOption = {
  id: string;
  proposal_id: string;
  start_date: string;
  end_date: string;
  created_by: string;
  created_at: string;
};

export type DestVotes = Record<string, { up: number; down: number }>;
export type DateVotes = Record<string, { yes: number; maybe: number; no: number }>;

export function useProposals(tripId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["trip-proposals", tripId] });
    qc.invalidateQueries({ queryKey: ["proposal-reactions", tripId] });
    qc.invalidateQueries({ queryKey: ["my-proposal-reactions", tripId] });
    qc.invalidateQueries({ queryKey: ["date-options", tripId] });
    qc.invalidateQueries({ queryKey: ["date-option-votes", tripId] });
    qc.invalidateQueries({ queryKey: ["my-date-option-votes", tripId] });
  };

  // ─── Proposals ───
  const proposals = useQuery({
    queryKey: ["trip-proposals", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_proposals")
        .select("*")
        .eq("trip_id", tripId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const userIds = [...new Set((data || []).map((p: any) => p.created_by))];
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .rpc("get_public_profiles", { _user_ids: userIds });
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

  // ─── Destination vote counts ───
  const destVoteCounts = useQuery({
    queryKey: ["proposal-reactions", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_trip_proposal_reaction_counts", {
        _trip_id: tripId!,
      });
      if (error) throw error;
      const map: DestVotes = {};
      for (const r of (data as any[]) || []) {
        if (!map[r.proposal_id]) map[r.proposal_id] = { up: 0, down: 0 };
        if (r.value === "up") map[r.proposal_id].up = Number(r.count);
        if (r.value === "down") map[r.proposal_id].down = Number(r.count);
      }
      return map;
    },
    enabled: !!tripId && !!user,
  });

  // ─── My destination votes ───
  const myDestVotes = useQuery({
    queryKey: ["my-proposal-reactions", tripId, user?.id],
    queryFn: async () => {
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
      for (const r of data || []) map[r.proposal_id] = r.value;
      return map;
    },
    enabled: !!tripId && !!user,
  });

  // ─── Date options ───
  const dateOptions = useQuery({
    queryKey: ["date-options", tripId],
    queryFn: async () => {
      const { data: props } = await supabase
        .from("trip_proposals")
        .select("id")
        .eq("trip_id", tripId!);
      const propIds = (props || []).map((p: any) => p.id);
      if (propIds.length === 0) return [] as DateOption[];

      const { data, error } = await supabase
        .from("proposal_date_options")
        .select("*")
        .in("proposal_id", propIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as DateOption[];
    },
    enabled: !!tripId && !!user,
  });

  // ─── Date option vote counts ───
  const dateVoteCounts = useQuery({
    queryKey: ["date-option-votes", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_date_option_vote_counts" as any, {
        _trip_id: tripId!,
      });
      if (error) throw error;
      const map: DateVotes = {};
      for (const r of (data as any[]) || []) {
        if (!map[r.date_option_id]) map[r.date_option_id] = { yes: 0, maybe: 0, no: 0 };
        if (r.value === "yes") map[r.date_option_id].yes = Number(r.count);
        if (r.value === "maybe") map[r.date_option_id].maybe = Number(r.count);
        if (r.value === "no") map[r.date_option_id].no = Number(r.count);
      }
      return map;
    },
    enabled: !!tripId && !!user,
  });

  // ─── My date option votes ───
  const myDateVotes = useQuery({
    queryKey: ["my-date-option-votes", tripId, user?.id],
    queryFn: async () => {
      const allDateOpts = dateOptions.data || [];
      const ids = allDateOpts.map((d) => d.id);
      if (ids.length === 0) return {} as Record<string, string>;

      const { data, error } = await supabase
        .from("date_option_votes")
        .select("date_option_id, value")
        .eq("user_id", user!.id)
        .in("date_option_id", ids);
      if (error) throw error;

      const map: Record<string, string> = {};
      for (const v of data || []) map[v.date_option_id] = v.value;
      return map;
    },
    enabled: !!tripId && !!user && (dateOptions.data || []).length > 0,
  });

  // ─── Mutations ───
  const createProposal = useMutation({
    mutationFn: async (input: { destination: string; note?: string; startDate?: string; endDate?: string }) => {
      const { data, error } = await supabase.from("trip_proposals").insert({
        trip_id: tripId!,
        created_by: user!.id,
        destination: input.destination,
        note: input.note || null,
      } as any).select("id").single();
      if (error) throw error;

      if (input.startDate && input.endDate && data) {
        const { error: dateErr } = await supabase.from("proposal_date_options").insert({
          proposal_id: data.id,
          start_date: input.startDate,
          end_date: input.endDate,
          created_by: user!.id,
        } as any);
        if (dateErr) throw dateErr;
      }
    },
    onSuccess: (_data, input) => {
      trackEvent("proposal_created", { trip_id: tripId, destination: input.destination, has_dates: !!(input.startDate && input.endDate) }, user?.id);
      invalidateAll();
    },
  });

  const reactDest = useMutation({
    mutationFn: async ({ proposalId, value }: { proposalId: string; value: string }) => {
      const { data: existing } = await supabase
        .from("proposal_reactions")
        .select("id, value")
        .eq("proposal_id", proposalId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (existing) {
        if (existing.value === value) {
          const { error } = await supabase
            .from("proposal_reactions")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("proposal_reactions")
            .update({ value } as any)
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from("proposal_reactions").insert({
          proposal_id: proposalId,
          user_id: user!.id,
          value,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      trackEvent("proposal_voted", { trip_id: tripId, proposal_id: vars.proposalId, value: vars.value }, user?.id);
      invalidateAll();
    },
  });

  const addDateOption = useMutation({
    mutationFn: async (input: { proposalId: string; startDate: string; endDate: string }) => {
      const { error } = await supabase.from("proposal_date_options").insert({
        proposal_id: input.proposalId,
        start_date: input.startDate,
        end_date: input.endDate,
        created_by: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      trackEvent("date_option_added", { trip_id: tripId }, user?.id);
      invalidateAll();
    },
  });

  const updateDateOption = useMutation({
    mutationFn: async (input: { dateOptionId: string; startDate: string; endDate: string }) => {
      const { error } = await supabase
        .from("proposal_date_options")
        .update({ start_date: input.startDate, end_date: input.endDate } as any)
        .eq("id", input.dateOptionId);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
  });

  const voteDateOption = useMutation({
    mutationFn: async ({ dateOptionId, value }: { dateOptionId: string; value: string }) => {
      const { data: existing } = await supabase
        .from("date_option_votes")
        .select("id, value")
        .eq("date_option_id", dateOptionId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (existing) {
        if (existing.value === value) {
          const { error } = await supabase
            .from("date_option_votes")
            .delete()
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("date_option_votes")
            .update({ value } as any)
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from("date_option_votes").insert({
          date_option_id: dateOptionId,
          user_id: user!.id,
          value,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      trackEvent("date_option_voted", { trip_id: tripId, date_option_id: vars.dateOptionId, value: vars.value }, user?.id);
      invalidateAll();
    },
  });

  const updateProposal = useMutation({
    mutationFn: async (input: { proposalId: string; destination?: string; note?: string | null }) => {
      const updates: any = {};
      if (input.destination !== undefined) updates.destination = input.destination;
      if (input.note !== undefined) updates.note = input.note || null;
      const { error } = await supabase
        .from("trip_proposals")
        .update(updates)
        .eq("id", input.proposalId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      trackEvent("proposal_updated", { trip_id: tripId, proposal_id: vars.proposalId }, user?.id);
      invalidateAll();
    },
  });

  const deleteDateOption = useMutation({
    mutationFn: async ({ dateOptionId }: { dateOptionId: string }) => {
      const { error } = await supabase
        .from("proposal_date_options")
        .delete()
        .eq("id", dateOptionId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
    },
  });

  const deleteProposal = useMutation({
    mutationFn: async ({ proposalId }: { proposalId: string }) => {
      // Check if proposal is referenced by a route stop
      const { data: routeStops } = await supabase
        .from("trip_route_stops")
        .select("id")
        .eq("proposal_id", proposalId)
        .limit(1);
      if (routeStops && routeStops.length > 0) {
        throw new Error("IN_ROUTE");
      }
      const { error } = await supabase
        .from("trip_proposals")
        .delete()
        .eq("id", proposalId);
      if (error) throw error;
    },
    onMutate: async ({ proposalId }) => {
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: ["trip-proposals", tripId] });
      // Snapshot previous value
      const prev = qc.getQueryData<Proposal[]>(["trip-proposals", tripId]);
      // Optimistically remove from cache
      qc.setQueryData<Proposal[]>(["trip-proposals", tripId], (old) =>
        (old || []).filter((p) => p.id !== proposalId)
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      // Roll back on failure
      if (context?.prev) {
        qc.setQueryData(["trip-proposals", tripId], context.prev);
      }
    },
    onSettled: (_data, _err, vars) => {
      if (!_err) trackEvent("proposal_deleted", { trip_id: tripId, proposal_id: vars.proposalId }, user?.id);
      invalidateAll();
    },
  });

  // ─── Derived data ───
  const proposalList = proposals.data || [];
  const destVotes = destVoteCounts.data || ({} as DestVotes);
  const allDateOptions = dateOptions.data || [];

  // Sort proposals by thumbs up descending
  const sortedProposals = [...proposalList].sort((a, b) => {
    return (destVotes[b.id]?.up || 0) - (destVotes[a.id]?.up || 0);
  });

  // Get date options grouped by proposal
  const dateOptionsByProposal = (proposalId: string) =>
    allDateOptions
      .filter((d) => d.proposal_id === proposalId)
      .sort((a, b) => {
        const aYes = (dateVoteCounts.data || {})[a.id]?.yes || 0;
        const bYes = (dateVoteCounts.data || {})[b.id]?.yes || 0;
        return bYes - aYes;
      });

  // Leading combo (frontrunner only — no confirmed state)
  const getLeadingCombo = () => {
    if (proposalList.length === 0) return null;

    let bestProp: Proposal | null = null;
    let bestUp = 0;
    for (const p of proposalList) {
      const up = destVotes[p.id]?.up || 0;
      if (up > bestUp) {
        bestUp = up;
        bestProp = p;
      }
    }
    if (!bestProp || bestUp === 0) return null;

    const dates = allDateOptions.filter((d) => d.proposal_id === bestProp!.id);
    let bestDate: DateOption | null = null;
    let bestYes = 0;
    for (const d of dates) {
      const yes = (dateVoteCounts.data || {})[d.id]?.yes || 0;
      if (yes > bestYes) {
        bestYes = yes;
        bestDate = d;
      }
    }

    return {
      destination: bestProp.destination,
      dateOption: bestDate,
    };
  };

  return {
    proposals: sortedProposals,
    destVotes,
    myDestVotes: myDestVotes.data || ({} as Record<string, string>),
    dateOptionsByProposal,
    allDateOptions,
    dateVotes: dateVoteCounts.data || ({} as DateVotes),
    myDateVotes: myDateVotes.data || ({} as Record<string, string>),
    leadingCombo: getLeadingCombo(),
    isLoading: proposals.isLoading,
    createProposal,
    updateProposal,
    reactDest,
    addDateOption,
    updateDateOption,
    deleteDateOption,
    voteDateOption,
    deleteProposal,
  };
}

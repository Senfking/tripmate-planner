import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PendingItem {
  id: string;
  tripId: string;
  tripName: string;
  tripEmoji: string | null;
  tripStartDate: string | null;
  type: "vibe" | "destination" | "date" | "poll";
  label: string;
  description: string;
}

export function useGlobalDecisions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["global-decisions", user?.id],
    enabled: !!user,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<{ items: PendingItem[]; pendingCount: number }> => {
      const userId = user!.id;

      // 1. Get all trips the user belongs to
      const { data: memberships } = await supabase
        .from("trip_members")
        .select("trip_id")
        .eq("user_id", userId);

      if (!memberships?.length) return { items: [], pendingCount: 0 };

      const tripIds = memberships.map((m) => m.trip_id);

      // 2. Fetch trips metadata
      const { data: trips } = await supabase
        .from("trips")
        .select("id, name, emoji, tentative_start_date, vibe_board_active, vibe_board_locked")
        .in("id", tripIds);

      if (!trips?.length) return { items: [], pendingCount: 0 };

      // 3. Fetch all related data in parallel
      const [
        { data: vibeResponses },
        { data: proposals },
        { data: routeStops },
        { data: reactions },
        { data: dateOptions },
        { data: dateVotes },
        { data: polls },
        { data: pollOptions },
        { data: votes },
      ] = await Promise.all([
        supabase
          .from("vibe_responses")
          .select("trip_id, user_id")
          .eq("user_id", userId)
          .in("trip_id", tripIds),
        supabase
          .from("trip_proposals")
          .select("id, trip_id, destination")
          .in("trip_id", tripIds),
        supabase
          .from("trip_route_stops")
          .select("trip_id, proposal_id")
          .in("trip_id", tripIds),
        supabase
          .from("proposal_reactions")
          .select("proposal_id, user_id")
          .eq("user_id", userId),
        supabase
          .from("proposal_date_options")
          .select("id, proposal_id, start_date, end_date"),
        supabase
          .from("date_option_votes")
          .select("date_option_id, user_id")
          .eq("user_id", userId),
        supabase
          .from("polls")
          .select("id, trip_id, title, status")
          .in("trip_id", tripIds)
          .eq("status", "open"),
        supabase.from("poll_options").select("id, poll_id"),
        supabase
          .from("votes")
          .select("poll_option_id, user_id")
          .eq("user_id", userId),
      ]);

      const items: PendingItem[] = [];

      const confirmedProposalIds = new Set(
        (routeStops ?? []).filter((s) => s.proposal_id).map((s) => s.proposal_id)
      );

      const vibeTrips = new Set(
        (vibeResponses ?? []).map((v) => v.trip_id)
      );

      const userReactionProposalIds = new Set(
        (reactions ?? []).map((r) => r.proposal_id)
      );

      const userDateVoteOptionIds = new Set(
        (dateVotes ?? []).map((v) => v.date_option_id)
      );

      const userVotedPollOptionIds = new Set(
        (votes ?? []).map((v) => v.poll_option_id)
      );

      for (const trip of trips) {
        // Vibe Board
        if (trip.vibe_board_active && !trip.vibe_board_locked && !vibeTrips.has(trip.id)) {
          items.push({
            id: `vibe-${trip.id}`,
            tripId: trip.id,
            tripName: trip.name,
            tripEmoji: trip.emoji,
            tripStartDate: trip.tentative_start_date,
            type: "vibe",
            label: "Vibe Board",
            description: `Share your travel vibe for ${trip.name}`,
          });
        }

        // Destination votes
        const tripProposals = (proposals ?? []).filter(
          (p) => p.trip_id === trip.id && !confirmedProposalIds.has(p.id)
        );
        for (const p of tripProposals) {
          if (!userReactionProposalIds.has(p.id)) {
            items.push({
              id: `dest-${p.id}`,
              tripId: trip.id,
              tripName: trip.name,
              tripEmoji: trip.emoji,
              tripStartDate: trip.tentative_start_date,
              type: "destination",
              label: "Destination vote",
              description: `Vote on ${p.destination}`,
            });
          }
        }

        // Date votes — only for unconfirmed proposals
        const tripProposalIds = new Set(tripProposals.map((p) => p.id));
        const tripDateOptions = (dateOptions ?? []).filter(
          (d) => tripProposalIds.has(d.proposal_id)
        );
        for (const d of tripDateOptions) {
          if (!userDateVoteOptionIds.has(d.id)) {
            items.push({
              id: `date-${d.id}`,
              tripId: trip.id,
              tripName: trip.name,
              tripEmoji: trip.emoji,
              tripStartDate: trip.tentative_start_date,
              type: "date",
              label: "Date vote",
              description: `Vote on dates for ${trip.name}`,
            });
          }
        }

        // Preference polls
        const tripPolls = (polls ?? []).filter((p) => p.trip_id === trip.id);
        for (const poll of tripPolls) {
          const options = (pollOptions ?? []).filter((o) => o.poll_id === poll.id);
          const hasVoted = options.some((o) => userVotedPollOptionIds.has(o.id));
          if (!hasVoted && options.length > 0) {
            items.push({
              id: `poll-${poll.id}`,
              tripId: trip.id,
              tripName: trip.name,
              tripEmoji: trip.emoji,
              tripStartDate: trip.tentative_start_date,
              type: "poll",
              label: "Preference poll",
              description: `Answer "${poll.title}"`,
            });
          }
        }
      }

      // Sort: soonest tentative_start_date first, nulls last
      items.sort((a, b) => {
        if (!a.tripStartDate && !b.tripStartDate) return 0;
        if (!a.tripStartDate) return 1;
        if (!b.tripStartDate) return -1;
        return a.tripStartDate.localeCompare(b.tripStartDate);
      });

      return { items, pendingCount: items.length };
    },
  });
}

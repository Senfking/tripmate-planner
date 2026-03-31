import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PendingItem {
  id: string;
  tripId: string;
  tripName: string;
  tripEmoji: string | null;
  tripStartDate: string | null;
  type: "vibe" | "destination" | "date" | "poll" | "attendance";
  label: string;
  description: string;
  /** For type "poll", the actual poll UUID for deep-link scrolling */
  pollId?: string;
  /** For type "attendance", how many members have responded */
  respondedCount?: number;
  /** For type "attendance", avatar info of going members */
  goingAvatars?: { display_name: string | null; avatar_url: string | null }[];
}

export function useGlobalDecisions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["global-decisions", user?.id],
    enabled: !!user,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<{ items: PendingItem[]; pendingCount: number }> => {
      const userId = user!.id;

      // 1. Get all trips the user belongs to (with attendance_status)
      const { data: memberships } = await supabase
        .from("trip_members")
        .select("trip_id, attendance_status")
        .eq("user_id", userId);

      if (!memberships?.length) return { items: [], pendingCount: 0 };

      const tripIds = memberships.map((m) => m.trip_id);
      const membershipMap = new Map(memberships.map((m) => [m.trip_id, m.attendance_status]));

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
        { data: allMembers },
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
        // Fetch all members for attendance cards
        supabase
          .from("trip_members")
          .select("trip_id, user_id, attendance_status")
          .in("trip_id", tripIds),
      ]);

      const items: PendingItem[] = [];

      // Attendance items — injected at top
      const pendingTrips = trips.filter((t) => membershipMap.get(t.id) === "pending");
      if (pendingTrips.length > 0) {
        // Get profiles for going members
        const goingMemberIds = new Set<string>();
        const tripMemberCounts = new Map<string, number>();

        for (const m of allMembers ?? []) {
          if (pendingTrips.some((t) => t.id === m.trip_id)) {
            if (m.attendance_status !== "pending") {
              tripMemberCounts.set(m.trip_id, (tripMemberCounts.get(m.trip_id) ?? 0) + 1);
            }
            if (m.attendance_status === "going" && m.user_id !== userId) {
              goingMemberIds.add(m.user_id);
            }
          }
        }

        let profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
        if (goingMemberIds.size > 0) {
          const { data: profiles } = await supabase.rpc("get_public_profiles", {
            _user_ids: Array.from(goingMemberIds),
          });
          profileMap = new Map(profiles?.map((p) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }]) ?? []);
        }

        for (const trip of pendingTrips) {
          const goingForTrip = (allMembers ?? [])
            .filter((m) => m.trip_id === trip.id && m.attendance_status === "going" && m.user_id !== userId)
            .slice(0, 3)
            .map((m) => profileMap.get(m.user_id) ?? { display_name: null, avatar_url: null });

          items.push({
            id: `attendance-${trip.id}`,
            tripId: trip.id,
            tripName: trip.name,
            tripEmoji: trip.emoji,
            tripStartDate: trip.tentative_start_date,
            type: "attendance",
            label: "RSVP",
            description: "Are you going?",
            respondedCount: tripMemberCounts.get(trip.id) ?? 0,
            goingAvatars: goingForTrip,
          });
        }
      }

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
              pollId: poll.id,
            });
          }
        }
      }

      // Sort: attendance items stay at top (already first), then by date
      const attendanceItems = items.filter((i) => i.type === "attendance");
      const otherItems = items.filter((i) => i.type !== "attendance");

      otherItems.sort((a, b) => {
        if (!a.tripStartDate && !b.tripStartDate) return 0;
        if (!a.tripStartDate) return 1;
        if (!b.tripStartDate) return -1;
        return a.tripStartDate.localeCompare(b.tripStartDate);
      });

      const sorted = [...attendanceItems, ...otherItems];

      return { items: sorted, pendingCount: sorted.length };
    },
  });
}

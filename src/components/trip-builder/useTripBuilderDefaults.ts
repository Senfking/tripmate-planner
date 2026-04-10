import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type BudgetLevel = "budget" | "mid-range" | "premium";
export type PaceLevel = "packed" | "balanced" | "relaxed";

export type TripBuilderDefaults = {
  destination: string;
  destinationSource: string | null;
  startDate: string | null;
  endDate: string | null;
  dateSource: string | null;
  budgetLevel: BudgetLevel | null;
  budgetSource: string | null;
  vibes: string[];
  vibeSource: string | null;
  pace: PaceLevel | null;
  paceSource: string | null;
  groupSize: number;
  isLoading: boolean;
};

const VIBE_MAP: Record<string, string> = {
  "Food & drinks": "Food",
  "Beach & sun": "Beach",
  "Culture & history": "Culture",
  "Nightlife": "Nightlife",
  "Nature & hiking": "Adventure",
  "Wellness & spa": "Relaxation",
  "Shopping": "Shopping",
  "Sightseeing": "Sightseeing",
};

const BUDGET_MAP: Record<string, BudgetLevel> = {
  "Treat ourselves": "premium",
  "Mid-range": "mid-range",
  "Budget-friendly": "budget",
  "As cheap as possible": "budget",
};

const PACE_MAP: Record<string, PaceLevel> = {
  "Full send": "packed",
  "Balanced": "balanced",
  "Slow & easy": "relaxed",
  "Go with the flow": "balanced",
};

export function useTripBuilderDefaults(tripId: string | undefined): TripBuilderDefaults {
  const { user } = useAuth();

  // Trip data
  const trip = useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("name, destination, tentative_start_date, tentative_end_date")
        .eq("id", tripId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tripId && !!user,
  });

  // Member count
  const members = useQuery({
    queryKey: ["trip-members-count-builder", tripId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("trip_members")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId!);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!tripId && !!user,
  });

  // Polls with options and vote counts
  const polls = useQuery({
    queryKey: ["builder-polls", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("polls")
        .select("id, title, status, poll_options(id, label, start_date, end_date)")
        .eq("trip_id", tripId!)
        .eq("type", "preference");
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Get vote counts for each poll
      const withCounts = await Promise.all(
        data.map(async (poll: any) => {
          const { data: counts } = await supabase.rpc("get_poll_vote_counts", { _poll_id: poll.id });
          return { ...poll, voteCounts: counts || [] };
        })
      );
      return withCounts;
    },
    enabled: !!tripId && !!user,
  });

  // Vibe aggregates
  const vibeAgg = useQuery({
    queryKey: ["vibe-aggregates", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vibe_aggregates", { _trip_id: tripId! });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tripId && !!user,
  });

  // Route stops (for destination)
  const routeStops = useQuery({
    queryKey: ["trip-route-stops-builder", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_route_stops")
        .select("destination, start_date, end_date")
        .eq("trip_id", tripId!)
        .order("start_date");
      if (error) throw error;
      return data || [];
    },
    enabled: !!tripId && !!user,
  });

  // Derive defaults
  let destination = "";
  let destinationSource: string | null = null;
  let startDate: string | null = null;
  let endDate: string | null = null;
  let dateSource: string | null = null;
  let budgetLevel: BudgetLevel | null = null;
  let budgetSource: string | null = null;
  const vibes: string[] = [];
  let vibeSource: string | null = null;
  let pace: PaceLevel | null = null;
  let paceSource: string | null = null;

  // 1. Destination from route stops first, then trip, then polls
  if (routeStops.data && routeStops.data.length > 0) {
    destination = routeStops.data.map((s) => s.destination).join(", ");
    destinationSource = "From your confirmed route";
    // Also get dates from route
    startDate = routeStops.data[0].start_date;
    endDate = routeStops.data[routeStops.data.length - 1].end_date;
    dateSource = "From your confirmed route";
  } else if (trip.data?.destination) {
    destination = trip.data.destination;
    destinationSource = "From trip details";
  }

  // Dates from trip if not from route
  if (!startDate && trip.data?.tentative_start_date) {
    startDate = trip.data.tentative_start_date;
    endDate = trip.data.tentative_end_date || null;
    dateSource = "From trip details";
  }

  // Check polls for destination/date winners
  if (polls.data) {
    for (const poll of polls.data) {
      const title = poll.title.toLowerCase();
      const options = poll.poll_options || [];
      const counts = poll.voteCounts || [];

      // Aggregate total votes per option
      const optionTotals: Record<string, number> = {};
      for (const c of counts) {
        optionTotals[c.poll_option_id] = (optionTotals[c.poll_option_id] || 0) + Number(c.count);
      }

      // Find winner
      let winnerId: string | null = null;
      let maxVotes = 0;
      for (const [optId, total] of Object.entries(optionTotals)) {
        if (total > maxVotes) {
          maxVotes = total;
          winnerId = optId;
        }
      }

      if (winnerId && maxVotes > 0) {
        const winnerOption = options.find((o: any) => o.id === winnerId);
        if (!winnerOption) continue;

        const isDestinationPoll = title.includes("where") || title.includes("destination") || title.includes("location");
        const isDatePoll = title.includes("when") || title.includes("date");

        if (isDestinationPoll && !destination) {
          destination = winnerOption.label;
          destinationSource = "📊 Based on your group's vote";
        }
        if (isDatePoll && !startDate && winnerOption.start_date) {
          startDate = winnerOption.start_date;
          endDate = winnerOption.end_date || null;
          dateSource = "📊 Based on your group's vote";
        }
      }
    }
  }

  // Vibe board mapping
  if (vibeAgg.data && vibeAgg.data.length > 0) {
    // musthave vibes
    const musthaves = vibeAgg.data.filter((a: any) => a.question_key === "musthave");
    const sortedMusthaves = [...musthaves].sort((a: any, b: any) => b.response_count - a.response_count);
    for (const m of sortedMusthaves) {
      const mapped = VIBE_MAP[m.answer_value];
      if (mapped && !vibes.includes(mapped)) {
        vibes.push(mapped);
      }
    }
    if (vibes.length > 0) vibeSource = "From your Vibe Board";

    // budget
    const budgetResponses = vibeAgg.data.filter((a: any) => a.question_key === "budget");
    if (budgetResponses.length > 0) {
      const topBudget = budgetResponses.reduce((a: any, b: any) => a.response_count > b.response_count ? a : b);
      const mappedBudget = BUDGET_MAP[topBudget.answer_value];
      if (mappedBudget) {
        budgetLevel = mappedBudget;
        budgetSource = "From your Vibe Board";
      }
    }

    // pace/energy
    const energyResponses = vibeAgg.data.filter((a: any) => a.question_key === "energy");
    if (energyResponses.length > 0) {
      const topEnergy = energyResponses.reduce((a: any, b: any) => a.response_count > b.response_count ? a : b);
      const mappedPace = PACE_MAP[topEnergy.answer_value];
      if (mappedPace) {
        pace = mappedPace;
        paceSource = "From your Vibe Board";
      }
    }
  }

  return {
    destination,
    destinationSource,
    startDate,
    endDate,
    dateSource,
    budgetLevel,
    budgetSource,
    vibes,
    vibeSource,
    pace,
    paceSource,
    groupSize: members.data || 0,
    isLoading: trip.isLoading || members.isLoading || polls.isLoading || vibeAgg.isLoading || routeStops.isLoading,
  };
}

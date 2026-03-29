import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { SectionCard } from "./SectionCard";
import { calcNetBalances, type Rates } from "@/lib/settlementCalc";

interface TripDashboardProps {
  tripId: string;
  routeLocked: boolean;
  settlementCurrency: string;
  myRole: string | undefined;
}

export function TripDashboard({ tripId, routeLocked, settlementCurrency, myRole }: TripDashboardProps) {
  const { user } = useAuth();
  const userId = user?.id;

  // Route stops
  const { data: stops } = useQuery({
    queryKey: ["trip-route-stops", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_route_stops")
        .select("*")
        .eq("trip_id", tripId)
        .order("start_date");
      if (error) throw error;
      return data;
    },
  });

  // --- DECISIONS data ---
  const { data: proposals } = useQuery({
    queryKey: ["trip-proposals", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_proposals")
        .select("id")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data;
    },
  });

  const { data: myReactions } = useQuery({
    queryKey: ["my-reactions", tripId],
    queryFn: async () => {
      if (!userId || !proposals?.length) return [];
      const { data, error } = await supabase
        .from("proposal_reactions")
        .select("proposal_id")
        .eq("user_id", userId)
        .in("proposal_id", proposals.map((p) => p.id));
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!proposals?.length,
  });

  const { data: dateOptions } = useQuery({
    queryKey: ["trip-date-options", tripId],
    queryFn: async () => {
      if (!proposals?.length) return [];
      const { data, error } = await supabase
        .from("proposal_date_options")
        .select("id, proposal_id")
        .in("proposal_id", proposals.map((p) => p.id));
      if (error) throw error;
      return data;
    },
    enabled: !!proposals?.length,
  });

  const { data: myDateVotes } = useQuery({
    queryKey: ["my-date-votes", tripId],
    queryFn: async () => {
      if (!userId || !dateOptions?.length) return [];
      const { data, error } = await supabase
        .from("date_option_votes")
        .select("date_option_id")
        .eq("user_id", userId)
        .in("date_option_id", dateOptions.map((d) => d.id));
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!dateOptions?.length,
  });

  const { data: polls } = useQuery({
    queryKey: ["trip-polls", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("polls")
        .select("id, status")
        .eq("trip_id", tripId)
        .eq("status", "open");
      if (error) throw error;
      return data;
    },
  });

  const { data: pollOptions } = useQuery({
    queryKey: ["trip-poll-options", tripId],
    queryFn: async () => {
      if (!polls?.length) return [];
      const { data, error } = await supabase
        .from("poll_options")
        .select("id, poll_id")
        .in("poll_id", polls.map((p) => p.id));
      if (error) throw error;
      return data;
    },
    enabled: !!polls?.length,
  });

  const { data: myPollVotes } = useQuery({
    queryKey: ["my-poll-votes", tripId],
    queryFn: async () => {
      if (!userId || !pollOptions?.length) return [];
      const { data, error } = await supabase
        .from("votes")
        .select("poll_option_id")
        .eq("user_id", userId)
        .in("poll_option_id", pollOptions.map((o) => o.id));
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!pollOptions?.length,
  });

  // Pending vote count
  const unreactedProposals = (proposals?.length ?? 0) - (myReactions?.length ?? 0);
  const unvotedDateOptions = (dateOptions?.length ?? 0) - (myDateVotes?.length ?? 0);

  // For polls: count polls where user has voted on 0 options
  const votedPollOptionIds = new Set(myPollVotes?.map((v) => v.poll_option_id) ?? []);
  const pollsWithoutVote = (polls ?? []).filter((p) => {
    const opts = (pollOptions ?? []).filter((o) => o.poll_id === p.id);
    return opts.length > 0 && !opts.some((o) => votedPollOptionIds.has(o.id));
  });

  const pendingVoteCount = Math.max(0, unreactedProposals) + Math.max(0, unvotedDateOptions) + pollsWithoutVote.length;

  // Total votes cast across the trip (to determine "in progress" state)
  const totalVoteActivity = (myReactions?.length ?? 0) + (myDateVotes?.length ?? 0) + (myPollVotes?.length ?? 0);

  // Decisions summary
  let decisionsSummary: string;
  if (routeLocked && stops && stops.length > 0) {
    const first = stops[0];
    const last = stops[stops.length - 1];
    decisionsSummary = `✅ ${stops.length}-stop route confirmed · ${format(new Date(first.start_date), "MMM d")} – ${format(new Date(last.end_date), "MMM d")}`;
  } else if (totalVoteActivity > 0 || (proposals?.length ?? 0) > 0) {
    decisionsSummary = pendingVoteCount > 0
      ? `⏳ ${pendingVoteCount} vote${pendingVoteCount > 1 ? "s" : ""} pending · Route not confirmed`
      : "Route not confirmed";
  } else {
    decisionsSummary = "Share your vibe to get started";
  }

  // --- ITINERARY data ---
  const { data: itineraryItems } = useQuery({
    queryKey: ["itinerary-items-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itinerary_items")
        .select("id, title, day_date, start_time")
        .eq("trip_id", tripId)
        .order("day_date")
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });

  const { data: myAttendance } = useQuery({
    queryKey: ["my-attendance-summary", tripId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("itinerary_attendance")
        .select("itinerary_item_id, status")
        .eq("trip_id", tripId)
        .eq("user_id", userId);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  let itinerarySummary: string;
  let itinerarySubline: string | undefined;
  if (itineraryItems && itineraryItems.length > 0) {
    const today = new Date().toISOString().split("T")[0];
    const upcoming = itineraryItems.find((i) => i.day_date >= today);
    itinerarySummary = `${itineraryItems.length} activit${itineraryItems.length > 1 ? "ies" : "y"} planned`;
    if (upcoming) itinerarySummary += ` · Next: ${upcoming.title}`;

    // Count items user is attending (status 'in' or no attendance row)
    const outIds = new Set(
      (myAttendance ?? []).filter((a) => a.status === "out").map((a) => a.itinerary_item_id)
    );
    const attendingCount = itineraryItems.filter((i) => !outIds.has(i.id)).length;
    if (attendingCount > 0) itinerarySubline = `${attendingCount} activit${attendingCount > 1 ? "ies" : "y"} you're attending`;
  } else if (routeLocked) {
    itinerarySummary = "Route confirmed — start planning activities";
  } else {
    itinerarySummary = "Nothing planned yet";
  }

  // --- BOOKINGS data ---
  const { data: attachments } = useQuery({
    queryKey: ["attachments-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("id, type, created_by")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data;
    },
  });

  let bookingsSummary: string;
  let bookingsSubline: string | undefined;
  if (attachments && attachments.length > 0) {
    const typeCounts: Record<string, number> = {};
    let myCount = 0;
    for (const a of attachments) {
      typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
      if (a.created_by === userId) myCount++;
    }
    const parts: string[] = [];
    if (typeCounts["flight"]) parts.push(`${typeCounts["flight"]} flight${typeCounts["flight"] > 1 ? "s" : ""}`);
    if (typeCounts["hotel"]) parts.push(`${typeCounts["hotel"]} hotel${typeCounts["hotel"] > 1 ? "s" : ""}`);
    if (typeCounts["activity"]) parts.push(`${typeCounts["activity"]} activit${typeCounts["activity"] > 1 ? "ies" : "y"}`);
    if (parts.length === 0) {
      parts.push(`${attachments.length} doc${attachments.length > 1 ? "s" : ""} saved`);
    }
    bookingsSummary = parts.join(" · ");
    if (myCount > 0) bookingsSubline = `You added ${myCount}`;
  } else {
    bookingsSummary = "No documents saved yet";
  }

  // --- EXPENSES data ---
  const { data: expenses } = useQuery({
    queryKey: ["expenses-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, payer_id, amount, currency, expense_splits(user_id, share_amount)")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data;
    },
  });

  const { data: rates } = useQuery({
    queryKey: ["exchange-rates", settlementCurrency],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exchange_rate_cache")
        .select("rates")
        .eq("base_currency", settlementCurrency)
        .single();
      if (error) return {};
      return (data?.rates ?? {}) as Rates;
    },
  });

  let expensesSummary: string;
  if (expenses && expenses.length > 0 && userId) {
    const mapped = expenses.map((e) => ({
      id: e.id,
      payer_id: e.payer_id,
      amount: Number(e.amount),
      currency: e.currency,
      splits: (e.expense_splits ?? []).map((s) => ({
        user_id: s.user_id,
        share_amount: Number(s.share_amount),
      })),
    }));
    const balances = calcNetBalances(mapped, settlementCurrency, settlementCurrency, rates ?? {}, {});
    const myBalance = balances.find((b) => b.userId === userId);
    if (!myBalance || Math.abs(myBalance.balance) < 0.01) {
      expensesSummary = "All settled up ✅";
    } else if (myBalance.balance > 0) {
      expensesSummary = `You are owed ${formatCurrencyShort(myBalance.balance, settlementCurrency)}`;
    } else {
      expensesSummary = `You owe ${formatCurrencyShort(Math.abs(myBalance.balance), settlementCurrency)}`;
    }
  } else {
    expensesSummary = "No expenses logged yet";
  }

  // --- ADMIN data ---
  const { data: memberCount } = useQuery({
    queryKey: ["trip-members-count", tripId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("trip_members")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId);
      if (error) throw error;
      return count || 0;
    },
  });

  const roleLabel = myRole ? myRole.charAt(0).toUpperCase() + myRole.slice(1) : "Member";
  const adminSummary = `${memberCount ?? "…"} members · ${roleLabel}`;

  return (
    <div className="space-y-3 px-4 pb-8">
      <SectionCard
        icon="🗳️"
        title="Decisions"
        summary={decisionsSummary}
        to={`/app/trips/${tripId}/decisions`}
        badgeCount={pendingVoteCount}
      />
      <SectionCard
        icon="🗓️"
        title="Itinerary"
        summary={itinerarySummary}
        subline={itinerarySubline}
        to={`/app/trips/${tripId}/itinerary`}
      />
      <SectionCard
        icon="📄"
        title="Bookings & Docs"
        summary={bookingsSummary}
        subline={bookingsSubline}
        to={`/app/trips/${tripId}/bookings`}
      />
      <SectionCard
        icon="💰"
        title="Expenses"
        summary={expensesSummary}
        to={`/app/trips/${tripId}/expenses`}
      />
      <SectionCard
        icon="⚙️"
        title="Admin"
        summary={adminSummary}
        to={`/app/trips/${tripId}/admin`}
      />
    </div>
  );
}

function formatCurrencyShort(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

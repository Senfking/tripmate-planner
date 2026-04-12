import { useState, Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, differenceInCalendarDays, isWithinInterval, parseISO } from "date-fns";
import { Compass, CalendarDays, Plane, Wallet, Users, Sparkles, AlertTriangle } from "lucide-react";
import { SectionCard } from "./SectionCard";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { calcNetBalances, type Rates } from "@/lib/settlementCalc";
import { SharedItemsSection } from "./SharedItemsSection";
import { ArrivalsCard } from "@/components/bookings/ArrivalsCard";
import { TripBuilderFlow } from "@/components/trip-builder/TripBuilderFlow";
import { Button } from "@/components/ui/button";
import { ConciergeButton } from "@/components/concierge/ConciergeButton";
import { ConciergePanel } from "@/components/concierge/ConciergePanel";

// Error boundary for the trip builder
class BuilderErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error("TripBuilder crashed:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6">
          <div className="text-center max-w-sm space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">The trip builder encountered an error.</p>
            <Button onClick={this.props.onClose} className="rounded-xl">Close</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function BuilderWrapper({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  return (
    <BuilderErrorBoundary onClose={onClose}>
      <TripBuilderFlow tripId={tripId} onClose={onClose} />
    </BuilderErrorBoundary>
  );
}

type BadgeState = { label: string; color: "green" | "amber" | "red" | "teal" | "grey"; pulse?: boolean };

interface TripDashboardProps {
  tripId: string;
  routeLocked: boolean;
  settlementCurrency: string;
  myRole: string | undefined;
  startDate: string | null;
  endDate: string | null;
  onBuilderToggle?: (open: boolean) => void;
}

export function TripDashboard({ tripId, routeLocked, settlementCurrency, myRole, startDate, endDate, onBuilderToggle }: TripDashboardProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const [builderOpen, setBuilderOpen] = useState(false);
  const [conciergeOpen, setConciergeOpen] = useState(false);

  // Check if trip has a linked AI plan
  const { data: hasPlan } = useQuery({
    queryKey: ["trip-has-plan", tripId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("ai_trip_plans" as any)
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!userId,
  });

  const toggleBuilder = (open: boolean) => {
    setBuilderOpen(open);
    onBuilderToggle?.(open);
  };

  const tripEnded = endDate ? new Date(endDate) < new Date(todayStr) : false;
  const endedBadge: BadgeState = { label: "Trip ended", color: "grey" };

  // Route stops
  const { data: stops, isLoading: stopsLoading } = useQuery({
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
    enabled: !!userId,
  });

  // --- DECISIONS data ---
  const { data: proposals, isLoading: proposalsLoading } = useQuery({
    queryKey: ["trip-proposals", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_proposals")
        .select("id")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
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

  const { data: polls, isLoading: pollsLoading } = useQuery({
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

  // Vibe responses for current user
  const { data: myVibeResponses } = useQuery({
    queryKey: ["my-vibe-responses-count", tripId, userId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("vibe_responses")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId)
        .eq("user_id", userId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
  });

  // Pending vote count
  const unreactedProposals = (proposals?.length ?? 0) - (myReactions?.length ?? 0);
  const unvotedDateOptions = (dateOptions?.length ?? 0) - (myDateVotes?.length ?? 0);

  const votedPollOptionIds = new Set(myPollVotes?.map((v) => v.poll_option_id) ?? []);
  const pollsWithoutVote = (polls ?? []).filter((p) => {
    const opts = (pollOptions ?? []).filter((o) => o.poll_id === p.id);
    return opts.length > 0 && !opts.some((o) => votedPollOptionIds.has(o.id));
  });

  const pendingVoteCount = Math.max(0, unreactedProposals) + Math.max(0, unvotedDateOptions) + pollsWithoutVote.length;

  const totalVoteActivity = (myReactions?.length ?? 0) + (myDateVotes?.length ?? 0) + (myPollVotes?.length ?? 0);

  // --- Decisions badge ---
  const decisionsBadge: BadgeState = (() => {
    if (tripEnded) return endedBadge;
    if ((myVibeResponses ?? 0) === 0) return { label: "Vibe pending", color: "amber" };
    if (pendingVoteCount > 0) return { label: `${pendingVoteCount} pending`, color: "amber" };
    if (routeLocked) return { label: "Route confirmed", color: "teal" };
    return { label: "Not started", color: "grey" };
  })();

  // Decisions summary
  let decisionsSummary: string;
  if (routeLocked && stops && stops.length > 0) {
    const first = stops[0];
    const last = stops[stops.length - 1];
    const startValid = first.start_date && !isNaN(new Date(first.start_date).getTime());
    const endValid = last.end_date && !isNaN(new Date(last.end_date).getTime());
    decisionsSummary = startValid && endValid
      ? `${stops.length}-stop route confirmed · ${format(new Date(first.start_date), "MMM d")} – ${format(new Date(last.end_date), "MMM d")}`
      : `${stops.length}-stop route confirmed`;
  } else if (totalVoteActivity > 0 || (proposals?.length ?? 0) > 0) {
    decisionsSummary = pendingVoteCount > 0
      ? `${pendingVoteCount} vote${pendingVoteCount > 1 ? "s" : ""} pending · Route not confirmed`
      : "Route not confirmed";
  } else {
    decisionsSummary = "Share your vibe to get started";
  }

  // --- ITINERARY data ---
  const { data: itineraryItems, isLoading: itineraryLoading } = useQuery({
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
    enabled: !!userId,
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

  // --- Itinerary badge ---
  const itineraryBadge: BadgeState = (() => {
    if (tripEnded) return endedBadge;
    if (startDate && endDate) {
      const s = parseISO(startDate);
      const e = parseISO(endDate);
      if (isWithinInterval(today, { start: s, end: e })) {
        return { label: "In progress", color: "green", pulse: true };
      }
      const daysToGo = differenceInCalendarDays(s, today);
      if (daysToGo > 0 && daysToGo <= 60) return { label: `${daysToGo} days to go`, color: "teal" };
      if (daysToGo > 60) return { label: "Upcoming", color: "teal" };
    } else if (startDate) {
      const daysToGo = differenceInCalendarDays(parseISO(startDate), today);
      if (daysToGo > 0 && daysToGo <= 60) return { label: `${daysToGo} days to go`, color: "teal" };
      if (daysToGo > 60) return { label: "Upcoming", color: "teal" };
    }
    const itemCount = itineraryItems?.length ?? 0;
    if (itemCount === 0) return { label: "Nothing planned", color: "grey" };
    return { label: `${itemCount} activities`, color: "green" };
  })();

  let itinerarySummary: string;
  let itinerarySubline: string | undefined;
  if (itineraryItems && itineraryItems.length > 0) {
    const upcoming = itineraryItems.find((i) => i.day_date >= todayStr);
    itinerarySummary = `${itineraryItems.length} activit${itineraryItems.length > 1 ? "ies" : "y"} planned`;
    if (upcoming) itinerarySummary += ` · Next: ${upcoming.title}`;

    const outIds = new Set(
      (myAttendance ?? []).filter((a) => a.status === "out").map((a) => a.itinerary_item_id)
    );
    const attendingCount = itineraryItems.filter((i) => !outIds.has(i.id)).length;
    if (attendingCount > 0) itinerarySubline = `${attendingCount} activit${attendingCount > 1 ? "ies" : "y"} you're attending`;
  } else if (routeLocked) {
    itinerarySummary = "Route confirmed - start planning activities";
  } else {
    itinerarySummary = "Nothing planned yet";
  }

  // --- BOOKINGS data ---
  const { data: attachments, isLoading: attachmentsLoading } = useQuery({
    queryKey: ["attachments-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("id, type, created_by")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const bookingsBadge: BadgeState = (() => {
    const count = attachments?.length ?? 0;
    if (count > 0) return { label: `${count} docs saved`, color: "green" };
    return { label: "No docs yet", color: "grey" };
  })();

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
  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ["expenses-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, payer_id, amount, currency, expense_splits(user_id, share_amount)")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
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
    enabled: !!userId,
  });

  let expensesSummary: string;
  let expensesBadge: BadgeState;

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
    const { balances } = calcNetBalances(mapped, settlementCurrency, settlementCurrency, rates ?? {}, {});
    const myBalance = balances.find((b) => b.userId === userId);
    if (!myBalance || Math.abs(myBalance.balance) < 0.01) {
      expensesBadge = { label: "Settled up", color: "green" };
    } else if (myBalance.balance > 0) {
      expensesBadge = { label: `Owed ${formatCurrencyShort(myBalance.balance, settlementCurrency)}`, color: "green" };
    } else {
      expensesBadge = { label: `You owe ${formatCurrencyShort(Math.abs(myBalance.balance), settlementCurrency)}`, color: "red" };
    }
    const payerCount = new Set(mapped.map((e) => e.payer_id)).size;
    expensesSummary = `${expenses.length} expense${expenses.length > 1 ? "s" : ""} · ${payerCount} contributor${payerCount > 1 ? "s" : ""}`;
  } else {
    expensesBadge = { label: "No expenses", color: "grey" };
    expensesSummary = "No expenses logged yet";
  }

  // --- ADMIN data ---
  const { data: memberCount, isLoading: memberCountLoading } = useQuery({
    queryKey: ["trip-members-count", tripId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("trip_members")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!userId,
  });

  const roleLabel = myRole ? myRole.charAt(0).toUpperCase() + myRole.slice(1) : "Member";
  const adminSummary = roleLabel;
  const adminBadge: BadgeState = { label: `${memberCount ?? 0} members`, color: "grey" };

  // Wait for all primary queries before rendering to prevent flicker
  const isLoading =
    stopsLoading || proposalsLoading || pollsLoading ||
    itineraryLoading || attachmentsLoading || expensesLoading || memberCountLoading;

  // Don't show skeleton while builder is open — it's a full-screen overlay so the
  // dashboard isn't visible, and returning the skeleton would unmount the builder
  // mid-generation, silently killing the AI request.
  if (isLoading && !builderOpen) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="animate-fade-in-card pb-12">
      {/* Plan with AI banner — only show if no plan exists yet */}
      {!hasPlan && (
        <div className="px-4 md:max-w-[900px] md:mx-auto md:px-8 mb-3">
          <button
            onClick={() => toggleBuilder(true)}
            className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all active:scale-[0.98] text-left"
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-[14px]">Plan with Junto AI ✨</p>
              <p className="text-xs text-muted-foreground">Generate a day-by-day itinerary in seconds</p>
            </div>
          </button>
        </div>
      )}

      {builderOpen && (
        <BuilderWrapper tripId={tripId} onClose={() => toggleBuilder(false)} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-4 px-4 md:max-w-[900px] md:mx-auto md:px-8">
        {/* Plan tab — only when a plan exists */}
        {hasPlan && (
          <SectionCard
            icon={Sparkles}
            title="Plan"
            summary="View your AI-generated itinerary"
            to={`/app/trips/${tripId}/plan`}
            badge={{ label: "AI Plan", color: "teal" }}
            imageUrl="https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80"
            className="md:col-span-2"
          />
        )}
        <SectionCard
          icon={Compass}
          title="Decisions"
          summary={decisionsSummary}
          to={`/app/trips/${tripId}/decisions`}
          badge={decisionsBadge}
          imageUrl="https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80"
        />
        {!hasPlan && (
          <SectionCard
            icon={CalendarDays}
            title="Itinerary"
            summary={itinerarySummary}
            subline={itinerarySubline}
            to={`/app/trips/${tripId}/itinerary`}
            badge={itineraryBadge}
            imageUrl="https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=800&q=80"
          />
        )}
        <SectionCard
          icon={Plane}
          title="Bookings & Docs"
          summary={bookingsSummary}
          subline={bookingsSubline}
          to={`/app/trips/${tripId}/bookings`}
          badge={bookingsBadge}
          imageUrl="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80"
        />
        <SectionCard
          icon={Wallet}
          title="Expenses"
          summary={expensesSummary}
          to={`/app/trips/${tripId}/expenses`}
          badge={expensesBadge}
          imageUrl="https://images.unsplash.com/photo-1580048915913-4f8f5cb481c4?w=800&q=80"
        />
        <SectionCard
          icon={Users}
          title="Admin"
          summary={adminSummary}
          to={`/app/trips/${tripId}/admin`}
          badge={adminBadge}
          imageUrl="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80"
          className="md:col-span-2"
        />
      </div>
      <div className="px-4 md:max-w-[900px] md:mx-auto md:px-8 mt-3">
        <ArrivalsCard tripId={tripId} />
      </div>
      <SharedItemsSection tripId={tripId} />
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

import { useState, Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, differenceInCalendarDays, isWithinInterval, parseISO } from "date-fns";
import {
  Compass, CalendarDays, Sparkles, AlertTriangle, Share2, UserPlus, Settings,
  Vote, FileText, Receipt, ChevronRight,
} from "lucide-react";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { calcNetBalances } from "@/lib/settlementCalc";
import { fetchEurRates, crossCalculateRates } from "@/lib/fetchCrossRates";
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

const DOT_COLORS: Record<string, string> = {
  green: "#10B981", amber: "#F59E0B", red: "#EF4444", teal: "#0D9488", grey: "#94A3B8",
};

interface TripDashboardProps {
  tripId: string;
  routeLocked: boolean;
  settlementCurrency: string;
  myRole: string | undefined;
  startDate: string | null;
  endDate: string | null;
  tripName?: string;
  onBuilderToggle?: (open: boolean) => void;
  onShareOpen?: () => void;
}

export function TripDashboard({ tripId, routeLocked, settlementCurrency, myRole, startDate, endDate, tripName, onBuilderToggle, onShareOpen }: TripDashboardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const [builderOpen, setBuilderOpen] = useState(false);
  const [conciergeOpen, setConciergeOpen] = useState(false);

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
        .from("trip_route_stops").select("*").eq("trip_id", tripId).order("start_date");
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // --- DECISIONS data ---
  const { data: proposals, isLoading: proposalsLoading } = useQuery({
    queryKey: ["trip-proposals", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.from("trip_proposals").select("id").eq("trip_id", tripId);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: myReactions } = useQuery({
    queryKey: ["my-reactions", tripId],
    queryFn: async () => {
      if (!userId || !proposals?.length) return [];
      const { data, error } = await supabase.from("proposal_reactions").select("proposal_id").eq("user_id", userId).in("proposal_id", proposals.map((p) => p.id));
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!proposals?.length,
  });

  const { data: dateOptions } = useQuery({
    queryKey: ["trip-date-options", tripId],
    queryFn: async () => {
      if (!proposals?.length) return [];
      const { data, error } = await supabase.from("proposal_date_options").select("id, proposal_id").in("proposal_id", proposals.map((p) => p.id));
      if (error) throw error;
      return data;
    },
    enabled: !!proposals?.length,
  });

  const { data: myDateVotes } = useQuery({
    queryKey: ["my-date-votes", tripId],
    queryFn: async () => {
      if (!userId || !dateOptions?.length) return [];
      const { data, error } = await supabase.from("date_option_votes").select("date_option_id").eq("user_id", userId).in("date_option_id", dateOptions.map((d) => d.id));
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!dateOptions?.length,
  });

  const { data: polls, isLoading: pollsLoading } = useQuery({
    queryKey: ["trip-polls", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.from("polls").select("id, status").eq("trip_id", tripId).eq("status", "open");
      if (error) throw error;
      return data;
    },
  });

  const { data: pollOptions } = useQuery({
    queryKey: ["trip-poll-options", tripId],
    queryFn: async () => {
      if (!polls?.length) return [];
      const { data, error } = await supabase.from("poll_options").select("id, poll_id").in("poll_id", polls.map((p) => p.id));
      if (error) throw error;
      return data;
    },
    enabled: !!polls?.length,
  });

  const { data: myPollVotes } = useQuery({
    queryKey: ["my-poll-votes", tripId],
    queryFn: async () => {
      if (!userId || !pollOptions?.length) return [];
      const { data, error } = await supabase.from("votes").select("poll_option_id").eq("user_id", userId).in("poll_option_id", pollOptions.map((o) => o.id));
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!pollOptions?.length,
  });

  const { data: myVibeResponses } = useQuery({
    queryKey: ["my-vibe-responses-count", tripId, userId],
    queryFn: async () => {
      const { count, error } = await supabase.from("vibe_responses").select("id", { count: "exact", head: true }).eq("trip_id", tripId).eq("user_id", userId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
  });

  const unreactedProposals = (proposals?.length ?? 0) - (myReactions?.length ?? 0);
  const unvotedDateOptions = (dateOptions?.length ?? 0) - (myDateVotes?.length ?? 0);
  const votedPollOptionIds = new Set(myPollVotes?.map((v) => v.poll_option_id) ?? []);
  const pollsWithoutVote = (polls ?? []).filter((p) => {
    const opts = (pollOptions ?? []).filter((o) => o.poll_id === p.id);
    return opts.length > 0 && !opts.some((o) => votedPollOptionIds.has(o.id));
  });
  const pendingVoteCount = Math.max(0, unreactedProposals) + Math.max(0, unvotedDateOptions) + pollsWithoutVote.length;
  const totalVoteActivity = (myReactions?.length ?? 0) + (myDateVotes?.length ?? 0) + (myPollVotes?.length ?? 0);

  const decisionsBadge: BadgeState = (() => {
    if (tripEnded) return endedBadge;
    if ((myVibeResponses ?? 0) === 0) return { label: "Vibe pending", color: "amber" };
    if (pendingVoteCount > 0) return { label: `${pendingVoteCount} pending`, color: "amber" };
    if (routeLocked) return { label: "Route confirmed", color: "teal" };
    return { label: "Not started", color: "grey" };
  })();

  let decisionsSummary: string;
  if (routeLocked && stops && stops.length > 0) {
    const first = stops[0]; const last = stops[stops.length - 1];
    const startValid = first.start_date && !isNaN(new Date(first.start_date).getTime());
    const endValid = last.end_date && !isNaN(new Date(last.end_date).getTime());
    decisionsSummary = startValid && endValid
      ? `${stops.length}-stop route · ${format(new Date(first.start_date), "MMM d")} – ${format(new Date(last.end_date), "MMM d")}`
      : `${stops.length}-stop route confirmed`;
  } else if (totalVoteActivity > 0 || (proposals?.length ?? 0) > 0) {
    decisionsSummary = pendingVoteCount > 0
      ? `${pendingVoteCount} vote${pendingVoteCount > 1 ? "s" : ""} pending`
      : "Route not confirmed";
  } else {
    decisionsSummary = "Share your vibe to get started";
  }

  // --- ITINERARY data ---
  const { data: itineraryItems, isLoading: itineraryLoading } = useQuery({
    queryKey: ["itinerary-items-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.from("itinerary_items").select("id, title, day_date, start_time").eq("trip_id", tripId).order("day_date").order("start_time");
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const itineraryBadge: BadgeState = (() => {
    if (tripEnded) return endedBadge;
    const itemCount = itineraryItems?.length ?? 0;
    if (itemCount === 0) return { label: "Nothing planned", color: "grey" };
    return { label: `${itemCount} activities`, color: "green" };
  })();

  let itinerarySummary: string;
  if (itineraryItems && itineraryItems.length > 0) {
    itinerarySummary = `${itineraryItems.length} activit${itineraryItems.length > 1 ? "ies" : "y"} planned`;
  } else {
    itinerarySummary = "Nothing planned yet";
  }

  // --- BOOKINGS data ---
  const { data: attachments, isLoading: attachmentsLoading } = useQuery({
    queryKey: ["attachments-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.from("attachments").select("id, type, created_by").eq("trip_id", tripId);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const bookingsBadge: BadgeState = (() => {
    const count = attachments?.length ?? 0;
    if (count > 0) return { label: `${count} docs`, color: "green" };
    return { label: "No docs yet", color: "grey" };
  })();

  let bookingsSummary: string;
  if (attachments && attachments.length > 0) {
    const typeCounts: Record<string, number> = {};
    for (const a of attachments) typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    const parts: string[] = [];
    if (typeCounts["flight"]) parts.push(`${typeCounts["flight"]} flight${typeCounts["flight"] > 1 ? "s" : ""}`);
    if (typeCounts["hotel"]) parts.push(`${typeCounts["hotel"]} hotel${typeCounts["hotel"] > 1 ? "s" : ""}`);
    if (parts.length === 0) parts.push(`${attachments.length} doc${attachments.length > 1 ? "s" : ""}`);
    bookingsSummary = parts.join(" · ");
  } else {
    bookingsSummary = "No documents saved yet";
  }

  // --- EXPENSES data ---
  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ["expenses-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("id, payer_id, amount, currency, expense_splits(user_id, share_amount)").eq("trip_id", tripId);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: rates } = useQuery({
    queryKey: ["exchange-rates-cross", settlementCurrency],
    queryFn: async () => {
      const eurRates = await fetchEurRates();
      return crossCalculateRates(eurRates, settlementCurrency);
    },
    staleTime: 1000 * 60 * 60,
    enabled: !!userId,
  });

  let expensesSummary: string;
  let expensesBadge: BadgeState;

  if (expenses && expenses.length > 0 && userId) {
    const mapped = expenses.map((e) => ({
      id: e.id, payer_id: e.payer_id, amount: Number(e.amount), currency: e.currency,
      splits: (e.expense_splits ?? []).map((s) => ({ user_id: s.user_id, share_amount: Number(s.share_amount) })),
    }));
    const { balances } = calcNetBalances(mapped, settlementCurrency, settlementCurrency, rates ?? {}, {});
    const myBalance = balances.find((b) => b.userId === userId);
    if (!myBalance || Math.abs(myBalance.balance) < 0.01) {
      expensesBadge = { label: "Settled up", color: "green" };
    } else if (myBalance.balance > 0) {
      expensesBadge = { label: `Owed ${fmtCurrency(myBalance.balance, settlementCurrency)}`, color: "green" };
    } else {
      expensesBadge = { label: `You owe ${fmtCurrency(Math.abs(myBalance.balance), settlementCurrency)}`, color: "red" };
    }
    const payerCount = new Set(mapped.map((e) => e.payer_id)).size;
    expensesSummary = `${expenses.length} expense${expenses.length > 1 ? "s" : ""} · ${payerCount} contributor${payerCount > 1 ? "s" : ""}`;
  } else {
    expensesBadge = { label: "No expenses", color: "grey" };
    expensesSummary = "No expenses logged yet";
  }

  const { data: memberCount } = useQuery({
    queryKey: ["trip-members-count", tripId],
    queryFn: async () => {
      const { count, error } = await supabase.from("trip_members").select("id", { count: "exact", head: true }).eq("trip_id", tripId);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!userId,
  });

  const isLoading = stopsLoading || proposalsLoading || pollsLoading || itineraryLoading || attachmentsLoading || expensesLoading;

  if (isLoading && !builderOpen) {
    return <DashboardSkeleton />;
  }

  const sections: {
    key: string;
    icon: typeof Vote;
    title: string;
    summary: string;
    badge: BadgeState;
    to: string;
    iconBg: string;
    iconColor: string;
  }[] = [
    {
      key: "decisions",
      icon: Vote,
      title: "Decisions",
      summary: decisionsSummary,
      badge: decisionsBadge,
      to: `/app/trips/${tripId}/decisions`,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
    },
    ...(!hasPlan ? [{
      key: "itinerary",
      icon: CalendarDays,
      title: "Itinerary",
      summary: itinerarySummary,
      badge: itineraryBadge,
      to: `/app/trips/${tripId}/itinerary`,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-500",
    }] : []),
    {
      key: "bookings",
      icon: FileText,
      title: "Bookings & Docs",
      summary: bookingsSummary,
      badge: bookingsBadge,
      to: `/app/trips/${tripId}/bookings`,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
    },
    {
      key: "expenses",
      icon: Receipt,
      title: "Expenses",
      summary: expensesSummary,
      badge: expensesBadge,
      to: `/app/trips/${tripId}/expenses`,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
  ];

  const quickActions = [
    { icon: Share2, label: "Share", action: () => onShareOpen?.() },
    { icon: UserPlus, label: "Invite", action: () => onShareOpen?.() },
    { icon: Compass, label: "Discover", action: () => setConciergeOpen(true) },
    { icon: Settings, label: "Settings", action: () => navigate(`/app/trips/${tripId}/admin`) },
  ];

  return (
    <div className="animate-fade-in-card pb-16">
      {builderOpen && (
        <BuilderWrapper tripId={tripId} onClose={() => toggleBuilder(false)} />
      )}

      <div className="px-4 md:max-w-[700px] md:mx-auto md:px-8 flex flex-col gap-3">
        {/* ─── QUICK ACTIONS ─── */}
        <div className="flex items-center justify-center gap-6 py-2">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              onClick={qa.action}
              className="flex flex-col items-center gap-1 group"
            >
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center transition-colors group-hover:bg-muted/80 group-active:scale-95">
                <qa.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">{qa.label}</span>
            </button>
          ))}
        </div>

        {/* ─── AI PLAN CARD ─── */}
        {hasPlan ? (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/plan`)}
            className="w-full bg-card rounded-2xl shadow-sm border border-border p-4 flex items-center gap-3 text-left transition-all active:scale-[0.98] hover:shadow-md"
          >
            <div className="h-[80px] w-[80px] rounded-xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px] text-card-foreground">Your trip plan</p>
              <p className="text-[13px] text-muted-foreground mt-0.5 truncate">AI-generated itinerary ready to explore</p>
            </div>
            <ChevronRight className="h-5 w-5 text-primary shrink-0" />
          </button>
        ) : (
          <button
            onClick={() => toggleBuilder(true)}
            className="w-full bg-card rounded-2xl shadow-sm border border-border p-4 flex items-center gap-3 text-left transition-all active:scale-[0.98] hover:shadow-md"
          >
            <div className="h-[80px] w-[80px] rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
              <Sparkles className="h-7 w-7 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px] text-card-foreground">Plan with Junto AI</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">Generate a complete itinerary in seconds</p>
            </div>
            <div className="shrink-0">
              <span className="text-xs font-semibold text-primary">Get started →</span>
            </div>
          </button>
        )}

        {/* ─── SECTION CARDS ─── */}
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => navigate(s.to)}
            className="w-full bg-card rounded-2xl shadow-sm border border-border p-4 flex items-center gap-3 text-left transition-all active:scale-[0.98] hover:shadow-md"
          >
            <div className={`h-9 w-9 rounded-lg ${s.iconBg} flex items-center justify-center shrink-0`}>
              <s.icon className={`h-[18px] w-[18px] ${s.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px] text-card-foreground">{s.title}</p>
              <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{s.summary}</p>
            </div>
            {/* Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <div
                className="flex items-center gap-1.5 rounded-full px-2 py-0.5"
                style={{ background: "hsl(var(--muted))", fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }}
              >
                <span
                  className={s.badge.pulse ? "animate-pulse" : ""}
                  style={{ width: 6, height: 6, borderRadius: "50%", background: DOT_COLORS[s.badge.color], flexShrink: 0 }}
                />
                {s.badge.label}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>
        ))}

        {/* ─── ARRIVALS ─── */}
        <ArrivalsCard tripId={tripId} />
      </div>

      {/* ─── SHARED ITEMS ─── */}
      <div className="md:max-w-[700px] md:mx-auto">
        <SharedItemsSection tripId={tripId} />
      </div>

      {/* Concierge */}
      <ConciergeButton onClick={() => setConciergeOpen(true)} />
      <ConciergePanel
        tripId={tripId}
        open={conciergeOpen}
        onClose={() => setConciergeOpen(false)}
        destination={stops?.[0]?.destination || undefined}
        tripName={tripName}
        memberCount={memberCount ?? undefined}
        tripStartDate={startDate || undefined}
        tripEndDate={endDate || undefined}
      />
    </div>
  );
}

function fmtCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

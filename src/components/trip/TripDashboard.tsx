import { useState, Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import {
  Sparkles, AlertTriangle, Vote, FileText, Receipt, ChevronRight,
  Plane, Package,
} from "lucide-react";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { calcNetBalances } from "@/lib/settlementCalc";
import { fetchEurRates, crossCalculateRates } from "@/lib/fetchCrossRates";
import { SharedItemsSection } from "./SharedItemsSection";
import { TripBuilderFlow } from "@/components/trip-builder/TripBuilderFlow";
import { Button } from "@/components/ui/button";
import { ConciergePanel } from "@/components/concierge/ConciergePanel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";

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

  const decisionsBadge = (() => {
    if (tripEnded) return { label: "Trip ended", color: "grey" as const };
    if ((myVibeResponses ?? 0) === 0) return { label: "Vibe pending", color: "amber" as const };
    if (pendingVoteCount > 0) return { label: `${pendingVoteCount} pending`, color: "amber" as const };
    if (routeLocked) return { label: "Route confirmed", color: "teal" as const };
    return { label: "Not started", color: "grey" as const };
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

  // --- BOOKINGS data ---
  const { data: attachments, isLoading: attachmentsLoading } = useQuery({
    queryKey: ["attachments-summary", tripId],
    queryFn: async () => {
      const { data, error } = await supabase.from("attachments").select("id, type, created_by, booking_data").eq("trip_id", tripId);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  let bookingsSummary: string;
  if (attachments && attachments.length > 0) {
    const typeCounts: Record<string, number> = {};
    for (const a of attachments) typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    const parts: string[] = [];
    if (typeCounts["flight"]) parts.push(`${typeCounts["flight"]} flight${typeCounts["flight"] > 1 ? "s" : ""}`);
    if (typeCounts["hotel"]) parts.push(`${typeCounts["hotel"]} hotel${typeCounts["hotel"] > 1 ? "s" : ""}`);
    const totalDocs = attachments.length;
    parts.unshift(`${totalDocs} doc${totalDocs > 1 ? "s" : ""}`);
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

  // Members for expenses card
  const { data: members } = useQuery({
    queryKey: ["trip-members-full", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, role, joined_at")
        .eq("trip_id", tripId)
        .order("joined_at");
      if (error) throw error;
      const userIds = data.map((m) => m.user_id);
      const { data: profiles } = await supabase.rpc("get_public_profiles", { _user_ids: userIds });
      const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
      return data.map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id) as { display_name: string | null; avatar_url?: string | null } | undefined,
      }));
    },
    enabled: !!userId,
  });

  const memberCount = members?.length ?? 0;

  // Compute expense balances
  let myBalance = 0;
  let totalSpent = 0;
  let balances: { userId: string; balance: number }[] = [];

  if (expenses && expenses.length > 0 && userId) {
    const mapped = expenses.map((e) => ({
      id: e.id, payer_id: e.payer_id, amount: Number(e.amount), currency: e.currency,
      splits: (e.expense_splits ?? []).map((s) => ({ user_id: s.user_id, share_amount: Number(s.share_amount) })),
    }));
    const result = calcNetBalances(mapped, settlementCurrency, settlementCurrency, rates ?? {}, {});
    balances = result.balances;
    const myBal = balances.find((b) => b.userId === userId);
    myBalance = myBal?.balance ?? 0;
    totalSpent = mapped.reduce((sum, e) => sum + e.amount, 0);
  }

  // Flight card data
  const flights = (attachments ?? []).filter((a) => a.type === "flight");
  const nextFlight = flights.length > 0 ? flights[0] : null;
  const flightBookingData = nextFlight?.booking_data as any;

  const isLoading = stopsLoading || proposalsLoading || pollsLoading || itineraryLoading || attachmentsLoading || expensesLoading;

  if (isLoading && !builderOpen) {
    return <DashboardSkeleton />;
  }

  // Countdown helper
  const daysUntil = (dateStr: string | null) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  };

  const tripCountdown = daysUntil(startDate);

  return (
    <div className="animate-fade-in-card pb-16">
      {builderOpen && (
        <BuilderWrapper tripId={tripId} onClose={() => toggleBuilder(false)} />
      )}

      <div className="px-4 md:max-w-[700px] md:mx-auto md:px-8 flex flex-col gap-3">

        {/* ─── JUNTO AI BLOCK ─── */}
        <div
          className="relative overflow-hidden p-5"
          style={{
            background: "#0D9488",
            borderRadius: 20,
          }}
        >
          {/* Decorative sparkles */}
          <svg className="absolute top-3 right-4 opacity-20" width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" fill="white" />
          </svg>
          <svg className="absolute bottom-4 right-16 opacity-15" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" fill="white" />
          </svg>
          <svg className="absolute top-12 left-2 opacity-10" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L13.09 8.26L18 6L14.74 10.91L21 12L14.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L9.26 13.09L3 12L9.26 10.91L6 6L10.91 8.26L12 2Z" fill="white" />
          </svg>

          {/* Label */}
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="h-4 w-4 text-white/90" />
            <span className="text-white/90 text-[13px] font-semibold tracking-wide">Junto AI</span>
          </div>

          {/* Two glass sub-cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => {
                if (hasPlan) {
                  navigate(`/app/trips/${tripId}/plan`);
                } else {
                  toggleBuilder(true);
                }
              }}
              className="text-left rounded-2xl p-3.5 transition-all active:scale-[0.97]"
              style={{
                background: "rgba(255,255,255,0.18)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <p className="text-white font-semibold text-[14px] leading-tight">
                {hasPlan ? "Your plan" : "Plan my trip"}
              </p>
              <p className="text-white/70 text-[12px] mt-1 leading-snug">
                {hasPlan ? "View your AI itinerary" : "Full itinerary in seconds"}
              </p>
            </button>

            <button
              onClick={() => setConciergeOpen(true)}
              className="text-left rounded-2xl p-3.5 transition-all active:scale-[0.97]"
              style={{
                background: "rgba(255,255,255,0.18)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <p className="text-white font-semibold text-[14px] leading-tight">What to do?</p>
              <p className="text-white/70 text-[12px] mt-1 leading-snug">Restaurants, bars, spots</p>
            </button>
          </div>
        </div>

        {/* ─── FLIGHT CARD (contextual) ─── */}
        {nextFlight && (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/bookings`)}
            className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all active:scale-[0.98] hover:shadow-md"
          >
            {/* Photo strip */}
            <div className="grid grid-cols-2 h-[100px]">
              <div className="relative" style={{ background: "linear-gradient(135deg, #0D9488, #0f766e)" }}>
                <span className="absolute inset-0 flex items-center justify-center text-white/60 text-[13px] font-medium tracking-wide">
                  {flightBookingData?.origin_code || "DEP"}
                </span>
              </div>
              <div className="relative" style={{ background: "linear-gradient(135deg, #115e59, #0c4a4a)" }}>
                <span className="absolute inset-0 flex items-center justify-center text-white/60 text-[13px] font-medium tracking-wide">
                  {flightBookingData?.destination_code || "ARR"}
                </span>
              </div>
            </div>
            <div className="p-3.5 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="font-semibold text-[14px] text-foreground truncate">
                    {flightBookingData?.origin || "Origin"} → {flightBookingData?.destination || "Destination"}
                  </p>
                </div>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {flightBookingData?.date
                    ? format(new Date(flightBookingData.date), "MMM d")
                    : "Date TBD"}
                  {flightBookingData?.traveler && ` · ${flightBookingData.traveler}`}
                </p>
              </div>
              {tripCountdown && (
                <span className="text-[12px] font-medium text-[#0D9488] border border-[#0D9488]/20 bg-[#0D9488]/5 rounded-full px-2.5 py-0.5 shrink-0">
                  in {tripCountdown} day{tripCountdown > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </button>
        )}

        {/* ─── DECISIONS & BOOKINGS — 2-column grid ─── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Decisions card */}
          <button
            onClick={() => navigate(`/app/trips/${tripId}/decisions`)}
            className="text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all active:scale-[0.98] hover:shadow-md"
          >
            <div className="h-[90px] relative" style={{ background: "linear-gradient(135deg, #d4a574, #c9a06a)" }}>
              <div className="absolute bottom-2 left-2 right-2 flex justify-center">
                <span className="text-white/50 text-[11px] font-medium uppercase tracking-wider">Destination</span>
              </div>
            </div>
            <div className="p-3">
              <p className="font-semibold text-[14px] text-foreground">Decisions</p>
              <p className="text-[12px] mt-0.5" style={{ color: decisionsBadge.color === "amber" ? "#D97706" : decisionsBadge.color === "teal" ? "#0D9488" : "#94A3B8" }}>
                {decisionsBadge.label === "Route confirmed" ? "Route confirmed" : decisionsBadge.label === "Not started" ? "Route pending" : decisionsBadge.label}
              </p>
            </div>
          </button>

          {/* Bookings card */}
          <button
            onClick={() => navigate(`/app/trips/${tripId}/bookings`)}
            className="text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all active:scale-[0.98] hover:shadow-md"
          >
            <div className="h-[90px] relative" style={{ background: "linear-gradient(135deg, #94a3b8, #7c8fa3)" }}>
              <div className="absolute bottom-2 left-2 right-2 flex justify-center">
                <span className="text-white/50 text-[11px] font-medium uppercase tracking-wider">Hotel</span>
              </div>
            </div>
            <div className="p-3">
              <p className="font-semibold text-[14px] text-foreground">Bookings</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">{bookingsSummary}</p>
            </div>
          </button>
        </div>

        {/* ─── ITINERARY CARD (if no AI plan) ─── */}
        {!hasPlan && (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/itinerary`)}
            className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 text-left transition-all active:scale-[0.98] hover:shadow-md"
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px] text-foreground">Itinerary</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {itineraryItems && itineraryItems.length > 0
                  ? `${itineraryItems.length} activit${itineraryItems.length > 1 ? "ies" : "y"} planned`
                  : "Nothing planned yet"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        )}

        {/* ─── EXPENSES CARD ─── */}
        <button
          onClick={() => navigate(`/app/trips/${tripId}/expenses`)}
          className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-left transition-all active:scale-[0.98] hover:shadow-md"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-[15px] text-foreground">Expenses</p>
            {expenses && expenses.length > 0 && (
              <span className="text-[13px] text-muted-foreground">{expenses.length} logged</span>
            )}
          </div>

          {expenses && expenses.length > 0 && userId ? (
            <>
              <p className="text-[12px] text-muted-foreground mb-0.5">Your balance</p>
              <p className={`text-[22px] font-bold ${myBalance < -0.01 ? "text-red-600" : myBalance > 0.01 ? "text-[#0D9488]" : "text-foreground"}`}>
                {fmtCurrency(Math.abs(myBalance), settlementCurrency)}
              </p>
              {myBalance < -0.01 && <p className="text-[11px] text-red-500 -mt-0.5">You owe</p>}
              {myBalance > 0.01 && <p className="text-[11px] text-[#0D9488] -mt-0.5">You're owed</p>}

              {/* Progress bar showing split */}
              {balances.length >= 2 && (
                <div className="mt-3">
                  <div className="h-2 rounded-full bg-gray-200 overflow-hidden flex">
                    {balances.map((b, i) => {
                      const total = balances.reduce((s, x) => s + Math.abs(x.balance), 0);
                      const pct = total > 0 ? (Math.abs(b.balance) / total) * 100 : 100 / balances.length;
                      return (
                        <div
                          key={b.userId}
                          className="h-full"
                          style={{
                            width: `${pct}%`,
                            background: b.userId === userId ? "#0D9488" : i === 1 ? "#374151" : "#94A3B8",
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1.5">
                    {balances.slice(0, 2).map((b) => {
                      const member = members?.find((m) => m.user_id === b.userId);
                      return (
                        <span key={b.userId} className="text-[11px] text-muted-foreground">
                          {member?.profile?.display_name || "Member"}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Contributor avatars */}
              {members && members.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex -space-x-1.5">
                    {members.slice(0, 4).map((m) => (
                      <Avatar key={m.user_id} className="h-6 w-6 ring-2 ring-white">
                        {m.profile?.avatar_url && <AvatarImage src={m.profile.avatar_url} />}
                        <AvatarFallback className="bg-primary text-primary-foreground text-[9px]">
                          {(m.profile?.display_name || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">No expenses logged yet</p>
          )}
        </button>

        {/* ─── PACKING LIST ─── */}
        <SharedItemsSection tripId={tripId} />
      </div>

      {/* Concierge Panel */}
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

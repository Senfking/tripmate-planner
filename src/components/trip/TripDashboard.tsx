import { useState, useCallback, useMemo, Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import {
  Sparkles, AlertTriangle, Vote, FileText, Receipt, ChevronRight,
  Plane, GripVertical,
} from "lucide-react";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { calcNetBalances } from "@/lib/settlementCalc";
import { fetchEurRates, crossCalculateRates } from "@/lib/fetchCrossRates";
import { SharedItemsSection } from "./SharedItemsSection";
import { TripBuilderFlow } from "@/components/trip-builder/TripBuilderFlow";
import { Button } from "@/components/ui/button";
import { ConciergePanel } from "@/components/concierge/ConciergePanel";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


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

  // Itinerary card visibility: hide if AI plan exists OR no items exist
  const showItinerary = !hasPlan && (itineraryItems?.length ?? 0) > 0;

  // ─── Sortable section ordering ───
  const STORAGE_KEY = `dashboard-order-${tripId}`;
  const DEFAULT_ORDER = ["expenses", "flights", "decisions-bookings", "itinerary", "packing"];

  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        // Merge: keep saved order, append any new sections
        const merged = parsed.filter((s) => DEFAULT_ORDER.includes(s));
        for (const s of DEFAULT_ORDER) {
          if (!merged.includes(s)) merged.push(s);
        }
        return merged;
      }
    } catch { /* ignore */ }
    return DEFAULT_ORDER;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSectionOrder((prev) => {
      const oldIdx = prev.indexOf(active.id as string);
      const newIdx = prev.indexOf(over.id as string);
      const next = arrayMove(prev, oldIdx, newIdx);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [STORAGE_KEY]);

  // Section renderers
  const renderSection = (id: string) => {
    switch (id) {
      case "expenses":
        return (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/expenses`)}
            className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-left transition-all active:scale-[0.98] hover:shadow-md"
          >
            {expenses && expenses.length > 0 && userId ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: myBalance < -0.01 ? "#FEF2F2" : myBalance > 0.01 ? "#F0FDFA" : "#F8FAFC" }}>
                      <Receipt className="h-4 w-4" style={{ color: myBalance < -0.01 ? "#EF4444" : myBalance > 0.01 ? "#0D9488" : "#64748B" }} />
                    </div>
                    <span className="font-semibold text-[15px] text-foreground">Expenses</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className={`text-[28px] font-bold tracking-tight leading-none ${myBalance < -0.01 ? "text-red-600" : myBalance > 0.01 ? "text-[#0D9488]" : "text-foreground"}`}>
                  {fmtCurrency(Math.abs(myBalance), settlementCurrency)}
                </p>
                {myBalance < -0.01 && <p className="text-[13px] font-medium text-red-500 mt-1">You owe</p>}
                {myBalance > 0.01 && <p className="text-[13px] font-medium text-[#0D9488] mt-1">You're owed</p>}
                {Math.abs(myBalance) <= 0.01 && <p className="text-[13px] font-medium text-muted-foreground mt-1">All settled up</p>}
                <p className="text-[12px] text-muted-foreground mt-2">
                  {fmtCurrency(totalSpent, settlementCurrency)} total · {expenses.length} expense{expenses.length !== 1 ? "s" : ""}
                </p>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-[#F0FDFA] flex items-center justify-center">
                    <Receipt className="h-4 w-4 text-[#0D9488]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[15px] text-foreground">Expenses</p>
                    <p className="text-[13px] text-muted-foreground">No expenses logged yet</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </button>
        );

      case "flights":
        if (!nextFlight) return null;
        return (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/bookings`)}
            className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all active:scale-[0.98] hover:shadow-md"
          >
            <div className="grid grid-cols-2 h-[90px]">
              <div className="relative" style={{ background: "linear-gradient(135deg, #0D9488 0%, #0a7c72 100%)" }}>
                <span className="absolute inset-0 flex items-center justify-center text-white/80 text-[15px] font-bold tracking-widest">
                  {flightBookingData?.origin_code || "DEP"}
                </span>
              </div>
              <div className="relative" style={{ background: "linear-gradient(135deg, #065f58 0%, #044e48 100%)" }}>
                <span className="absolute inset-0 flex items-center justify-center text-white/80 text-[15px] font-bold tracking-widest">
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
                  {flightBookingData?.date ? format(new Date(flightBookingData.date), "MMM d") : "Date TBD"}
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
        );

      case "decisions-bookings":
        return (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate(`/app/trips/${tripId}/decisions`)}
              className="text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all active:scale-[0.98] hover:shadow-md"
            >
              <div className="h-[80px] relative" style={{ background: "linear-gradient(135deg, #0D9488 0%, #0a7c72 50%, #065f58 100%)" }}>
                <Vote className="absolute bottom-2.5 right-2.5 h-5 w-5 text-white/20" />
              </div>
              <div className="p-3">
                <p className="font-semibold text-[14px] text-foreground">Decisions</p>
                <p className="text-[12px] mt-0.5" style={{ color: decisionsBadge.color === "amber" ? "#D97706" : decisionsBadge.color === "teal" ? "#0D9488" : "#94A3B8" }}>
                  {decisionsBadge.label === "Route confirmed" ? "Route confirmed" : decisionsBadge.label === "Not started" ? "Route pending" : decisionsBadge.label}
                </p>
              </div>
            </button>
            <button
              onClick={() => navigate(`/app/trips/${tripId}/bookings`)}
              className="text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all active:scale-[0.98] hover:shadow-md"
            >
              <div className="h-[80px] relative" style={{ background: "linear-gradient(135deg, #0a7c72 0%, #065f58 50%, #044e48 100%)" }}>
                <FileText className="absolute bottom-2.5 right-2.5 h-5 w-5 text-white/20" />
              </div>
              <div className="p-3">
                <p className="font-semibold text-[14px] text-foreground">Bookings</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">{bookingsSummary}</p>
              </div>
            </button>
          </div>
        );

      case "itinerary":
        if (!showItinerary) return null;
        return (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/itinerary`)}
            className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 text-left transition-all active:scale-[0.98] hover:shadow-md"
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px] text-foreground">Itinerary</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {itineraryItems!.length} activit{itineraryItems!.length > 1 ? "ies" : "y"} planned
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        );

      case "packing":
        return <SharedItemsSection tripId={tripId} />;

      default:
        return null;
    }
  };

  // Filter out sections that render null
  const visibleOrder = sectionOrder.filter((id) => {
    if (id === "flights" && !nextFlight) return false;
    if (id === "itinerary" && !showItinerary) return false;
    return true;
  });

  return (
    <div className="animate-fade-in-card pb-16">
      {builderOpen && (
        <BuilderWrapper tripId={tripId} onClose={() => toggleBuilder(false)} />
      )}

      <div className="px-4 md:max-w-[700px] md:mx-auto md:px-8 flex flex-col gap-3">

        {/* ─── JUNTO AI BLOCK (pinned) ─── */}
        <div
          className="relative overflow-hidden p-5"
          style={{
            background: "linear-gradient(135deg, #0D9488 0%, #0a7c72 40%, #065f58 100%)",
            borderRadius: 20,
          }}
        >
          <svg className="absolute top-4 right-5 opacity-[0.12]" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 0L13.5 9L22 6L15 12L24 12L15 14.5L22 18L13.5 15L12 24L10.5 15L2 18L9 14.5L0 12L9 12L2 6L10.5 9Z" fill="white" />
          </svg>
          <svg className="absolute top-10 right-20 opacity-[0.08]" width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M12 0L13.5 9L22 6L15 12L24 12L15 14.5L22 18L13.5 15L12 24L10.5 15L2 18L9 14.5L0 12L9 12L2 6L10.5 9Z" fill="white" />
          </svg>
          <svg className="absolute bottom-6 right-8 opacity-[0.15]" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 0L13.5 9L22 6L15 12L24 12L15 14.5L22 18L13.5 15L12 24L10.5 15L2 18L9 14.5L0 12L9 12L2 6L10.5 9Z" fill="white" />
          </svg>

          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="h-4 w-4 text-white/90" />
            <span className="text-white/90 text-[13px] font-semibold tracking-wide">Junto AI</span>
          </div>

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

        {/* ─── REORDERABLE SECTIONS ─── */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
            {visibleOrder.map((id) => (
              <SortableSection key={id} id={id}>
                {renderSection(id)}
              </SortableSection>
            ))}
          </SortableContext>
        </DndContext>
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

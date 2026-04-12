import { useState, useCallback, useMemo, Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import {
  Sparkles, AlertTriangle, Vote, FileText, Receipt, ChevronRight,
  Plane,
} from "lucide-react";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { calcNetBalances } from "@/lib/settlementCalc";
import { fetchEurRates, crossCalculateRates } from "@/lib/fetchCrossRates";
import { SharedItemsSection } from "./SharedItemsSection";
import { resolvePhoto } from "@/lib/tripPhoto";
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

const codeToCity: Record<string, string> = {
  DPS: "Bali", DXB: "Dubai", JFK: "New York", LAX: "Los Angeles", LHR: "London",
  CDG: "Paris", NRT: "Tokyo", SIN: "Singapore", BKK: "Bangkok", FCO: "Rome",
  BCN: "Barcelona", AMS: "Amsterdam", IST: "Istanbul", HKG: "Hong Kong",
  SYD: "Sydney", SFO: "San Francisco", MIA: "Miami", ORD: "Chicago",
  ATL: "Atlanta", SEA: "Seattle", BOS: "Boston", ICN: "Seoul", DEL: "Delhi",
  BOM: "Mumbai", KUL: "Kuala Lumpur", MEX: "Mexico City", GRU: "São Paulo",
  EZE: "Buenos Aires", CPT: "Cape Town", CAI: "Cairo", DOH: "Doha",
  LIS: "Lisbon", ATH: "Athens", VIE: "Vienna", PRG: "Prague", ZRH: "Zurich",
};

function SortableSection({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
      {children}
    </div>
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
  coverPhoto?: string;
  onBuilderToggle?: (open: boolean) => void;
  onShareOpen?: () => void;
}

export function TripDashboard({ tripId, routeLocked, settlementCurrency, myRole, startDate, endDate, tripName, coverPhoto, onBuilderToggle, onShareOpen }: TripDashboardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const [builderOpen, setBuilderOpen] = useState(false);
  const [conciergeOpen, setConciergeOpen] = useState(false);

  // ─── Sortable section ordering (hooks must be before early returns) ───
  const STORAGE_KEY = `dashboard-order-${tripId}`;
  const DEFAULT_ORDER = ["ai-hero", "expenses", "flights", "decisions", "bookings", "itinerary", "packing"];

  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        let parsed = JSON.parse(saved) as string[];
        // Migrate old combined key to separate keys
        const comboIdx = parsed.indexOf("decisions-bookings");
        if (comboIdx !== -1) {
          parsed.splice(comboIdx, 1, "decisions", "bookings");
        }
        const merged = parsed.filter((s) => DEFAULT_ORDER.includes(s));
        // Insert new sections at their default position instead of appending
        for (let i = 0; i < DEFAULT_ORDER.length; i++) {
          const s = DEFAULT_ORDER[i];
          if (!merged.includes(s)) {
            // Find the best insertion point based on default order neighbors
            const prevInDefault = DEFAULT_ORDER[i - 1];
            const insertAfter = prevInDefault ? merged.indexOf(prevInDefault) : -1;
            merged.splice(insertAfter + 1, 0, s);
          }
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

  const { data: aiPlanData } = useQuery({
    queryKey: ["trip-ai-plan", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_trip_plans")
        .select("id, result")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as { id: string; result: any } | undefined) ?? null;
    },
    enabled: !!userId,
  });

  const hasPlan = !!aiPlanData;

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
      const { data, error } = await supabase.from("attachments").select("id, type, created_by, booking_data, og_image_url").eq("trip_id", tripId);
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
      const { data, error } = await supabase.from("expenses").select("id, payer_id, amount, currency, category, expense_splits(user_id, share_amount)").eq("trip_id", tripId);
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
      id: e.id, payer_id: e.payer_id, amount: Number(e.amount), currency: e.currency, category: e.category,
      splits: (e.expense_splits ?? []).map((s) => ({ user_id: s.user_id, share_amount: Number(s.share_amount) })),
    }));
    const result = calcNetBalances(mapped, settlementCurrency, settlementCurrency, rates ?? {}, {});
    balances = result.balances;
    const myBal = balances.find((b) => b.userId === userId);
    myBalance = myBal?.balance ?? 0;
    totalSpent = mapped.reduce((sum, e) => {
      if (e.category === "settlement") return sum;
      if (e.currency === settlementCurrency) return sum + e.amount;
      if (rates && rates[e.currency]) return sum + e.amount / rates[e.currency];
      return sum;
    }, 0);
  }

  // Flight card data — find the next upcoming flight by date
  const flights = (attachments ?? []).filter((a) => a.type === "flight");
  const sortedFlights = flights
    .map((f) => ({ ...f, bd: f.booking_data as any }))
    .filter((f) => f.bd?.flight_date || f.bd?.departure)
    .sort((a, b) => {
      const dateA = a.bd?.flight_date || "";
      const dateB = b.bd?.flight_date || "";
      return dateA.localeCompare(dateB);
    });
  const upcomingFlight = sortedFlights.find((f) => {
    const d = f.bd?.flight_date;
    return d ? new Date(d) >= today : true;
  }) ?? sortedFlights[0] ?? null;
  const nextFlight = upcomingFlight || (flights.length > 0 ? flights[0] : null);
  const flightBookingData = (nextFlight as any)?.bd ?? (nextFlight?.booking_data as any);

  // Extract airport codes from text like "Dubai (DXB)"
  const extractCode = (text: string | undefined) => {
    if (!text) return null;
    const m = text.match(/\(([A-Z]{3})\)/);
    return m ? m[1] : null;
  };

  // OG image for bookings card
  const firstOgImage = (attachments ?? []).find((a) => a.og_image_url)?.og_image_url;

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


  // Section renderers
  const renderSection = (id: string) => {
    switch (id) {
      case "ai-hero": {
        let planStats: { days: number; cities: number; activities: number } | null = null;
        let todayActivities: string[] = [];
        let dayOfTrip = 0;
        let totalTripDays = 0;
        const tripIsLive = startDate && endDate
          ? new Date(todayStr) >= new Date(startDate) && new Date(todayStr) <= new Date(endDate)
          : false;

        if (aiPlanData?.result) {
          try {
            const result = aiPlanData.result as any;
            const destinations = result.destinations || [];
            const allDays = destinations.flatMap((d: any) => d.days || []);
            const allActivities = allDays.flatMap((d: any) => d.activities || []);
            const uniqueCities = new Set(destinations.map((d: any) => d.name));
            planStats = { days: allDays.length, cities: uniqueCities.size, activities: allActivities.length };
            if (tripIsLive) {
              const todayDay = allDays.find((d: any) => d.date === todayStr);
              if (todayDay?.activities) {
                todayActivities = todayDay.activities.map((a: any) => a.title).filter(Boolean);
              }
              const tripStart = new Date(startDate!);
              const tripEnd = new Date(endDate!);
              dayOfTrip = Math.floor((new Date(todayStr).getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              totalTripDays = Math.floor((tripEnd.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            }
          } catch { /* fallback */ }
        }

        const isLiveWithPlan = hasPlan && tripIsLive;
        const isUpcomingWithPlan = hasPlan && !tripIsLive;

        return (
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
              {isLiveWithPlan && dayOfTrip > 0 && totalTripDays > 0 && (
                <span className="ml-auto text-white/60 text-[12px] font-medium">
                  Day {dayOfTrip} of {totalTripDays}
                </span>
              )}
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => { if (hasPlan) navigate(`/app/trips/${tripId}/plan`); else toggleBuilder(true); }}
                className="text-left rounded-2xl p-3.5 transition-all active:scale-[0.97]"
                style={{
                  flex: isLiveWithPlan ? 1.2 : 1,
                  background: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                {isLiveWithPlan ? (
                  <>
                    <p className="text-white/60 text-[11px] font-medium">Today</p>
                    <p className="text-white font-semibold text-[14px] leading-tight mt-0.5 line-clamp-2">
                      {todayActivities.length > 0 ? todayActivities.join(", ") : "No activities today"}
                    </p>
                    <p className="text-white/50 text-[11px] mt-1.5">View full plan →</p>
                  </>
                ) : isUpcomingWithPlan ? (
                  <>
                    <p className="text-white font-semibold text-[14px] leading-tight">Your plan</p>
                    <p className="text-white/70 text-[12px] mt-1 leading-snug">
                      {planStats
                        ? `${planStats.days} day${planStats.days !== 1 ? "s" : ""} · ${planStats.cities} cit${planStats.cities !== 1 ? "ies" : "y"} · ${planStats.activities} activities`
                        : "View your AI itinerary"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-white font-semibold text-[14px] leading-tight">Plan my trip</p>
                    <p className="text-white/70 text-[12px] mt-1 leading-snug">Full itinerary in seconds</p>
                  </>
                )}
              </button>

              <button
                onClick={() => setConciergeOpen(true)}
                className="text-left rounded-2xl p-3.5 transition-all active:scale-[0.97]"
                style={{
                  flex: isLiveWithPlan ? 0.8 : 1,
                  background: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <p className="text-white font-semibold text-[14px] leading-tight">What to do?</p>
                <p className="text-white/70 text-[12px] mt-1 leading-snug">
                  {isLiveWithPlan ? "Nearby spots" : "Restaurants, bars, spots"}
                </p>
              </button>
            </div>
          </div>
        );
      }
      case "expenses": {
        // Find who you owe the most to
        const oweTo = balances.filter((b) => b.userId !== userId && b.balance > 0.01);
        const topCreditor = oweTo.length > 0 ? oweTo.sort((a, b) => b.balance - a.balance)[0] : null;
        const creditorName = topCreditor ? members?.find((m) => m.user_id === topCreditor.userId)?.profile?.display_name : null;

        return (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/expenses`)}
            className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.98] hover:shadow-lg relative"
            style={{
              background: "linear-gradient(150deg, #0f766e 0%, #0D9488 45%, #0891b2 100%)",
              boxShadow: "0 4px 16px rgba(13,148,136,0.25)",
            }}
          >
            {/* Glass shine */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.0) 50%, rgba(255,255,255,0.04) 100%)" }}
            />

            {expenses && expenses.length > 0 && userId ? (
              <div className="relative p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{
                    color: myBalance < -0.01 ? "#ff6b6b" : myBalance > 0.01 ? "#2dd4a0" : "rgba(255,255,255,0.5)",
                  }}>
                    {myBalance < -0.01 ? "You owe" : myBalance > 0.01 ? "You're owed" : "All settled"}
                  </p>
                  <p className="text-[26px] font-extrabold tracking-tight leading-none mt-1 text-white">
                    {fmtCurrency(Math.abs(myBalance), settlementCurrency)}
                  </p>
                  {myBalance < -0.01 && creditorName && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-orange-400/15 px-2 py-0.5 text-[10px] font-semibold text-orange-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-300" />
                      to {creditorName}
                    </span>
                  )}
                  {myBalance > 0.01 && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      {expenses.length} expense{expenses.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {Math.abs(myBalance) <= 0.01 && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                      {expenses.length} expense{expenses.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-white/40 shrink-0" />
              </div>
            ) : (
              <div className="relative p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[14px] text-white">Expenses</p>
                  <p className="text-[11px] text-white/50 mt-0.5">Track & split costs</p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/40" />
              </div>
            )}
          </button>
        );
      }

      case "flights": {
        if (!nextFlight) return null;
        const depCode = extractCode(flightBookingData?.departure) || flightBookingData?.origin_code || "DEP";
        const arrCode = extractCode(flightBookingData?.destination) || flightBookingData?.destination_code || "ARR";
        const depCity = flightBookingData?.departure?.replace(/\s*\([A-Z]{3}\)/, "") || codeToCity[depCode] || "Origin";
        const arrCity = flightBookingData?.destination?.replace(/\s*\([A-Z]{3}\)/, "") || codeToCity[arrCode] || "Destination";
        const flightDateStr = flightBookingData?.flight_date || flightBookingData?.date;
        const flightDate = flightDateStr ? new Date(flightDateStr) : null;
        const flightCountdown = flightDate ? Math.ceil((flightDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
        const provider = flightBookingData?.provider;
        const depCityClean = depCity.split(",")[0].replace(/\s*\([A-Z]{3}\)/, "").trim();
        const arrCityClean = arrCity.split(",")[0].replace(/\s*\([A-Z]{3}\)/, "").trim();
        const depImg = resolvePhoto(depCityClean, [depCityClean]);
        const arrImg = resolvePhoto(arrCityClean, [arrCityClean]);

        return (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/bookings`)}
            className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all active:scale-[0.98] hover:shadow-md"
          >
            <div className="grid grid-cols-2 h-[90px]">
              <div className="relative overflow-hidden">
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0D9488 0%, #0a7c72 100%)" }} />
                <img src={depImg} alt={depCityClean} className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                <div className="absolute inset-0 bg-black/40" />
                <span className="absolute inset-0 flex items-center justify-center text-white text-[18px] font-bold tracking-widest drop-shadow-md">
                  {depCode}
                </span>
              </div>
              <div className="relative overflow-hidden">
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #065f58 0%, #044e48 100%)" }} />
                <img src={arrImg} alt={arrCityClean} className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                <div className="absolute inset-0 bg-black/50" />
                <span className="absolute inset-0 flex items-center justify-center text-white text-[18px] font-bold tracking-widest drop-shadow-md">
                  {arrCode}
                </span>
              </div>
            </div>
            <div className="p-3.5 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="font-semibold text-[14px] text-foreground truncate">
                    {depCity} → {arrCity}
                  </p>
                </div>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {flightDate ? format(flightDate, "MMM d") : "Date TBD"}
                  {provider && ` · ${provider}`}
                </p>
              </div>
              {flightCountdown && flightCountdown > 0 && (
                <span className="text-[12px] font-medium text-[#0D9488] border border-[#0D9488]/20 bg-[#0D9488]/5 rounded-full px-2.5 py-0.5 shrink-0">
                  in {flightCountdown}d
                </span>
              )}
            </div>
          </button>
        );
      }

      case "decisions":
        return (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/decisions`)}
            className="isolate w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-[transform,box-shadow] active:scale-[0.98] hover:shadow-md"
          >
            <div className="h-[80px] relative overflow-hidden" style={{ background: "#f0fdfa" }}>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 80" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                <g transform="translate(155,40)" opacity="0.12" fill="#0D9488">
                  <polygon points="0,-18 4,-4 0,-8 -4,-4" />
                  <polygon points="0,18 4,4 0,8 -4,4" />
                  <polygon points="-18,0 -4,-4 -8,0 -4,4" />
                  <polygon points="18,0 4,-4 8,0 4,4" />
                  <circle cx="0" cy="0" r="2" />
                </g>
                <g opacity="0.1" fill="#0D9488">
                  <path d="M30 55 a6 6 0 1 1 0-8 a6 6 0 0 1 0 8 L30 65Z" />
                  <path d="M70 25 a5 5 0 1 1 0-7 a5 5 0 0 1 0 7 L70 33Z" />
                  <path d="M120 50 a4 4 0 1 1 0-5.5 a4 4 0 0 1 0 5.5 L120 56Z" />
                </g>
                <path d="M25 58 Q50 20 75 28 T125 52 T160 38" fill="none" stroke="#0D9488" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.15" />
                <circle cx="15" cy="15" r="1.5" fill="#0D9488" opacity="0.08" />
                <circle cx="95" cy="12" r="2" fill="#0D9488" opacity="0.06" />
                <circle cx="50" cy="68" r="1.5" fill="#0D9488" opacity="0.08" />
                <circle cx="175" cy="65" r="2" fill="#0D9488" opacity="0.06" />
              </svg>
              <Vote className="absolute bottom-2.5 right-2.5 h-5 w-5 text-[#0D9488]/30" />
            </div>
            <div className="p-3">
              <p className="font-semibold text-[14px] text-foreground">Decisions</p>
              <p className="text-[12px] mt-0.5" style={{ color: decisionsBadge.color === "amber" ? "#D97706" : decisionsBadge.color === "teal" ? "#0D9488" : "#94A3B8" }}>
                {decisionsBadge.label === "Route confirmed" ? "Route confirmed" : decisionsBadge.label === "Not started" ? "Route pending" : decisionsBadge.label}
              </p>
            </div>
          </button>
        );

      case "bookings":
        return (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/bookings`)}
            className="isolate w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-[transform,box-shadow] active:scale-[0.98] hover:shadow-md"
          >
            <div className="h-[80px] relative overflow-hidden" style={{ background: "#f0fdfa" }}>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 80" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                <g transform="translate(140,35)" opacity="0.1">
                  <rect x="-28" y="-16" width="56" height="32" rx="4" fill="#0D9488" />
                  <line x1="-10" y1="-16" x2="-10" y2="16" stroke="#f0fdfa" strokeWidth="1" strokeDasharray="2 2" />
                  <circle cx="-10" cy="-16" r="3" fill="#f0fdfa" />
                  <circle cx="-10" cy="16" r="3" fill="#f0fdfa" />
                  <rect x="-24" y="-8" width="10" height="2" rx="1" fill="#f0fdfa" opacity="0.6" />
                  <rect x="-24" y="-3" width="8" height="2" rx="1" fill="#f0fdfa" opacity="0.4" />
                  <rect x="-24" y="2" width="12" height="2" rx="1" fill="#f0fdfa" opacity="0.3" />
                </g>
                <g opacity="0.08" fill="#0D9488">
                  <rect x="20" y="20" width="24" height="30" rx="2" />
                  <rect x="24" y="26" width="12" height="1.5" rx="0.75" fill="#f0fdfa" />
                  <rect x="24" y="30" width="16" height="1.5" rx="0.75" fill="#f0fdfa" />
                  <rect x="24" y="34" width="10" height="1.5" rx="0.75" fill="#f0fdfa" />
                </g>
                <g opacity="0.06" fill="#0D9488">
                  <rect x="75" y="45" width="20" height="26" rx="2" />
                </g>
                <g transform="translate(100,20)" opacity="0.09" fill="#0D9488">
                  <rect x="0" y="0" width="36" height="18" rx="3" />
                  <circle cx="12" cy="0" r="2.5" fill="#f0fdfa" />
                  <circle cx="12" cy="18" r="2.5" fill="#f0fdfa" />
                </g>
                <circle cx="60" cy="15" r="1.5" fill="#0D9488" opacity="0.07" />
                <circle cx="170" cy="70" r="2" fill="#0D9488" opacity="0.06" />
                <circle cx="15" cy="65" r="1.5" fill="#0D9488" opacity="0.05" />
              </svg>
              <FileText className="absolute bottom-2.5 right-2.5 h-5 w-5 text-[#0D9488]/30" />
            </div>
            <div className="p-3">
              <p className="font-semibold text-[14px] text-foreground">Bookings</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">{bookingsSummary}</p>
            </div>
          </button>
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


        {/* ─── REORDERABLE SECTIONS ─── */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
            {visibleOrder.map((id) => {
              if (id === "decisions" || id === "bookings") {
                const otherId = id === "decisions" ? "bookings" : "decisions";
                const isFirst = visibleOrder.indexOf(id) < visibleOrder.indexOf(otherId);
                if (!isFirst) return null; // second card rendered by the first
                return (
                  <div key="decisions-bookings-row" className="grid grid-cols-2 gap-3">
                    <SortableSection id={id}>{renderSection(id)}</SortableSection>
                    <SortableSection id={otherId}>{renderSection(otherId)}</SortableSection>
                  </div>
                );
              }
              return (
                <SortableSection key={id} id={id}>{renderSection(id)}</SortableSection>
              );
            })}
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

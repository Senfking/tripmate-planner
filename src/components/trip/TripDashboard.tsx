import { useState, useCallback, useMemo, useRef, useEffect, Component, type ReactNode } from "react";
import decisionsCardJpg from "@/assets/decisions-card.jpg";
import decisionsCardWebp from "@/assets/decisions-card.webp";
import bookingsCardJpg from "@/assets/bookings-card.jpg";
import bookingsCardWebp from "@/assets/bookings-card.webp";

// Preload + decode card images once per session — kept in the browser image cache
// so subsequent mounts (route changes, edit-mode toggles, reorders) display instantly.
if (typeof window !== "undefined") {
  const supportsWebp = document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");
  [supportsWebp ? decisionsCardWebp : decisionsCardJpg, supportsWebp ? bookingsCardWebp : bookingsCardJpg].forEach((src) => {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    if ("decode" in img) img.decode().catch(() => { /* ignore */ });
  });
}
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import {
  Sparkles, AlertTriangle, Vote, FileText, Receipt, ChevronRight,
  Plane, GripVertical, Check, ArrowUpDown,
} from "lucide-react";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { calcNetBalances, convertAmount } from "@/lib/settlementCalc";
import { fetchEurRates, crossCalculateRates } from "@/lib/fetchCrossRates";
import { SharedItemsSection } from "./SharedItemsSection";
import { TravellersSection } from "./TravellersSection";
import { resolvePhoto } from "@/lib/tripPhoto";
import { TripBuilderFlow } from "@/components/trip-builder/TripBuilderFlow";
import { Button } from "@/components/ui/button";
import { ConciergePanel } from "@/components/concierge/ConciergePanel";
import { CONCIERGE_ENABLED } from "@/lib/featureFlags";
import { captureReactError } from "@/lib/sentry";
import {
  DndContext, rectIntersection, PointerSensor, TouchSensor,
  useSensor, useSensors, DragOverlay, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


// Error boundary for the trip builder
class BuilderErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean; error: Error | null; componentStack: string | null }
> {
  constructor(props: { children: ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("[BuilderErrorBoundary] Caught error:", err);
    console.error("[BuilderErrorBoundary] name:", err.name);
    console.error("[BuilderErrorBoundary] message:", err.message);
    console.error("[BuilderErrorBoundary] stack:\n" + (err.stack ?? "(no stack)"));
    console.error("[BuilderErrorBoundary] componentStack:" + (info.componentStack ?? "(none)"));
    captureReactError(err, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }
  render() {
    if (this.state.hasError) {
      const { error, componentStack } = this.state;
      return (
        <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6">
          <div className="text-center max-w-md space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">The trip builder encountered an error.</p>
            {error && (
              <details className="rounded-lg border border-border bg-muted/30 p-3 text-left text-xs">
                <summary className="cursor-pointer font-medium select-none break-words">
                  {error.name}: {error.message}
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
{error.stack || "(no stack)"}
{componentStack ? `\n--- Component stack ---${componentStack}` : ""}
                </pre>
              </details>
            )}
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

const HORIZONTAL_IDS = new Set(["decisions", "bookings"]);

function SortableSection({ id, editMode, children }: { id: string; editMode: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editMode,
    animateLayoutChanges: () => true,
  });

  // Use dnd-kit's CSS.Transform for proper sortable animation of OTHER items.
  // The dragged item itself is rendered in DragOverlay, so we hide it here.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 220ms cubic-bezier(0.2, 0, 0, 1)",
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${editMode && !isDragging ? "animate-wiggle" : ""}`}
      {...(editMode ? attributes : {})}
    >
      {children}
      {editMode && (
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          type="button"
          className="absolute inset-0 z-20 rounded-2xl cursor-grab active:cursor-grabbing touch-none ring-1 ring-foreground/10"
          aria-label="Drag to reorder"
        />
      )}
    </div>
  );
}

// Lightweight static clone for the DragOverlay (no sortable hooks)
function DragPreview({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative rounded-2xl"
      style={{
        boxShadow: "0 20px 50px -10px rgba(0,0,0,0.25), 0 8px 20px -8px rgba(0,0,0,0.18)",
        transform: "scale(1.02)",
        cursor: "grabbing",
      }}
    >
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
  const [editMode, setEditMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // ─── Sortable section ordering (hooks must be before early returns) ───
  const STORAGE_KEY = `dashboard-order-${tripId}`;
  const DEFAULT_ORDER = ["ai-hero", "expenses", "flights", "travellers", "decisions", "bookings", "itinerary", "packing"];

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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 80, tolerance: 6 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.(8); } catch { /* ignore */ }
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
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

  const handleDragCancel = useCallback(() => setActiveId(null), []);

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

  // Track when user last viewed this trip dashboard to compute "new since last visit".
  const lastSeenKey = `trip-last-seen:${tripId}`;
  const lastSeenAt = useMemo(() => {
    if (typeof window === "undefined") return new Date(0).toISOString();
    return localStorage.getItem(lastSeenKey) ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }, [lastSeenKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;
    // Stamp on unmount so the *next* visit reflects activity since now.
    return () => {
      try { localStorage.setItem(lastSeenKey, new Date().toISOString()); } catch { /* ignore */ }
    };
  }, [lastSeenKey, userId]);

  // Group activity since last visit (comments + ideas + plan reactions).
  const { data: groupActivity } = useQuery({
    queryKey: ["trip-group-activity", tripId, lastSeenAt],
    queryFn: async () => {
      const [commentsRes, planCommentsRes, ideasRes] = await Promise.all([
        supabase.from("comments").select("id", { count: "exact", head: true })
          .eq("trip_id", tripId).gt("created_at", lastSeenAt).neq("user_id", userId ?? ""),
        (supabase.from("plan_activity_comments" as any) as any)
          .select("id", { count: "exact", head: true })
          .gt("created_at", lastSeenAt).neq("user_id", userId ?? "")
          .eq("plan_id", aiPlanData?.id ?? "00000000-0000-0000-0000-000000000000"),
        (supabase.from("trip_ideas" as any) as any)
          .select("id", { count: "exact", head: true })
          .eq("trip_id", tripId).gt("created_at", lastSeenAt).neq("created_by", userId ?? ""),
      ]);
      return {
        comments: (commentsRes.count ?? 0) + (planCommentsRes.count ?? 0),
        ideas: ideasRes.count ?? 0,
      };
    },
    enabled: !!userId && !!tripId,
    staleTime: 30_000,
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
      const { data, error } = await supabase.from("expenses").select("id, payer_id, amount, currency, category, fx_rate, fx_base, expense_splits(user_id, share_amount)").eq("trip_id", tripId);
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
    queryKey: ["members", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, role, joined_at, attendance_status")
        .eq("trip_id", tripId)
        .order("joined_at");
      if (error) throw error;
      const userIds = data.map((m) => m.user_id);
      const { data: profiles } = await supabase.rpc("get_public_profiles", { _user_ids: userIds });
      const profileMap = new Map(profiles?.map((p) => [p.id, { name: p.display_name || "Member", avatar: p.avatar_url }]) ?? []);
      return data.map((m) => ({
        userId: m.user_id,
        displayName: profileMap.get(m.user_id)?.name || "Member",
        avatarUrl: profileMap.get(m.user_id)?.avatar || null,
        role: m.role,
        joinedAt: m.joined_at,
        attendanceStatus: (m as any).attendance_status ?? "pending",
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
    const mapped = expenses.map((e: any) => ({
      id: e.id, payer_id: e.payer_id, amount: Number(e.amount), currency: e.currency, category: e.category,
      fx_rate: e.fx_rate != null ? Number(e.fx_rate) : null,
      fx_base: e.fx_base ?? null,
      splits: (e.expense_splits ?? []).map((s: any) => ({ user_id: s.user_id, share_amount: Number(s.share_amount) })),
    }));
    const result = calcNetBalances(mapped, settlementCurrency, settlementCurrency, rates ?? {}, {});
    balances = result.balances;
    const myBal = balances.find((b) => b.userId === userId);
    myBalance = myBal?.balance ?? 0;
    totalSpent = mapped.reduce((sum, e) => {
      if (e.category === "settlement") return sum;
      const converted = convertAmount(e.amount, e.currency, settlementCurrency, settlementCurrency, rates ?? {}, { fx_rate: e.fx_rate, fx_base: e.fx_base });
      return converted != null ? sum + converted : sum;
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

        const handleClick = () => {
          if (hasPlan) navigate(`/app/trips/${tripId}/plan`);
          else toggleBuilder(true);
        };

        return (
          <button
            onClick={handleClick}
            className="group relative w-full text-left overflow-hidden transition-all active:scale-[0.99]"
            style={{
              background: "linear-gradient(135deg, #0f766e 0%, #0D9488 55%, #0891b2 100%)",
              borderRadius: 24,
              boxShadow: "0 8px 28px -8px rgba(13,148,136,0.45), 0 2px 6px rgba(13,148,136,0.18)",
            }}
          >
            {/* Soft radial highlight */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 55%)",
              }}
            />
            {/* Subtle grain */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
              }}
            />
            {/* Decorative orb */}
            <div
              className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)",
              }}
            />

            <div className="relative p-3.5">
              {/* Header */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-white/90" />
                  <span className="text-white text-[10.5px] font-semibold uppercase tracking-[0.16em]">
                    Junto AI
                  </span>
                </div>
                {isLiveWithPlan && dayOfTrip > 0 && totalTripDays > 0 && (
                  <span className="text-white/75 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                    Day {dayOfTrip}/{totalTripDays}
                  </span>
                )}
              </div>

              {/* Body */}
              {isLiveWithPlan ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white/65 text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5">
                      Today
                    </p>
                    <p className="text-white font-semibold text-[15px] leading-snug line-clamp-2">
                      {todayActivities.length > 0
                        ? todayActivities.join(" · ")
                        : "Free day — explore at your pace"}
                    </p>
                  </div>
                  <span className="shrink-0 text-white/85 text-[12px] font-medium">View →</span>
                </div>
              ) : isUpcomingWithPlan ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold text-[15px] leading-tight tracking-tight mb-2">
                      Your trip plan is ready
                    </p>
                    {planStats && (
                      <div className="flex items-center gap-3 text-white/85">
                        {[
                          { value: planStats.days, label: planStats.days === 1 ? "day" : "days" },
                          { value: planStats.cities, label: planStats.cities === 1 ? "city" : "cities" },
                          { value: planStats.activities, label: "activities" },
                        ].map((stat, i) => (
                          <div key={i} className="flex items-baseline gap-1">
                            <span className="text-white font-bold text-[15px] leading-none tabular-nums">
                              {stat.value}
                            </span>
                            <span className="text-white/70 text-[11px] font-medium">
                              {stat.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-white/85 text-[12px] font-medium">Open →</span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-[15px] leading-tight tracking-tight">
                      Plan this trip with AI
                    </p>
                    <p className="text-white/75 text-[12px] mt-0.5 leading-snug">
                      Full itinerary in seconds.
                    </p>
                  </div>
                  <span
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11.5px] font-semibold"
                    style={{ background: "rgba(255,255,255,0.95)", color: "#0f766e" }}
                  >
                    <Sparkles className="h-3 w-3" />
                    Generate
                  </span>
                </div>
              )}
            </div>
          </button>
        );
      }
      case "expenses": {
        // Find who you owe the most to
        const oweTo = balances.filter((b) => b.userId !== userId && b.balance > 0.01);
        const topCreditor = oweTo.length > 0 ? oweTo.sort((a, b) => b.balance - a.balance)[0] : null;
        const creditorName = topCreditor ? members?.find((m) => m.userId === topCreditor.userId)?.displayName : null;

        return (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/expenses`)}
            className="w-full text-left rounded-2xl overflow-hidden transition-all active:opacity-80 hover:shadow-lg relative"
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
            className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all active:opacity-80 hover:shadow-md"
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
            className="isolate w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-[transform,box-shadow] active:opacity-80 hover:shadow-md"
          >
            <div className="h-[80px] relative overflow-hidden bg-muted">
              <picture>
                <source srcSet={decisionsCardWebp} type="image/webp" />
                <img
                  src={decisionsCardJpg}
                  alt=""
                  width={600}
                  height={266}
                  loading="eager"
                  decoding="sync"
                  fetchPriority="high"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </picture>
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
            className="isolate w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-[transform,box-shadow] active:opacity-80 hover:shadow-md"
          >
            <div className="h-[80px] relative overflow-hidden bg-muted">
              <picture>
                <source srcSet={bookingsCardWebp} type="image/webp" />
                <img
                  src={bookingsCardJpg}
                  alt=""
                  width={600}
                  height={266}
                  loading="eager"
                  decoding="sync"
                  fetchPriority="high"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </picture>
            </div>
            <div className="p-3">
              <p className="font-semibold text-[14px] text-foreground">Bookings & Docs</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">{bookingsSummary}</p>
            </div>
          </button>
        );

      case "itinerary":
        if (!showItinerary) return null;
        return (
          <button
            onClick={() => navigate(`/app/trips/${tripId}/itinerary`)}
            className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 text-left transition-all active:opacity-80 hover:shadow-md"
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

      case "travellers":
        return <TravellersSection tripId={tripId} myRole={myRole} />;

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
        <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
            {visibleOrder.map((id) => {
              if (id === "decisions" || id === "bookings") {
                const otherId = id === "decisions" ? "bookings" : "decisions";
                const isFirst = visibleOrder.indexOf(id) < visibleOrder.indexOf(otherId);
                if (!isFirst) return null; // second card rendered by the first
                const pairOrder = [id, otherId];
                return (
                  <SortableContext key="decisions-bookings-ctx" items={pairOrder} strategy={horizontalListSortingStrategy}>
                    <div className="grid grid-cols-2 gap-3">
                      <SortableSection id={id} editMode={editMode}>{renderSection(id)}</SortableSection>
                      <SortableSection id={otherId} editMode={editMode}>{renderSection(otherId)}</SortableSection>
                    </div>
                  </SortableContext>
                );
              }
              return (
                <SortableSection key={id} id={id} editMode={editMode}>{renderSection(id)}</SortableSection>
              );
            })}
          </SortableContext>

          <DragOverlay
            dropAnimation={{
              duration: 260,
              easing: "cubic-bezier(0.2, 0, 0, 1)",
            }}
            zIndex={60}
          >
            {activeId ? <DragPreview>{renderSection(activeId)}</DragPreview> : null}
          </DragOverlay>
        </DndContext>

        {/* Subtle inline Rearrange affordance — sits quietly below the cards */}
        {!editMode && (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            aria-label="Rearrange dashboard"
            className="self-center mt-2 mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ArrowUpDown className="h-3 w-3" strokeWidth={1.75} />
            Rearrange
          </button>
        )}
      </div>

      {/* Floating Done pill — only while editing, so users can confirm easily */}
      {editMode && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-40 animate-fade-in"
          style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + 84px)` }}
        >
          <button
            type="button"
            onClick={() => setEditMode(false)}
            aria-label="Done rearranging"
            className="flex items-center gap-2 rounded-full border border-border/60 bg-background/85 backdrop-blur-xl px-4 h-10 text-[13px] font-semibold text-primary shadow-[0_8px_28px_-6px_hsl(var(--primary)/0.35)] transition-all duration-300 ease-out"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Done
          </button>
        </div>
      )}

      {/* Concierge Panel — hidden behind CONCIERGE_ENABLED flag for launch */}
      {CONCIERGE_ENABLED && (
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
      )}
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

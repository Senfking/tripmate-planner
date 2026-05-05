import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, RefreshCw, Package, MapPin, CalendarDays, CreditCard, ChevronDown, Share2, Hotel, Sparkles, Plane, Bell, Bed, Wallet, PenLine, Users, LayoutDashboard, Map as MapIcon, Building2, Loader2, Lock as LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { DestinationSection } from "./DestinationSection";
import { DaySection } from "./DaySection";
import { TransportCard } from "./TransportCard";
import { AccommodationCard } from "./AccommodationCard";
import { getCategoryColor } from "./categoryColors";
import { buildActivityCostFormatter } from "./formatActivityCost";
import { AlternativesSheet } from "./AlternativesSheet";
import { ResultsMap } from "./ResultsMap";
import { ResultsTimeline, buildTimelineNodes } from "./ResultsTimeline";
import { TripDiscussion } from "./TripDiscussion";
import { CostBottomPanel } from "./CostBottomPanel";
import { EditTripSheet } from "./EditTripSheet";
import { GroupActivityPanel } from "./GroupActivityPanel";
import { useResultsState } from "./useResultsState";
import type { AITripResult, AIDay, AIActivity } from "./useResultsState";
import { computeTripBudget } from "@/lib/budgetCalc";
// ConciergeButton intentionally not imported — floating "What to do?" pill removed.
import { ConciergePanel } from "@/components/concierge/ConciergePanel";
import { CONCIERGE_ENABLED } from "@/lib/featureFlags";
import { useStreamReveal } from "@/hooks/useStreamReveal";
import { StreamRevealIndicator } from "./StreamRevealIndicator";
import { StreamingStatusPill, StreamingProgressBar } from "./StreamingStatusPill";
import { useDayCompleteToasts } from "./useDayCompleteToasts";
import { DayCardReveal } from "./DayCardReveal";
import { MapSlidePanel, type MapState } from "./MapSlidePanel";
import { EntryRequirementsPreview } from "./EntryRequirementsPreview";
import { PackingCard } from "./PackingCard";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { fetchEurRates } from "@/lib/fetchCrossRates";
import { cn } from "@/lib/utils";

interface Props {
  tripId: string;
  planId?: string | null;
  result: AITripResult;
  onClose: () => void;
  onRegenerate: (prompt?: string) => void;
  onAdjust?: () => void;
  standalone?: boolean;
  onCreateTrip?: () => void;
  onSaveDraft?: () => void;
  onShare?: () => void;
  creatingTrip?: boolean;
  onDashboard?: () => void;
  revealMode?: boolean;
  onRevealComplete?: () => void;
  /** When true, the result is mid-stream and incomplete. Day cards listed in
   *  `streamingDayNumbers` render as skeleton placeholders; the budget panel,
   *  trip summary, packing, and overview sections only render once their
   *  source data is present. The "Create trip" CTA stays disabled until
   *  streaming completes (caller passes streaming=false to release it). */
  streaming?: boolean;
  /** Set of day_number values that haven't streamed yet — render those days
   *  as skeleton placeholders. Empty set / undefined means all days populated. */
  streamingDayNumbers?: Set<number>;
  /** Status text for the small loading pill shown at the top of the results
   *  surface while streaming (e.g. "Composing your day-by-day itinerary…").
   *  Hidden once streaming=false. */
  streamingMessage?: string;
  /** Destination-specific micro-copy rotated through during the longest
   *  pipeline stage (ranking_days). Optional — older edge function deploys
   *  may not emit this. */
  streamingStatusMessages?: string[];
  /** Latest pipeline milestone from stage_progress. Drives the pill's user
   *  text for non-ranking stages plus the progress bar width. Optional. */
  streamingStage?: { stage: string; user_text: string; percent_complete: number } | null;
  /** day_numbers that finished ranking. Triggers a "Day N ready" toast and
   *  card fade-in animation. Optional. */
  streamingCompletedDays?: number[];
  /** "calendar" (default) or "generic" — generic mode hides real dates and
   *  the date range, used for date-agnostic template previews. */
  dateMode?: "calendar" | "generic";
  /** When true, hide editing affordances inside day cards (edit, add,
   *  remove, comments). The hero edit/regenerate controls are also hidden. */
  readOnly?: boolean;
}

export function TripResultsView({ tripId, planId, result, onClose, onRegenerate, onAdjust, standalone, onCreateTrip, onSaveDraft, onShare, creatingTrip, onDashboard, revealMode, onRevealComplete, streaming, streamingDayNumbers, streamingMessage, streamingStatusMessages, streamingStage, streamingCompletedDays, dateMode = "calendar", readOnly = false }: Props) {
  const reveal = useStreamReveal(result, !!revealMode);

  // Fire "Day N ready ✓" toasts as each day_complete event arrives. Hook is
  // a no-op when streaming isn't happening or no events arrive.
  useDayCompleteToasts(streaming ? (streamingCompletedDays ?? []) : []);

  // Notify parent when reveal completes
  useEffect(() => {
    if (revealMode && !reveal.isRevealing) {
      onRevealComplete?.();
    }
  }, [revealMode, reveal.isRevealing, onRevealComplete]);

  // Helper: returns inline style with animation-delay for a reveal key
  const revealStyle = useCallback(
    (key: string): React.CSSProperties => {
      if (!revealMode) return {};
      const delay = reveal.getDelay(key);
      if (delay === undefined) return {};
      return { animationDelay: `${delay}ms` };
    },
    [revealMode, reveal.getDelay]
  );

  // Helper: returns the reveal-item class when in reveal mode
  const rc = revealMode ? "reveal-item" : "";

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(
      () => toast.success("Plan link copied!"),
      () => toast.error("Failed to copy link")
    );
  }, []);

  const state = useResultsState(tripId);
  const [packingOpen, setPackingOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [editTripOpen, setEditTripOpen] = useState(false);
  const [mapState, setMapState] = useState<MapState>("closed");
  const [mapActiveDayIndex, setMapActiveDayIndex] = useState(-1);

  const openDayMap = (dayIndex: number) => {
    setMapActiveDayIndex(dayIndex);
    setMapState(typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? "partial" : "full");
  };
  const [groupActivityOpen, setGroupActivityOpen] = useState(false);
  const [conciergeOpen, setConciergeOpen] = useState(false);
  type CoordsMap = Map<string, { lat: number; lng: number }>;
  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const SCROLL_TOP_GAP = 24;
    const marked = document.querySelector<HTMLElement>("[data-results-scroll-root='true']");
    const useInner = marked && marked.scrollHeight > marked.clientHeight + 1;
    const elementRect = el.getBoundingClientRect();
    if (useInner && marked) {
      const rootRect = marked.getBoundingClientRect();
      const targetTop = Math.max(0, marked.scrollTop + (elementRect.top - rootRect.top) - SCROLL_TOP_GAP);
      marked.scrollTo({ top: targetTop, behavior: "smooth" });
    } else {
      const targetTop = Math.max(0, window.scrollY + elementRect.top - SCROLL_TOP_GAP);
      window.scrollTo({ top: targetTop, behavior: "smooth" });
    }
  }, []);

  const refinedCoords = useRef<CoordsMap>(new (Map as any)()).current as CoordsMap;
  const [coordsVersion, setCoordsVersion] = useState(0);

  const handleCoordsRefined = useCallback((dayDate: string, activityIndex: number, lat: number, lng: number) => {
    const key = `${dayDate}-${activityIndex}`;
    if (!refinedCoords.has(key)) {
      refinedCoords.set(key, { lat, lng });
      setCoordsVersion((v) => v + 1);
    }
  }, [refinedCoords]);

  const allDays = useMemo(() => {
    const days: AIDay[] = [];
    let dayNum = 1;
    for (const dest of result.destinations) {
      for (const day of dest.days) {
        days.push({ ...day, day_number: dayNum++ });
      }
    }
    return days;
  }, [result]);

  const totalActivities = useMemo(
    () => allDays.reduce((sum, d) => sum + d.activities.length, 0),
    [allDays]
  );

  // removed: remainingCount / addedCount no longer needed

  // Single source of truth for budget math — mirrors the sticky footer,
  // any dashboard summary, and the preview breakdown. Avoids the drift
  // CLAUDE.md flags: every surface routes through computeTripBudget.
  // budget_tier gates the accommodation fallback when Places returns
  // no pricing — otherwise a luxury trip would default to mid-range.
  const costBreakdown = useMemo(
    () => computeTripBudget(result, result.budget_tier),
    [result],
  );

  const dateRange = useMemo(() => {
    if (result.destinations.length === 0) return "";
    const first = result.destinations[0].start_date;
    const last = result.destinations[result.destinations.length - 1].end_date;
    try {
      return `${format(parseISO(first), "MMM d")} – ${format(parseISO(last), "MMM d")}`;
    } catch {
      return `${first} – ${last}`;
    }
  }, [result]);

  const uniqueCities = useMemo(() => {
    const names = new Set(result.destinations.map((d) => d.name));
    return names.size;
  }, [result]);

  const totalHotels = useMemo(() => {
    return result.destinations.filter((d) => d.accommodation).length;
  }, [result]);

  // Determine trip shape: single-destination (all days same place) vs multi-destination.
  const isMultiDestination = useMemo(() => {
    const names = new Set(result.destinations.map((d) => d.name?.trim().toLowerCase()).filter(Boolean));
    return names.size >= 2;
  }, [result]);

  // Warn once if backend never marks any activity as a Junto Pick.
  useEffect(() => {
    const hasField = result.destinations.some((d) =>
      d.days.some((day) => day.activities.some((a) => typeof (a as any).is_junto_pick === "boolean"))
    );
    const hasAnyPick = result.destinations.some((d) =>
      d.days.some((day) => day.activities.some((a) => (a as any).is_junto_pick === true))
    );
    if (!hasField) {
      console.warn("[TripResultsView] expected junto_pick field not found in activity data");
    } else if (!hasAnyPick) {
      console.info("[TripResultsView] is_junto_pick present but no activity marked true for this trip");
    }
  }, [result]);

  const currency = result.currency || "USD";

  // ---- Budget currency conversion ----
  // Display the trip budget in the user's profile.default_currency primary,
  // with the destination currency as a smaller subtitle. Uses the same
  // EUR-based rate fetch that powers expense settlement.
  const { profile } = useAuth();
  const userCurrency = (profile?.default_currency || "EUR").toUpperCase();
  const destCurrency = currency.toUpperCase();
  const conversionEnabled = userCurrency !== destCurrency;

  const { data: eurRates } = useQuery({
    queryKey: ["budget-eur-rates"],
    queryFn: fetchEurRates,
    enabled: conversionEnabled,
    staleTime: 1000 * 60 * 60,
  });

  // Convert an amount in destCurrency → userCurrency via EUR.
  // Returns null if rates unavailable so callers can fall back gracefully.
  const convertToUserCurrency = useCallback(
    (amount: number): number | null => {
      if (!conversionEnabled) return amount;
      if (!eurRates) return null;
      const eurToDest = eurRates[destCurrency];
      const eurToUser = eurRates[userCurrency];
      if (!eurToDest || eurToDest <= 0 || !eurToUser || eurToUser <= 0) return null;
      const amountInEur = amount / eurToDest;
      return amountInEur * eurToUser;
    },
    [conversionEnabled, eurRates, destCurrency, userCurrency],
  );

  // Format a numeric amount with a localized currency symbol.
  const formatBudget = useCallback(
    (amount: number, code: string): string => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: code,
          maximumFractionDigits: 0,
        }).format(Math.round(amount));
      } catch {
        return `${code} ${Math.round(amount).toLocaleString()}`;
      }
    },
    [],
  );

  // Per-activity cost formatter — same conversion path as the budget bar so
  // the day cards and bottom bar agree on currency.
  const activityCostFormatter = useMemo(
    () => buildActivityCostFormatter({
      destCurrency,
      userCurrency,
      convertToUserCurrency,
      formatBudget,
    }),
    [destCurrency, userCurrency, convertToUserCurrency, formatBudget],
  );


  const hasPacking = (result.packing_suggestions?.length || 0) > 0;

  const hasEntry = !streaming && !!result.destination_country_iso;

  const timelineNodes = useMemo(
    () => buildTimelineNodes(result.destinations, allDays, hasPacking, hasEntry),
    [result.destinations, allDays, hasPacking, hasEntry]
  );

  const mapOpen = mapState !== "closed";

  // When the map panel is open, the layout becomes a constrained split-view
  // and the itinerary column gets its own internal scroll (so the map stays
  // fixed at the side). When the map is closed, the document itself is the
  // scroller — this lets full-page screenshot tools and browser features
  // (find-in-page, middle-click autoscroll) work normally.
  //
  // Because the view portals into <body> alongside the underlying app shell
  // (sidebar, header, etc.), we hide the rest of <body>'s children while
  // mounted so the results view sits at the top of the document instead of
  // being pushed down by the app underneath.
  useEffect(() => {
    const portalRoot = document.getElementById("trip-results-portal-root");
    const siblings = Array.from(document.body.children).filter(
      (el) => el !== portalRoot && el.tagName !== "SCRIPT"
    ) as HTMLElement[];
    const prev = siblings.map((el) => el.style.display);
    siblings.forEach((el) => {
      el.style.display = "none";
    });
    const prevBodyOverflow = document.body.style.overflow;
    if (mapOpen) document.body.style.overflow = "hidden";
    return () => {
      siblings.forEach((el, i) => {
        el.style.display = prev[i];
      });
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [mapOpen]);

  return createPortal(
    <div
      id="trip-results-portal-root"
      className={cn(
        "z-[9999] bg-background flex",
        mapOpen ? "fixed inset-0" : "absolute top-0 left-0 right-0 min-h-screen w-full"
      )}
    >
      {/* Itinerary scroll area */}
      <div
        className={cn(
          "min-w-0 flex-1",
          mapOpen ? "overflow-y-auto h-full" : ""
        )}
        data-results-scroll-root="true"
      >
      {/* Timeline (desktop only) */}
      <ResultsTimeline nodes={timelineNodes} compact={mapState === "partial"} />

      {/* Hero destination image with floating glass-morphic controls.
          The redundant sticky top bar (title + dates) was removed — title and
          dates already live in the block below the hero. */}
      <div
        className="relative w-full overflow-hidden h-[36vh] min-h-[260px] lg:h-[42vh]"
        style={revealStyle("hero")}
        data-results-header="true"
        data-results-hero="true"
      >
        {result.destination_image_url ? (
          <img
            src={result.destination_image_url}
            alt={`${result.destinations[0]?.name ?? result.trip_title} cover`}
            className="absolute inset-0 w-full h-full object-cover animate-fade-in"
            loading="eager"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted/60 to-muted/20" />
        )}

        {/* Top fade so the glass controls always read against the photo */}
        <div
          className="absolute inset-x-0 top-0 h-24 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.10) 60%, transparent 100%)",
          }}
        />

        {/* Bottom fade into the page background for a smooth transition */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0.85) 12%, hsl(var(--background) / 0.55) 28%, hsl(var(--background) / 0.2) 50%, transparent 75%)",
          }}
        />

        {/* Floating glass controls — back (left) + map / dashboard / edit (right) */}
        <div
          className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <button
            onClick={onClose}
            aria-label="Back"
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-white transition-transform active:opacity-80 hover:bg-black/40"
            style={{
              background: "rgba(0,0,0,0.3)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (mapState !== "closed") {
                  setMapState("closed");
                  return;
                }
                const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
                setMapState(isDesktop ? "partial" : "full");
              }}
              aria-label={mapState === "closed" ? "Show map" : "Hide map"}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full text-white transition-transform active:opacity-80 hover:bg-black/40"
              style={{
                background: mapState !== "closed" ? "rgba(13,148,136,0.6)" : "rgba(0,0,0,0.3)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <MapIcon className="h-4 w-4" />
            </button>
            {onDashboard && (
              <button
                onClick={onDashboard}
                aria-label="Trip overview"
                className="h-9 w-9 inline-flex items-center justify-center rounded-full text-white transition-transform active:opacity-80 hover:bg-black/40"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                <LayoutDashboard className="h-4 w-4" />
              </button>
            )}
            {onShare && (
              <button
                onClick={onShare}
                aria-label="Share trip"
                className="h-9 inline-flex items-center gap-1.5 rounded-full px-3 text-white transition-transform active:opacity-80 hover:bg-black/40"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                <Share2 className="h-4 w-4" />
                <span className="text-xs font-semibold">Share</span>
              </button>
            )}
            {!readOnly && (
              <button
                onClick={() => setEditTripOpen(true)}
                aria-label="Edit trip"
                className="h-9 w-9 inline-flex items-center justify-center rounded-full text-white transition-transform active:opacity-80 hover:bg-black/40"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                <PenLine className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Title block — below hero, standard body color for max legibility.
          Wrapped in the same max-w-[700px] container as the body so the
          headline aligns with the content (and clears the desktop timeline). */}
      <div
        className={cn(
          "max-w-[700px] mx-auto",
          mapState === "partial" ? "lg:pl-9" : "lg:pl-[60px]"
        )}
      >
        <div
          className={cn("px-4 pt-4 pb-2", rc)}
          style={revealStyle("hero")}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            Your trip
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground leading-tight">
            {result.trip_title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {result.destinations.map((d) => d.name).join(" · ")}
              </span>
            </span>
            {dateMode !== "generic" && <span className="font-mono text-xs">{dateRange}</span>}
          </div>
        </div>
      </div>

      <div className={cn(
        "max-w-[700px] mx-auto flex flex-col",
        mapState === "partial" ? "lg:pl-9" : "lg:pl-[60px]"
      )}>
        {/* Streaming reveal indicator */}
        {revealMode && (
          <StreamRevealIndicator
            message={reveal.currentMessage}
            progress={reveal.progress}
            isRevealing={reveal.isRevealing}
          />
        )}

        {/* Live-streaming status pill — only while generation is mid-flight.
            Disappears the instant `streaming` flips false (trip_complete fires
            in StandaloneTripBuilder), so the transition to the final state is
            just one element disappearing — no other layout change. */}
        {streaming && (
          <div className="px-4 pt-3 space-y-2">
            <StreamingStatusPill
              stage={streamingStage ?? null}
              statusMessages={streamingStatusMessages ?? []}
              fallback={streamingMessage || "Crafting your trip"}
            />
            <StreamingProgressBar percent={streamingStage?.percent_complete ?? null} />
          </div>
        )}

        {/* Stat pills */}
        <div className={cn("px-4 pt-4 pb-2", rc)} style={revealStyle("stats")}>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0D9488]/15 border border-[#0D9488]/25 text-xs text-[#0D9488] font-mono">
              <CalendarDays className="h-3 w-3" /> {allDays.length} days
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0D9488]/15 border border-[#0D9488]/25 text-xs text-[#0D9488] font-mono">
              <MapPin className="h-3 w-3" /> {uniqueCities} {uniqueCities === 1 ? "city" : "cities"}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0D9488]/15 border border-[#0D9488]/25 text-xs text-[#0D9488] font-mono">
              <Sparkles className="h-3 w-3" /> {totalActivities} experiences
            </span>
            {totalHotels > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0D9488]/15 border border-[#0D9488]/25 text-xs text-[#0D9488] font-mono">
                <Hotel className="h-3 w-3" /> {totalHotels} {totalHotels === 1 ? "hotel" : "hotels"}
              </span>
            )}
          </div>
        </div>

        {/* Trip summary — only render once we actually have one. During
            streaming this stays hidden; trip_summary arrives in trip_complete
            so it appears in the same render that flips streaming -> false. */}
        {result.trip_summary ? (
          <div className={cn("px-4 pt-2 pb-4", rc)} style={revealStyle("summary")}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {result.trip_summary}
            </p>
          </div>
        ) : streaming ? (
          // Lightweight placeholder so the divider doesn't crash into the
          // stat pills. Same vertical footprint as a 2-line summary.
          <div className="px-4 pt-2 pb-4 space-y-1.5">
            <div className="h-3 w-full rounded bg-muted animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
          </div>
        ) : null}

        {/* Divider */}
        <div className="mx-4 border-t border-border" />

        {/* ===== OVERALL SUMMARY SECTIONS =====
            Hidden while streaming — flights/stays/budget rely on the full
            assembled trip. Day cards and the hero/stats above remain visible
            so users see progress without flashes. */}
        {!streaming && (<>

        {/* Flights section intentionally hidden until the feature ships. */}

        {/* All stays overview — multi-destination only (compact horizontal carousel) */}
        {isMultiDestination && result.destinations.some(d => d.accommodation) && (
          <div id="section-stays-overview" className={cn("mb-4", rc)} style={revealStyle("overview-stays")}>
            <h3 className="px-4 text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Bed className="h-5 w-5 text-primary" /> Where you'll stay
            </h3>
            <div className="flex gap-2.5 overflow-x-auto px-4 pb-1 -mx-px snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {result.destinations.filter(d => d.accommodation).map((dest, i) => {
                const destDays = allDays.filter(d => d.date >= dest.start_date && d.date <= dest.end_date);
                const nightCount = destDays.length;
                const firstDay = destDays[0]?.day_number || 1;
                const lastDay = destDays[destDays.length - 1]?.day_number || firstDay;
                const dayLabel = firstDay === lastDay ? `Day ${firstDay}` : `Days ${firstDay}–${lastDay}`;
                return (
                  <button
                    key={i}
                    onClick={() => scrollToSection(`section-dest-${dest.name}`)}
                    className="snap-start shrink-0 w-[180px] text-left rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent/40 transition-colors p-3"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <MapPin className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-[13px] font-semibold text-foreground truncate">{dest.name}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {dayLabel} · {nightCount} {nightCount === 1 ? "night" : "nights"}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                      <Hotel className="h-2.5 w-2.5" /> 1 stay
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Trip budget — fintech-style card */}
        <div id="section-budget" className={cn("mx-4 mb-6", rc)} style={revealStyle("overview-budget")}>
          {(() => {
            const converted = convertToUserCurrency(costBreakdown.total);
            const showConverted = conversionEnabled && converted !== null;
            const primaryAmount = showConverted
              ? formatBudget(converted!, userCurrency)
              : `${currency} ${costBreakdown.total.toLocaleString()}`;

            const activitiesConv = convertToUserCurrency(costBreakdown.activitiesTotal);
            const stayConv = convertToUserCurrency(costBreakdown.accommodationTotal);
            const dailyConv = convertToUserCurrency(costBreakdown.dailyAvg);

            const activitiesDisplay = showConverted && activitiesConv !== null
              ? formatBudget(activitiesConv, userCurrency)
              : `${currency} ${costBreakdown.activitiesTotal.toLocaleString()}`;
            const stayDisplay = showConverted && stayConv !== null
              ? formatBudget(stayConv, userCurrency)
              : `${currency} ${costBreakdown.accommodationTotal.toLocaleString()}`;
            const dailyDisplay = showConverted && dailyConv !== null
              ? formatBudget(dailyConv, userCurrency)
              : `${currency} ${costBreakdown.dailyAvg.toLocaleString()}`;

            return (
              <div className="relative rounded-3xl overflow-hidden bg-[hsl(180_25%_10%)] text-white shadow-[0_20px_50px_-20px_rgba(13,148,136,0.45)]">
                {/* Hero amount block */}
                <div className="relative px-6 pt-6 pb-5 overflow-hidden">
                  {/* Ambient glows */}
                  <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-[#0D9488]/30 blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-24 -left-10 w-56 h-56 rounded-full bg-[#0D9488]/15 blur-3xl pointer-events-none" />
                  {/* Grid texture */}
                  <div
                    className="absolute inset-0 opacity-[0.035] pointer-events-none"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                      backgroundSize: "24px 24px",
                    }}
                  />

                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-md bg-white/10 backdrop-blur-sm flex items-center justify-center">
                          <Wallet className="h-3 w-3 text-[#5EEAD4]" />
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.18em] font-medium text-white/60">Estimated budget · per person</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-white/50 tabular-nums tracking-wider">{showConverted ? userCurrency : currency}</span>
                        <span className="text-[40px] sm:text-[44px] font-semibold tracking-tight text-white tabular-nums leading-none">
                          {showConverted
                            ? converted!.toLocaleString(undefined, { maximumFractionDigits: 0 })
                            : costBreakdown.total.toLocaleString()}
                        </span>
                      </div>
                      {showConverted && (
                        <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-white/50 font-mono tabular-nums">
                          <span className="inline-block w-1 h-1 rounded-full bg-[#5EEAD4]" />
                          ≈ {currency} {costBreakdown.total.toLocaleString()} locally
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setCostOpen(!costOpen)}
                      className="shrink-0 h-9 w-9 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur-sm flex items-center justify-center transition-colors"
                      aria-label={costOpen ? "Hide breakdown" : "Show breakdown"}
                    >
                      <ChevronDown className={`h-4 w-4 text-white transition-transform duration-200 ${costOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  {/* Stacked progress bar */}
                  <div className="relative mt-5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden flex">
                    {costBreakdown.categories.map(([cat, amount]) => {
                      const pct = costBreakdown.total > 0 ? (amount / costBreakdown.total) * 100 : 0;
                      return (
                        <div
                          key={cat}
                          style={{ width: `${pct}%`, background: getCategoryColor(cat) }}
                          className="h-full"
                        />
                      );
                    })}
                  </div>

                  {/* Stat tiles */}
                  <div className="relative mt-4 grid grid-cols-3 gap-2">
                    {[
                      { label: "Activities", value: activitiesDisplay },
                      { label: "Stay", value: stayDisplay },
                      { label: "Per day", value: dailyDisplay },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="rounded-xl bg-white/[0.06] backdrop-blur-sm px-3 py-2.5 border border-white/[0.06]"
                      >
                        <div className="text-[9px] uppercase tracking-[0.14em] text-white/50 font-medium">{s.label}</div>
                        <div className="mt-1 text-[13px] font-mono font-medium text-white tabular-nums truncate">{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Category breakdown */}
                {costOpen && (
                  <div className="px-6 py-5 border-t border-white/[0.08] bg-[hsl(180_25%_8%)] animate-fade-in">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[10px] uppercase tracking-[0.18em] font-medium text-white/50">Breakdown</div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40">{costBreakdown.categories.length} categories</div>
                    </div>
                    <div className="space-y-3">
                      {costBreakdown.categories.map(([cat, amount]) => {
                        const pct = costBreakdown.total > 0 ? (amount / costBreakdown.total) * 100 : 0;
                        const catConverted = convertToUserCurrency(amount);
                        const catShowConverted = conversionEnabled && catConverted !== null;
                        const catDisplay = catShowConverted
                          ? formatBudget(catConverted!, userCurrency)
                          : `${currency} ${Math.round(amount).toLocaleString()}`;
                        const color = getCategoryColor(cat);
                        return (
                          <div key={cat} className="flex items-center gap-3">
                            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                            <span className="text-xs text-white/80 flex-1 truncate capitalize">{cat}</span>
                            <span className="text-[10px] text-white/40 font-mono tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                            <span className="text-xs font-mono text-white tabular-nums w-24 text-right">{catDisplay}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-5 pt-4 border-t border-white/[0.08] flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-[0.14em] text-white/60 font-medium">Total per person</span>
                      <span className="text-base font-mono font-semibold text-[#5EEAD4] tabular-nums">
                        {showConverted ? userCurrency : currency} {(showConverted ? converted! : costBreakdown.total).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/40 mt-3">Based on typical prices · actual costs may vary by season and availability.</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Divider before destinations */}
        <div className="mx-4 border-t border-border mb-2" />

        </>)}{/* end !streaming overview */}

        {/* Streaming-only: dark budget skeleton so the visual rhythm matches
            the final state instead of leaving a blank gap above the day cards. */}
        {streaming && (
          <div className="mx-4 mb-6">
            <div className="relative rounded-3xl overflow-hidden bg-[hsl(180_25%_10%)] text-white shadow-[0_20px_50px_-20px_rgba(13,148,136,0.45)]">
              <div className="relative px-6 pt-6 pb-5 overflow-hidden">
                <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-[#0D9488]/30 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-10 w-56 h-56 rounded-full bg-[#0D9488]/15 blur-3xl pointer-events-none" />
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md bg-white/10" />
                  <div className="h-2.5 w-44 rounded bg-white/15 animate-pulse" />
                </div>
                <div className="h-10 w-40 rounded bg-white/20 animate-pulse" />
                <div className="mt-5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-[#0D9488]/70 animate-pulse" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-xl bg-white/[0.06] border border-white/[0.06] px-3 py-2.5 space-y-1.5">
                      <div className="h-2 w-12 rounded bg-white/15 animate-pulse" />
                      <div className="h-3 w-16 rounded bg-white/25 animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Single draft notice — replaces per-day repetitions */}
        {standalone && (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-xl bg-muted/40 border border-dashed border-border px-3 py-2.5">
            <span className="text-[11px] text-muted-foreground leading-snug">
              💬 Comments unlock once you create the trip. Save it and invite your group to start the conversation.
            </span>
          </div>
        )}

        {/* ===== PER-DESTINATION CONTENT ===== */}
        {result.destinations.map((dest, destIdx) => {
          const destDays = allDays.filter(
            (d) => d.date >= dest.start_date && d.date <= dest.end_date
          );
          const firstDay = destDays[0]?.day_number || 1;
          const lastDay = destDays[destDays.length - 1]?.day_number || firstDay;
          const dayRange2 = firstDay === lastDay ? `Day ${firstDay}` : `Days ${firstDay}–${lastDay}`;

          return (
            <div key={destIdx}>
              <div id={`section-dest-${dest.name}`} className={rc} style={revealStyle(`dest-${destIdx}`)}>
                <DestinationSection
                  name={dest.name}
                  startDate={dest.start_date}
                  endDate={dest.end_date}
                  intro={dest.intro}
                  dayRange={dayRange2}
                  dateMode={dateMode}
                />
              </div>

              {/* Accommodation card per destination */}
              {dest.accommodation ? (
                <AccommodationCard
                  name={dest.accommodation.title || dest.accommodation.name || "Stay"}
                  description={dest.accommodation.description ?? null}
                  proTip={dest.accommodation.pro_tip ?? dest.accommodation.tips ?? null}
                  photos={dest.accommodation.photos}
                  rating={dest.accommodation.rating ?? null}
                  userRatingCount={dest.accommodation.user_rating_count ?? null}
                  priceLevel={dest.accommodation.price_level ?? null}
                  priceRange={dest.accommodation.priceRange ?? null}
                  neighborhood={dest.accommodation.neighborhood ?? null}
                  googleMapsUrl={dest.accommodation.google_maps_url ?? null}
                  bookingUrl={dest.accommodation.booking_url ?? null}
                  bookingPartner={dest.accommodation.booking_partner ?? null}
                  locationHint={dest.name}
                  checkInDate={dest.start_date || null}
                  checkOutDate={dest.end_date || null}
                />
              ) : (
                <div
                  className="mx-4 mb-4 rounded-2xl overflow-hidden border border-border bg-card shadow-sm"
                  aria-label="Loading accommodation"
                  aria-busy="true"
                >
                  {/* Hero image area — matches AccommodationCard h-[280px] */}
                  <div className="relative w-full h-[260px] sm:h-[300px] bg-muted overflow-hidden">
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-muted/60 to-muted" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[hsl(180_25%_8%)]/85 via-[hsl(180_25%_8%)]/25 to-transparent" />
                    <div className="absolute top-3 left-3 h-5 w-20 rounded-full bg-white/15 backdrop-blur-md" />
                    <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-12 space-y-2">
                      <div className="h-5 w-2/3 rounded bg-white/25 animate-pulse" />
                      <div className="h-3 w-1/3 rounded bg-white/20 animate-pulse" />
                    </div>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                    <div className="h-7 w-32 rounded-lg bg-[#0D9488]/30 animate-pulse" />
                  </div>
                </div>
              )}

              {/* Day cards */}
              <div className="space-y-4 px-4 pb-6">
                {destDays.map((day) => (
                  <div key={day.date} className={rc} style={revealStyle(`day-${day.day_number}`)}>
                  <DayCardReveal
                    justCompleted={!!streaming && (streamingCompletedDays?.includes(day.day_number) ?? false)}
                  >
                  <DaySection
                    day={day}
                    planId={planId || null}
                    isDraft={!!standalone}
                    destinationName={dest.name}
                    result={result}
                    allDays={allDays}
                    refinedCoords={coordsVersion >= 0 ? refinedCoords : refinedCoords}
                    onRequestChange={(dd, i, a) => state.requestAlternatives(dd, i, a, tripId)}
                    onRequestDescribedChange={(dd, i, a, desc) => state.requestAlternatives(dd, i, a, tripId, desc)}
                    onCustomPlaceSwap={(dd, i, name) => state.requestCustomPlaceSwap(dd, i, name, result.destinations.find(d => {
                      const destDays2 = allDays.filter(day => day.date >= d.start_date && day.date <= d.end_date);
                      return destDays2.some(day => day.date === dd);
                    })?.name || dest.name)}
                    onRemoveActivity={(dd, i, a) => state.removeActivity(dd, i, a)}
                    isActivityRemoved={state.isActivityRemoved}
                    onAddLocalActivity={(dd, a) => state.addLocalActivity(dd, a)}
                    getLocalAdditions={state.getLocalAdditions}
                    getReplacedActivity={state.getReplacedActivity}
                    onCoordsRefined={handleCoordsRefined}
                    onOpenDayMap={openDayMap}
                    skeleton={!!streamingDayNumbers?.has(day.day_number)}
                    costFormatter={activityCostFormatter}
                    dateMode={dateMode}
                    readOnly={readOnly}
                  />
                  </DayCardReveal>
                  </div>
                ))}
              </div>

              {dest.transport_to_next && (
                <TransportCard
                  from={dest.transport_to_next.from}
                  to={dest.transport_to_next.to}
                  mode={dest.transport_to_next.mode}
                  duration={dest.transport_to_next.duration}
                />
              )}
            </div>
          );
        })}

        {/* Visa & entry requirements + Packing — only once streaming complete.
            Both depend on data that arrives in trip_complete (country_iso /
            packing_suggestions). */}
        {!streaming && (
          <>
            <div id="section-entry" className={cn(rc)} style={revealStyle("packing")}>
              <EntryRequirementsPreview
                destinationCountryIso={result.destination_country_iso ?? null}
                tripLengthDays={allDays.length || 7}
              />
            </div>

            {hasPacking && (
              <div className={cn(rc)} style={revealStyle("packing")}>
                <PackingCard
                  items={result.packing_suggestions}
                  open={packingOpen}
                  onToggle={() => setPackingOpen(!packingOpen)}
                />
              </div>
            )}
          </>
        )}

        {/* Trip-level discussion moved into Group Activity panel */}

        {/* Bottom spacer — clears fixed bottom action bar + Group Chat pill + safe area */}
        <div className="h-40" />
      </div>

      {/* Sticky bottom bar */}
      <div className={cn("fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-xl border-t border-border pb-[calc(env(safe-area-inset-bottom,0px)+8px)]", rc)} style={revealStyle("complete")}>
        <div className="max-w-[700px] mx-auto relative">
          {standalone ? (
            <div className="flex items-center justify-center gap-2 px-4 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => (readOnly ? onRegenerate() : setEditTripOpen(true))}
                className="h-10 px-4 rounded-xl text-[13px] font-semibold gap-1.5 flex-1 sm:flex-none"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onSaveDraft}
                className="h-10 px-4 rounded-xl text-[13px] font-semibold flex-1 sm:flex-none"
              >
                Save draft
              </Button>
              <Button
                type="button"
                onClick={onCreateTrip}
                disabled={creatingTrip || !!streaming}
                title={streaming ? "Available once your trip finishes generating" : undefined}
                className="h-10 px-5 rounded-xl font-semibold text-[13px] bg-[#0D9488] hover:bg-[#0D9488]/90 text-white flex-1 sm:flex-none"
              >
                {creatingTrip ? "Creating..." : streaming ? "Generating…" : "Create trip"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="h-10 rounded-xl text-[13px] font-semibold gap-1.5 flex-1 sm:flex-none sm:px-4"
              >
                <Share2 className="h-3.5 w-3.5" /> Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditTripOpen(true)}
                className="h-10 rounded-xl text-[13px] font-semibold gap-1.5 flex-1 sm:flex-none sm:px-4"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
            </div>
          )}
        </div>
      </div>

      </div>{/* end scroll area */}

      {/* Sliding map panel */}
      <MapSlidePanel
        result={result}
        allDays={allDays}
        refinedCoords={coordsVersion >= 0 ? refinedCoords : refinedCoords}
        totalActivities={totalActivities}
        state={mapState}
        onStateChange={(s) => {
          setMapState(s);
          if (s === "closed") setMapActiveDayIndex(-1);
        }}
        activeDayIndex={mapActiveDayIndex}
        onActiveDayChange={setMapActiveDayIndex}
      />

      {/* Overlays (outside flex layout) */}
      {/* Group Activity floating button — disabled in draft mode */}
      {planId && !standalone && (
        <button
          onClick={() => setGroupActivityOpen(true)}
          className="fixed right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-xl hover:bg-primary/90 hover:scale-105 transition-all duration-200 animate-in fade-in slide-in-from-bottom-4"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 9rem)" }}
          title="Group activity"
        >
          <Users className="h-4 w-4" />
          <span className="text-xs font-semibold">Group Chat</span>
          <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
        </button>
      )}

      {planId && standalone && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="fixed right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-muted text-muted-foreground border border-border shadow-lg hover:bg-muted/80 transition-all duration-200 animate-in fade-in slide-in-from-bottom-4"
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 9rem)" }}
              aria-label="Group chat is locked — tap to learn more"
            >
              <LockIcon className="h-3.5 w-3.5 opacity-70" />
              <span className="text-xs font-semibold">Group Chat</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/80 font-medium">Locked</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={10}
            className="w-[280px] p-4 rounded-2xl border border-border shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground leading-tight">
                  Group chat is locked
                </p>
                <p className="text-[12px] text-muted-foreground leading-snug mt-1">
                  Create the trip and invite your travel buddies to start chatting together.
                </p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Group Activity Panel — never opens in draft mode */}
      {groupActivityOpen && planId && !standalone && (
        <GroupActivityPanel
          planId={planId}
          result={result}
          allDays={allDays}
          onScrollTo={scrollToSection}
          onClose={() => setGroupActivityOpen(false)}
        />
      )}

      {state.alternativesFor && (
        <AlternativesSheet
          activity={state.alternativesFor.activity}
          alternatives={state.alternatives}
          loading={state.loadingAlternatives}
          destinationName={result.destinations.find(d => {
            const dDays = allDays.filter(day => day.date >= d.start_date && day.date <= d.end_date);
            return dDays.some(day => day.date === state.alternativesFor?.dayDate);
          })?.name || ""}
          onSelect={(alt) => {
            if (state.alternativesFor) {
              state.replaceActivity(state.alternativesFor.dayDate, state.alternativesFor.activityIndex, alt);
            }
            state.setAlternativesFor(null);
          }}
          onClose={() => state.setAlternativesFor(null)}
        />
      )}

      {/* Edit Trip Sheet */}
      {editTripOpen && (
        <EditTripSheet
          result={result}
          onRegenerate={(prompt) => {
            setEditTripOpen(false);
            toast.info("Regenerating plan...");
            onRegenerate(prompt);
          }}
          onClose={() => setEditTripOpen(false)}
        />
      )}

      {/* Concierge panel hidden behind CONCIERGE_ENABLED flag for launch.
          No UI entry point currently opens this in TripResultsView, but kept
          gated for symmetry with TripDashboard. */}
      {CONCIERGE_ENABLED && !standalone && (
        <ConciergePanel
          tripId={tripId}
          open={conciergeOpen}
          onClose={() => setConciergeOpen(false)}
          tripResult={result}
          onAddToPlan={(dayDate, activity) => state.addLocalActivity(dayDate, activity)}
        />
      )}
    </div>,
    document.body
  );
}

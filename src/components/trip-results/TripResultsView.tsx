import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, RefreshCw, Package, MapPin, CalendarDays, CreditCard, ChevronDown, ChevronUp, Share2, SlidersHorizontal, Hotel, Sparkles, Map as MapIcon, Maximize2, X, Plane, Bell, Lightbulb, Bed, Wallet, PenLine, Users, LayoutDashboard, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { DestinationSection } from "./DestinationSection";
import { DaySection } from "./DaySection";
import { TransportCard } from "./TransportCard";
import { AccommodationCard } from "./AccommodationCard";
import { AlternativesSheet } from "./AlternativesSheet";
import { ResultsMap } from "./ResultsMap";
import { ResultsTimeline, buildTimelineNodes } from "./ResultsTimeline";
import { TripDiscussion } from "./TripDiscussion";
import { CostBottomPanel } from "./CostBottomPanel";
import { EditTripSheet } from "./EditTripSheet";
import { GroupActivityPanel } from "./GroupActivityPanel";
import { useResultsState } from "./useResultsState";
import type { AITripResult, AIDay, AIActivity } from "./useResultsState";
import { ConciergeButton } from "@/components/concierge/ConciergeButton";
import { ConciergePanel } from "@/components/concierge/ConciergePanel";

interface Props {
  tripId: string;
  planId?: string | null;
  result: AITripResult;
  onClose: () => void;
  onRegenerate: () => void;
  onAdjust?: () => void;
  standalone?: boolean;
  onCreateTrip?: () => void;
  onSaveDraft?: () => void;
  creatingTrip?: boolean;
  onDashboard?: () => void;
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TripResultsView({ tripId, planId, result, onClose, onRegenerate, onAdjust, standalone, onCreateTrip, onSaveDraft, creatingTrip, onDashboard }: Props) {
  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(
      () => toast.success("Plan link copied!"),
      () => toast.error("Failed to copy link")
    );
  }, []);

  const state = useResultsState(tripId);
  const [packingOpen, setPackingOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [mapVisible, setMapVisible] = useState(true);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [editTripOpen, setEditTripOpen] = useState(false);
  const [groupActivityOpen, setGroupActivityOpen] = useState(false);
  const [conciergeOpen, setConciergeOpen] = useState(false);
  type CoordsMap = Map<string, { lat: number; lng: number }>;
  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const scrollRoot = document.querySelector<HTMLElement>("[data-results-scroll-root='true']") ?? document.documentElement;
    const header = document.querySelector<HTMLElement>("[data-results-header='true']");
    const headerOffset = (header?.getBoundingClientRect().height ?? 0) + 12;
    const rootRect = scrollRoot.getBoundingClientRect();
    const elementRect = el.getBoundingClientRect();
    const targetTop = Math.max(0, scrollRoot.scrollTop + (elementRect.top - rootRect.top) - headerOffset);
    scrollRoot.scrollTo({ top: targetTop, behavior: "smooth" });
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

  const costBreakdown = useMemo(() => {
    const categories: Record<string, number> = {};
    let total = 0;
    for (const day of allDays) {
      for (const act of day.activities) {
        const cost = act.estimated_cost_per_person || 0;
        total += cost;
        const rawCat = (act.category || "Other").toLowerCase().trim();
        const cat = titleCase(rawCat);
        categories[cat] = (categories[cat] || 0) + cost;
      }
    }
    for (const dest of result.destinations) {
      if (dest.accommodation?.price_per_night) {
        const nights = dest.days.length;
        const accomTotal = dest.accommodation.price_per_night * nights;
        total += accomTotal;
        categories["Accommodation"] = (categories["Accommodation"] || 0) + accomTotal;
      }
    }
    const numDays = allDays.length || 1;
    const dailyAvg = Math.round(total / numDays);
    const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    return { total: Math.round(total), dailyAvg, categories: sorted };
  }, [allDays, result]);

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

  const currency = result.currency || "USD";

  const hasPacking = (result.packing_suggestions?.length || 0) > 0;

  const timelineNodes = useMemo(
    () => buildTimelineNodes(result.destinations, allDays, hasPacking),
    [result.destinations, allDays, hasPacking]
  );

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-background overflow-y-auto" data-results-scroll-root="true">
      {/* Timeline (desktop only) */}
      <ResultsTimeline nodes={timelineNodes} />

      <div className="max-w-[700px] mx-auto min-h-full flex flex-col lg:pl-[60px]">
        {/* Header */}
        <div data-results-header="true" className="sticky top-0 z-30 px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-3 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-accent transition-colors">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-foreground truncate">
                {result.trip_title}
              </h1>
              <p className="text-xs text-muted-foreground font-mono">{dateRange}</p>
            </div>
            {onDashboard && (
              <button
                onClick={onDashboard}
                className="p-2 rounded-full hover:bg-accent transition-colors"
                title="Trip overview"
              >
                <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <button
              onClick={() => setEditTripOpen(true)}
              className="p-2 rounded-full hover:bg-accent transition-colors"
              title="Edit trip"
            >
              <PenLine className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Stat pills */}
        <div className="px-4 pt-4 pb-2">
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

        {/* Trip summary */}
        <div className="px-4 pt-2 pb-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {result.trip_summary}
          </p>
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-border" />

        {/* Overview map */}
        <div className="mx-4 mt-4 mb-4">
          {mapVisible ? (
            <div className="rounded-xl overflow-hidden border border-[#0D9488]/20 relative animate-fade-in">
              <div className="h-[250px]">
                <ResultsMap
                  result={result}
                  activeDayIndex={-1}
                  allDays={allDays}
                  mode="overview"
                  refinedCoords={coordsVersion >= 0 ? refinedCoords : refinedCoords}
                />
              </div>
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
                <button
                  onClick={() => setMapFullscreen(true)}
                  className="pointer-events-auto absolute top-3 right-3 p-2 rounded-lg bg-card text-foreground shadow-lg border border-border hover:bg-accent transition-colors"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setMapVisible(false)}
                  className="pointer-events-auto absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-card text-foreground shadow-lg border border-border text-[11px] hover:bg-accent transition-colors"
                >
                  Hide map
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setMapVisible(true)}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border text-left hover:bg-accent/50 transition-colors"
            >
              <MapIcon className="h-4 w-4 text-[#0D9488]" />
              <span className="text-sm font-medium flex-1 text-foreground">Show map</span>
              <span className="text-xs text-muted-foreground">{totalActivities} pins</span>
            </button>
          )}
        </div>

        {/* ===== OVERALL SUMMARY SECTIONS ===== */}

        {/* Flights */}
        <div id="section-flights" className="px-4 mb-4">
          <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Plane className="h-5 w-5 text-[#0D9488]" /> Flights
          </h3>
          <div className="rounded-xl border-2 border-dashed border-border bg-accent/30 p-5 text-center">
            <Plane className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Flight search coming soon</p>
            <p className="text-xs text-muted-foreground mt-1">
              We're working on finding the best flights for your trip
            </p>
            <button
              onClick={() => toast.success("We'll let you know when flights are available!")}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0D9488]/15 border border-[#0D9488]/25 text-[#0D9488] text-xs font-medium hover:bg-[#0D9488]/25 transition-colors"
            >
              <Bell className="h-3 w-3" />
              Notify me
            </button>
          </div>
        </div>

        {/* All stays overview */}
        {result.destinations.some(d => d.accommodation) && (
          <div id="section-stays-overview" className="px-4 mb-4">
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Bed className="h-5 w-5 text-primary" /> Where you'll stay
            </h3>
            <div className="space-y-3">
              {result.destinations.filter(d => d.accommodation).map((dest, i) => {
                const destDays = allDays.filter(d => d.date >= dest.start_date && d.date <= dest.end_date);
                const nightCount = destDays.length;
                const firstDay = destDays[0]?.day_number || 1;
                const lastDay = destDays[destDays.length - 1]?.day_number || firstDay;
                const dayLabel = firstDay === lastDay ? `Day ${firstDay}` : `Days ${firstDay}–${lastDay}`;
                return (
                  <div key={i}>
                    {/* Destination context line */}
                    <div className="flex items-center gap-2 mb-1.5 ml-1">
                      <span className="text-xs font-semibold text-foreground">{dest.name}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{dayLabel} · {nightCount} {nightCount === 1 ? "night" : "nights"}</span>
                    </div>
                    <AccommodationCard
                      name={dest.accommodation!.name}
                      stars={dest.accommodation!.stars}
                      pricePerNight={dest.accommodation!.price_per_night}
                      currency={dest.accommodation!.currency}
                      bookingUrl={dest.accommodation!.booking_url}
                      locationHint={dest.name}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trip budget */}
        <div id="section-budget" className="mx-4 mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Estimated budget
          </h3>
          <p className="text-[11px] text-muted-foreground/70 mb-3 ml-7">Based on typical prices · actual costs may vary</p>

          <div className="rounded-2xl border border-border bg-gradient-to-b from-card to-muted/20 shadow-sm overflow-hidden">
            {/* Summary header */}
            <button
              onClick={() => setCostOpen(!costOpen)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-accent/30 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CreditCard className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold text-foreground">
                  ~{currency}{costBreakdown.total.toLocaleString()}
                  <span className="text-sm font-normal text-muted-foreground"> per person</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  ~{currency}{costBreakdown.dailyAvg.toLocaleString()}/day · {costBreakdown.categories.length} categories
                </div>
              </div>
              <div className={`p-1.5 rounded-lg bg-muted/50 transition-transform duration-200 ${costOpen ? "rotate-180" : ""}`}>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>

            {/* Category breakdown */}
            {costOpen && (
              <div className="px-5 pb-4 animate-fade-in">
                <div className="space-y-0">
                  {costBreakdown.categories.map(([cat, amount], i) => {
                    const pct = costBreakdown.total > 0 ? (amount / costBreakdown.total) * 100 : 0;
                    return (
                      <div key={cat} className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                        <span className="text-xs text-muted-foreground flex-1">{cat}</span>
                        <div className="w-20 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                          <div className="h-full rounded-full bg-primary/40" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs font-mono text-foreground w-24 text-right">~{currency}{Math.round(amount).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-border mt-1 pt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Total per person</span>
                  <span className="text-sm font-mono font-bold text-primary">~{currency}{costBreakdown.total.toLocaleString()}</span>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-2 italic">Estimates based on average local prices. Actual costs depend on season, availability, and personal choices.</p>
              </div>
            )}
          </div>
        </div>

        {/* Divider before destinations */}
        <div className="mx-4 border-t border-border mb-2" />

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
              <div id={`section-dest-${dest.name}`}>
                <DestinationSection
                  name={dest.name}
                  startDate={dest.start_date}
                  endDate={dest.end_date}
                  intro={dest.intro}
                  dayRange={dayRange2}
                />
              </div>

              {/* Accommodation reminder per destination — click scrolls to stays section */}
              {dest.accommodation && (
                <div className="px-4 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("section-stays-overview");
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-accent/50 border border-border hover:bg-accent/80 hover:border-primary/40 transition-all group text-left cursor-pointer"
                  >
                    <Bed className="h-4 w-4 text-[#0D9488] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground">Staying at</span>
                      <span className="text-xs font-semibold text-foreground ml-1.5 group-hover:text-primary transition-colors">{dest.accommodation.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 group-hover:text-primary/60 transition-colors">View ↑</span>
                  </button>
                </div>
              )}

              {/* Day cards */}
              <div className="space-y-2 px-4 pb-4">
                {destDays.map((day) => (
                  <DaySection
                    key={day.date}
                    day={day}
                    planId={planId || null}
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
                  />
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

        {/* Packing suggestions */}
        {hasPacking && (
          <div id="section-packing" className="mx-4 mt-2 mb-6">
            <button
              onClick={() => setPackingOpen(!packingOpen)}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border text-left hover:bg-accent/50 transition-colors"
            >
              <Package className="h-4 w-4 text-[#0D9488]" />
              <span className="text-sm font-medium flex-1 text-foreground">Packing suggestions</span>
              <span className="text-xs text-muted-foreground">{result.packing_suggestions.length} items</span>
            </button>
            {packingOpen && (
              <div className="mt-2 px-4 py-3 rounded-xl bg-card border border-border animate-fade-in">
                <ul className="space-y-1">
                  {result.packing_suggestions.map((item, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Trip-level discussion moved into Group Activity panel */}

        {/* Bottom spacer */}
        <div className="h-24" />
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-xl border-t border-border pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
        <div className="max-w-[700px] mx-auto relative">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            {standalone ? (
              <>
                <CostBottomPanel
                  totalActivities={totalActivities}
                  total={costBreakdown.total}
                  dailyAvg={costBreakdown.dailyAvg}
                  currency={currency}
                  categories={costBreakdown.categories}
                />
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    onClick={onSaveDraft}
                    className="h-9 px-4 rounded-xl text-[13px] font-semibold"
                  >
                    Save draft
                  </Button>
                  <Button
                    onClick={onCreateTrip}
                    disabled={creatingTrip}
                    className="h-9 px-4 rounded-xl font-semibold text-[13px] bg-[#0D9488] hover:bg-[#0D9488]/90 text-white"
                  >
                    {creatingTrip ? "Creating..." : "Create trip"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <CostBottomPanel
                    totalActivities={totalActivities}
                    total={costBreakdown.total}
                    dailyAvg={costBreakdown.dailyAvg}
                    currency={currency}
                    categories={costBreakdown.categories}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShare}
                    className="h-8 px-3 rounded-lg text-xs gap-1"
                  >
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRegenerate}
                    className="h-8 px-3 rounded-lg text-xs gap-1"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen map overlay */}
      {mapFullscreen && (
        <div className="fixed inset-0 z-[10000] bg-background">
          <div className="absolute top-4 left-4 z-[10001]">
            <button
              onClick={() => setMapFullscreen(false)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card text-foreground shadow-xl border border-border hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
              <span className="text-xs font-medium">Close map</span>
            </button>
          </div>
          <ResultsMap
            result={result}
            activeDayIndex={-1}
            allDays={allDays}
            mode="overview"
            refinedCoords={coordsVersion >= 0 ? refinedCoords : refinedCoords}
          />
        </div>
      )}

      {/* Alternatives Sheet */}
      {/* Group Activity floating button */}
      {planId && (
        <button
          onClick={() => setGroupActivityOpen(true)}
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-xl hover:bg-primary/90 hover:scale-105 transition-all duration-200 animate-in fade-in slide-in-from-bottom-4"
          title="Group activity"
        >
          <Users className="h-4 w-4" />
          <span className="text-xs font-semibold">Group Chat</span>
          <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
        </button>
      )}

      {/* Group Activity Panel */}
      {groupActivityOpen && planId && (
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
            onRegenerate();
          }}
          onClose={() => setEditTripOpen(false)}
        />
      )}

      {/* Concierge */}
      {!standalone && (
        <>
          <ConciergeButton onClick={() => setConciergeOpen(true)} />
          <ConciergePanel
            tripId={tripId}
            open={conciergeOpen}
            onClose={() => setConciergeOpen(false)}
            tripResult={result}
            onAddToPlan={(dayDate, activity) => state.addLocalActivity(dayDate, activity)}
          />
        </>
      )}
    </div>,
    document.body
  );
}

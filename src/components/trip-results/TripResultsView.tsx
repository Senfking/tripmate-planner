import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, RefreshCw, Package, MapPin, CalendarDays, CreditCard, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { ResultsMap } from "./ResultsMap";
import { DestinationSection } from "./DestinationSection";
import { DaySection } from "./DaySection";
import { TransportCard } from "./TransportCard";
import { AccommodationCard } from "./AccommodationCard";
import { AlternativesSheet } from "./AlternativesSheet";
import { useResultsState } from "./useResultsState";
import type { AITripResult, AIDay, AIActivity } from "./useResultsState";

interface Props {
  tripId: string;
  result: AITripResult;
  onClose: () => void;
  onRegenerate: () => void;
}

/** Capitalize first letter of each word */
function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TripResultsView({ tripId, result, onClose, onRegenerate }: Props) {
  const isMobile = useIsMobile();
  const state = useResultsState(tripId);
  const contentRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [packingOpen, setPackingOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);

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

  const remainingCount = totalActivities - state.addedCount;

  // Fix #6: Deduplicate & normalize category names
  const costBreakdown = useMemo(() => {
    const categories: Record<string, number> = {};
    let total = 0;
    for (const day of allDays) {
      for (const act of day.activities) {
        const cost = act.estimated_cost_per_person || 0;
        total += cost;
        // Normalize: lowercase then titleCase, merge "accommodation" variants
        const rawCat = (act.category || "Other").toLowerCase().trim();
        const cat = titleCase(rawCat);
        categories[cat] = (categories[cat] || 0) + cost;
      }
    }
    // Add accommodation from destination-level accommodation cards
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

  // Fix #4: budget level label
  const budgetLevel = useMemo(() => {
    const avg = costBreakdown.dailyAvg;
    if (avg <= 50) return "budget";
    if (avg <= 150) return "mid-range";
    if (avg <= 300) return "premium";
    return "luxury";
  }, [costBreakdown]);

  // Fix #5: Track scroll position to toggle overview vs day mode
  useEffect(() => {
    const container = contentRef.current;
    if (!container || isMobile) return;

    const handleScroll = () => {
      if (container.scrollTop < 80) {
        state.setMapMode("overview");
        state.setActiveDayIndex(-1);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [isMobile]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const date = entry.target.getAttribute("data-day-date");
            if (date) {
              const idx = allDays.findIndex((d) => d.date === date);
              if (idx >= 0) {
                state.setActiveDayIndex(idx);
                state.setMapMode("day");
              }
            }
          }
        }
      },
      { threshold: 0.3, root: contentRef.current }
    );

    dayRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [allDays]);

  const scrollToActivity = useCallback((dayDate: string, _actIdx: number) => {
    const el = dayRefs.current.get(dayDate);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleRemoveActivity = useCallback((_dayDate: string, _index: number) => {}, []);

  const dateRange = useMemo(() => {
    if (result.destinations.length === 0) return "";
    const first = result.destinations[0].start_date;
    const last = result.destinations[result.destinations.length - 1].end_date;
    try {
      return `${format(parseISO(first), "MMM d")}–${format(parseISO(last), "MMM d")}`;
    } catch {
      return `${first} – ${last}`;
    }
  }, [result]);

  const destinationNames = result.destinations.map((d) => d.name).join(" · ");
  const currency = result.currency || "USD";

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-background">
      {/* Map — true full screen on desktop */}
      {!isMobile && (
        <div className="absolute inset-0 z-0">
          <ResultsMap
            result={result}
            activeDayIndex={state.activeDayIndex}
            allDays={allDays}
            mode={state.mapMode}
            onPinClick={scrollToActivity}
          />
        </div>
      )}

      {/* Floating top-left controls on desktop */}
      {!isMobile && (
        <div className="absolute top-4 left-4 z-[1001] flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-black/50 backdrop-blur-xl border border-white/15 hover:bg-black/60 transition-colors shadow-lg"
            >
              <ArrowLeft className="h-4 w-4 text-white" />
            </button>
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/50 backdrop-blur-xl border border-white/15 shadow-lg">
              <span className="text-[11px] text-white/80 whitespace-nowrap font-mono inline-flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" /> {destinationNames}
              </span>
              <span className="text-white/30">·</span>
              <span className="text-[11px] text-white/80 whitespace-nowrap font-mono inline-flex items-center gap-1">
                <CalendarDays className="h-2.5 w-2.5" /> {dateRange}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              className="text-[11px] text-white/70 hover:text-white hover:bg-white/10 gap-1 h-8 rounded-xl bg-black/50 backdrop-blur-xl border border-white/15 shadow-lg"
            >
              <RefreshCw className="h-3 w-3" /> Regenerate
            </Button>
          </div>
          {/* Fix #4: Condensed stats row */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/50 backdrop-blur-xl border border-white/15 shadow-lg w-fit">
            <span className="text-[10px] text-white/60 font-mono">
              {allDays.length} days · {totalActivities} activities · ~{currency}{costBreakdown.total}/person · {budgetLevel}
            </span>
          </div>
        </div>
      )}

      {/* Mobile: stacked layout with header */}
      {isMobile && (
        <div className="flex flex-col h-full">
          <div className="sticky top-0 z-30 px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2 bg-background/90 backdrop-blur-xl border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-accent transition-colors">
                <ArrowLeft className="h-5 w-5 text-foreground" />
              </button>
              <h1 className="flex-1 text-center text-sm font-semibold text-foreground truncate leading-tight">
                {result.trip_title}
              </h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                className="text-xs text-muted-foreground hover:text-foreground gap-1 h-8"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-1.5 overflow-x-auto scrollbar-hide pb-1">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap font-mono px-2 py-0.5 rounded-full bg-accent inline-flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" /> {destinationNames}
              </span>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap font-mono px-2 py-0.5 rounded-full bg-accent inline-flex items-center gap-1">
                <CalendarDays className="h-2.5 w-2.5" /> {dateRange}
              </span>
            </div>
            {/* Fix #4: Mobile condensed stats */}
            <div className="mt-1 text-[10px] text-muted-foreground font-mono">
              {allDays.length} days · {totalActivities} activities · ~{currency}{costBreakdown.total}/person · {budgetLevel}
            </div>
          </div>
          <div className="h-[35vh] flex-shrink-0">
            <ResultsMap
              result={result}
              activeDayIndex={state.activeDayIndex}
              allDays={allDays}
              mode={state.mapMode}
              onPinClick={scrollToActivity}
            />
          </div>
          {/* Mobile scrollable content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto bg-background" style={{ paddingBottom: 100 }}>
            {/* Trip summary */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {result.trip_summary}
              </p>
            </div>

            {result.destinations.map((dest, destIdx) => {
              const destDays = allDays.filter(
                (d) => d.date >= dest.start_date && d.date <= dest.end_date
              );
              const firstDay = destDays[0]?.day_number || 1;
              const lastDay = destDays[destDays.length - 1]?.day_number || firstDay;
              const dayRange2 = firstDay === lastDay ? `Day ${firstDay}` : `Days ${firstDay}–${lastDay}`;

              return (
                <div key={destIdx}>
                  <DestinationSection
                    name={dest.name}
                    startDate={dest.start_date}
                    endDate={dest.end_date}
                    intro={dest.intro}
                    dayRange={dayRange2}
                  />
                  {dest.accommodation && (
                    <AccommodationCard
                      name={dest.accommodation.name}
                      stars={dest.accommodation.stars}
                      pricePerNight={dest.accommodation.price_per_night}
                      currency={dest.accommodation.currency}
                      bookingUrl={dest.accommodation.booking_url}
                    />
                  )}
                  {destDays.map((day, dayIdx) => (
                    <DaySection
                      key={day.date}
                      ref={(el) => { if (el) dayRefs.current.set(day.date, el); }}
                      day={day}
                      defaultExpanded={dayIdx === 0}
                      isAdded={state.isAdded}
                      onToggleAdd={(d, a) => state.toggleActivity(d, a)}
                      onRequestChange={(dd, i, a) => state.requestAlternatives(dd, i, a, tripId)}
                      onRemoveActivity={handleRemoveActivity}
                    />
                  ))}
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
            {result.packing_suggestions && result.packing_suggestions.length > 0 && (
              <div className="mx-4 mt-4 mb-6">
                <button
                  onClick={() => setPackingOpen(!packingOpen)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border text-left"
                >
                  <Package className="h-4 w-4 text-muted-foreground" />
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

            {/* Fix #3: Bottom bar with cost breakdown (mobile) */}
            <div className="sticky bottom-0 z-20 px-4 bg-background/90 backdrop-blur-xl border-t border-border pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
              {costOpen && (
                <div className="px-2 pt-3 pb-2 space-y-1.5 animate-fade-in">
                  {costBreakdown.categories.map(([cat, amount]) => (
                    <div key={cat} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{cat}</span>
                      <span className="text-xs font-mono text-foreground">~{currency}{Math.round(amount)}</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Total per person</span>
                    <span className="text-xs font-mono font-semibold text-primary">~{currency}{costBreakdown.total}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 py-3">
                <button
                  onClick={() => setCostOpen(!costOpen)}
                  className="text-[11px] font-mono text-muted-foreground flex items-center gap-1"
                >
                  {totalActivities} activities · ~{currency}{costBreakdown.total} total · ~{currency}{costBreakdown.dailyAvg}/day
                  {costOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                </button>
                <Button
                  onClick={() => state.addAllActivities(result)}
                  disabled={state.isAddingAll || remainingCount === 0}
                  className="h-9 px-4 rounded-xl font-semibold text-[13px]"
                >
                  {state.isAddingAll
                    ? "Adding..."
                    : remainingCount === totalActivities
                    ? "Add all to itinerary"
                    : remainingCount === 0
                    ? "All added"
                    : `Add remaining ${remainingCount}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop floating panel — Fix #1: force light text via dark theme overrides */}
      {!isMobile && (
        <div
          ref={contentRef}
          className="absolute top-4 right-4 bottom-4 w-[450px] z-[1001] rounded-2xl shadow-2xl flex flex-col border border-white/[0.12] overflow-hidden trip-results-dark-panel"
          style={{
            backgroundColor: "rgba(11, 14, 14, 0.88)",
            backdropFilter: "blur(24px) saturate(1.4)",
            WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          }}
        >
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {/* Trip summary */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-sm leading-relaxed text-white/70">
                {result.trip_summary}
              </p>
            </div>

            {result.destinations.map((dest, destIdx) => {
              const destDays = allDays.filter(
                (d) => d.date >= dest.start_date && d.date <= dest.end_date
              );
              const firstDay = destDays[0]?.day_number || 1;
              const lastDay = destDays[destDays.length - 1]?.day_number || firstDay;
              const dayRange2 = firstDay === lastDay ? `Day ${firstDay}` : `Days ${firstDay}–${lastDay}`;

              return (
                <div key={destIdx}>
                  <DestinationSection
                    name={dest.name}
                    startDate={dest.start_date}
                    endDate={dest.end_date}
                    intro={dest.intro}
                    dayRange={dayRange2}
                  />
                  {dest.accommodation && (
                    <AccommodationCard
                      name={dest.accommodation.name}
                      stars={dest.accommodation.stars}
                      pricePerNight={dest.accommodation.price_per_night}
                      currency={dest.accommodation.currency}
                      bookingUrl={dest.accommodation.booking_url}
                    />
                  )}
                  {destDays.map((day, dayIdx) => (
                    <DaySection
                      key={day.date}
                      ref={(el) => { if (el) dayRefs.current.set(day.date, el); }}
                      day={day}
                      defaultExpanded={dayIdx === 0}
                      isAdded={state.isAdded}
                      onToggleAdd={(d, a) => state.toggleActivity(d, a)}
                      onRequestChange={(dd, i, a) => state.requestAlternatives(dd, i, a, tripId)}
                      onRemoveActivity={handleRemoveActivity}
                    />
                  ))}
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
            {result.packing_suggestions && result.packing_suggestions.length > 0 && (
              <div className="mx-4 mt-4 mb-6">
                <button
                  onClick={() => setPackingOpen(!packingOpen)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.07] border border-white/10 text-left"
                >
                  <Package className="h-4 w-4 text-white/50" />
                  <span className="text-sm font-medium flex-1 text-white">Packing suggestions</span>
                  <span className="text-xs text-white/40">{result.packing_suggestions.length} items</span>
                </button>
                {packingOpen && (
                  <div className="mt-2 px-4 py-3 rounded-xl bg-white/[0.05] border border-white/10 animate-fade-in">
                    <ul className="space-y-1">
                      {result.packing_suggestions.map((item, i) => (
                        <li key={i} className="text-xs text-white/60 flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="h-16" />
          </div>

          {/* Fix #3: Desktop bottom bar with expandable cost breakdown */}
          <div className="sticky bottom-0 z-20 bg-black/50 backdrop-blur-xl border-t border-white/10 rounded-b-2xl">
            {costOpen && (
              <div className="px-4 pt-3 pb-2 space-y-1.5 animate-fade-in border-b border-white/10">
                {costBreakdown.categories.map(([cat, amount]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-xs text-white/50">{cat}</span>
                    <span className="text-xs font-mono text-white/80">~{currency}{Math.round(amount)}</span>
                  </div>
                ))}
                <div className="border-t border-white/10 pt-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Total per person</span>
                  <span className="text-xs font-mono font-semibold text-primary">~{currency}{costBreakdown.total}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                onClick={() => setCostOpen(!costOpen)}
                className="text-[11px] text-white/50 font-mono flex items-center gap-1 hover:text-white/70 transition-colors"
              >
                {totalActivities} activities · ~{currency}{costBreakdown.total} total · ~{currency}{costBreakdown.dailyAvg}/day
                {costOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </button>
              <Button
                onClick={() => state.addAllActivities(result)}
                disabled={state.isAddingAll || remainingCount === 0}
                className="h-9 px-4 rounded-xl font-semibold text-[13px]"
              >
                {state.isAddingAll
                  ? "Adding..."
                  : remainingCount === totalActivities
                  ? "Add all to itinerary"
                  : remainingCount === 0
                  ? "All added"
                  : `Add remaining ${remainingCount}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fix #2: Alternatives Sheet — z-index above everything */}
      {state.alternativesFor && (
        <AlternativesSheet
          activity={state.alternativesFor.activity}
          alternatives={state.alternatives}
          loading={state.loadingAlternatives}
          onSelect={(alt) => {
            state.setAlternativesFor(null);
          }}
          onClose={() => state.setAlternativesFor(null)}
        />
      )}
    </div>,
    document.body
  );
}

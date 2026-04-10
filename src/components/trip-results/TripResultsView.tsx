import { useCallback, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, RefreshCw, Package, MapPin, CalendarDays, CreditCard } from "lucide-react";
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
import { useState } from "react";

interface Props {
  tripId: string;
  result: AITripResult;
  onClose: () => void;
  onRegenerate: () => void;
}

export function TripResultsView({ tripId, result, onClose, onRegenerate }: Props) {
  const isMobile = useIsMobile();
  const state = useResultsState(tripId);
  const contentRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [packingOpen, setPackingOpen] = useState(false);

  // Flatten all days for map and scroll-spy
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

  // Scroll-spy with IntersectionObserver
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

  // Scroll to a card when map pin is clicked
  const scrollToActivity = useCallback((dayDate: string, _actIdx: number) => {
    const el = dayRefs.current.get(dayDate);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleRemoveActivity = useCallback((_dayDate: string, _index: number) => {
    // For now just a visual removal — would need result state mutation
  }, []);

  // Date range display
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

  return (
    <div className="fixed inset-0 z-50 bg-[#0f1115] flex flex-col" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Top Bar */}
      <div className="sticky top-0 z-20 px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2 bg-[rgba(15,17,21,0.85)] backdrop-blur-xl border-b border-border/20">
        <div className="flex items-center justify-between gap-2">
          <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-[#1e2130] transition-colors">
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
        {/* Info pills */}
        <div className="flex items-center gap-2 mt-1.5 overflow-x-auto scrollbar-hide pb-1">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap font-mono px-2 py-0.5 rounded-full bg-[#1e2130] inline-flex items-center gap-1">
            <MapPin className="h-2.5 w-2.5" /> {destinationNames}
          </span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap font-mono px-2 py-0.5 rounded-full bg-[#1e2130] inline-flex items-center gap-1">
            <CalendarDays className="h-2.5 w-2.5" /> {dateRange}
          </span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap font-mono px-2 py-0.5 rounded-full bg-[#1e2130] inline-flex items-center gap-1">
            <CreditCard className="h-2.5 w-2.5" /> ~{result.currency || "€"}{result.daily_budget_estimate}/day
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex ${isMobile ? "flex-col" : "flex-row"} overflow-hidden`}>
        {/* Map */}
        <div className={isMobile ? "h-[40vh] flex-shrink-0" : "w-[45%] sticky top-0 h-full"}>
          <ResultsMap
            result={result}
            activeDayIndex={state.activeDayIndex}
            allDays={allDays}
            mode={state.mapMode}
            onPinClick={scrollToActivity}
          />
        </div>

        {/* Content Panel */}
        <div
          ref={contentRef}
          className={`flex-1 overflow-y-auto ${isMobile ? "" : "w-[55%]"}`}
          style={{ paddingBottom: 100 }}
        >
          {/* Trip summary */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm text-muted-foreground/70 leading-relaxed">
              {result.trip_summary}
            </p>
          </div>

          {result.destinations.map((dest, destIdx) => {
            const destDays = allDays.filter(
              (d) => d.date >= dest.start_date && d.date <= dest.end_date
            );
            const firstDay = destDays[0]?.day_number || 1;
            const lastDay = destDays[destDays.length - 1]?.day_number || firstDay;
            const dayRange = firstDay === lastDay ? `Day ${firstDay}` : `Days ${firstDay}–${lastDay}`;

            return (
              <div key={destIdx}>
                <DestinationSection
                  name={dest.name}
                  startDate={dest.start_date}
                  endDate={dest.end_date}
                  intro={dest.intro}
                  dayRange={dayRange}
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
                    ref={(el) => {
                      if (el) dayRefs.current.set(day.date, el);
                    }}
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
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-[#161920] border border-border/20 text-left"
              >
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground font-medium flex-1">
                  Packing suggestions
                </span>
                <span className="text-xs text-muted-foreground">
                  {result.packing_suggestions.length} items
                </span>
              </button>
              {packingOpen && (
                <div className="mt-2 px-4 py-3 rounded-xl bg-[#161920] border border-border/20 animate-fade-in">
                  <ul className="space-y-1">
                    {result.packing_suggestions.map((item, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-0 z-20 px-4 py-3 bg-[rgba(15,17,21,0.85)] backdrop-blur-xl border-t border-border/20 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-muted-foreground font-mono">
            {totalActivities} activities · ~{result.currency || "€"}{result.daily_budget_estimate}/day
          </div>
          <Button
            onClick={() => state.addAllActivities(result)}
            disabled={state.isAddingAll || remainingCount === 0}
            className="h-9 px-4 rounded-xl font-semibold text-[13px] bg-[#0D9488] hover:bg-[#0D9488]/90 text-white"
          >
            {state.isAddingAll
              ? "Adding..."
              : remainingCount === totalActivities
              ? "Add all to itinerary"
              : remainingCount === 0
              ? "All added ✓"
              : `Add remaining ${remainingCount}`}
          </Button>
        </div>
      </div>

      {/* Alternatives Sheet */}
      {state.alternativesFor && (
        <AlternativesSheet
          activity={state.alternativesFor.activity}
          alternatives={state.alternatives}
          loading={state.loadingAlternatives}
          onSelect={(alt) => {
            // Swap activity — for now just close
            state.setAlternativesFor(null);
          }}
          onClose={() => state.setAlternativesFor(null)}
        />
      )}
    </div>
  );
}

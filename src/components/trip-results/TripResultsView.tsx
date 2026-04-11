import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Package, MapPin, CalendarDays, CreditCard, ChevronDown } from "lucide-react";
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

  const costBreakdown = useMemo(() => {
    const categories: Record<string, number> = {};
    let total = 0;
    for (const day of allDays) {
      for (const act of day.activities) {
        const cost = act.estimated_cost_per_person || 0;
        total += cost;
        const cat = act.category || "Other";
        categories[cat] = (categories[cat] || 0) + cost;
      }
    }
    // Add accommodation
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

  return (
    <div className="fixed inset-0 z-[60] bg-background">
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
        <div className="absolute top-4 left-4 z-[1001] flex items-center gap-2">
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
              <span className="text-[11px] text-muted-foreground whitespace-nowrap font-mono px-2 py-0.5 rounded-full bg-accent inline-flex items-center gap-1">
                <CreditCard className="h-2.5 w-2.5" /> ~{result.currency || "€"}{result.daily_budget_estimate}/day
              </span>
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
        {/* Floating Panel content — shared between mobile and desktop */}
        {(() => {
          const panelContent = (
            <>
              {/* Scrollable content area */}
              <div className={isMobile ? "" : "flex-1 overflow-y-auto"}>
                {/* Trip summary */}
                <div className="px-4 pt-4 pb-2">
                  <p className={`text-sm leading-relaxed ${isMobile ? "text-muted-foreground" : "text-white/70"}`}>
                    {result.trip_summary}
                  </p>
                </div>

                {/* Cost breakdown */}
                <div className="mx-4 mb-3">
                  <button
                    onClick={() => setCostOpen(!costOpen)}
                    className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-left transition-colors ${
                      isMobile
                        ? "bg-card border border-primary/20 hover:bg-accent/50"
                        : "bg-white/[0.07] border border-white/10 hover:bg-white/[0.12]"
                    }`}
                  >
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className={`text-sm font-medium flex-1 ${isMobile ? "text-foreground" : "text-white"}`}>
                      ~{result.currency || "USD"}{costBreakdown.total}/person total
                    </span>
                    <span className={`text-[11px] font-mono mr-1 ${isMobile ? "text-muted-foreground" : "text-white/50"}`}>
                      ~{result.currency || "USD"}{costBreakdown.dailyAvg}/day
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isMobile ? "text-muted-foreground" : "text-white/50"} ${costOpen ? "rotate-180" : ""}`} />
                  </button>
                  {costOpen && (
                    <div className={`mt-2 px-4 py-3 rounded-xl animate-fade-in space-y-2 ${
                      isMobile ? "bg-card border border-border" : "bg-white/[0.05] border border-white/10"
                    }`}>
                      {costBreakdown.categories.map(([cat, amount]) => (
                        <div key={cat} className="flex items-center justify-between">
                          <span className={`text-xs capitalize ${isMobile ? "text-muted-foreground" : "text-white/50"}`}>{cat}</span>
                          <span className={`text-xs font-mono ${isMobile ? "text-foreground" : "text-white/80"}`}>
                            ~{result.currency || "USD"}{Math.round(amount)}
                          </span>
                        </div>
                      ))}
                      <div className={`border-t pt-2 flex items-center justify-between ${isMobile ? "border-border" : "border-white/10"}`}>
                        <span className={`text-xs font-semibold ${isMobile ? "text-foreground" : "text-white"}`}>Total per person</span>
                        <span className="text-xs font-mono font-semibold text-primary">
                          ~{result.currency || "USD"}{costBreakdown.total}
                        </span>
                      </div>
                    </div>
                  )}
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
                      className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-left ${
                        isMobile ? "bg-card border border-border" : "bg-white/[0.07] border border-white/10"
                      }`}
                    >
                      <Package className={`h-4 w-4 ${isMobile ? "text-muted-foreground" : "text-white/50"}`} />
                      <span className={`text-sm font-medium flex-1 ${isMobile ? "text-foreground" : "text-white"}`}>
                        Packing suggestions
                      </span>
                      <span className={`text-xs ${isMobile ? "text-muted-foreground" : "text-white/40"}`}>
                        {result.packing_suggestions.length} items
                      </span>
                    </button>
                    {packingOpen && (
                      <div className={`mt-2 px-4 py-3 rounded-xl animate-fade-in ${
                        isMobile ? "bg-card border border-border" : "bg-white/[0.05] border border-white/10"
                      }`}>
                        <ul className="space-y-1">
                          {result.packing_suggestions.map((item, i) => (
                            <li key={i} className={`text-xs flex items-center gap-2 ${isMobile ? "text-muted-foreground" : "text-white/60"}`}>
                              <span className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Spacer for bottom bar inside panel */}
                {!isMobile && <div className="h-16" />}
              </div>

              {/* Bottom Action Bar */}
              <div
                className={
                  isMobile
                    ? "sticky bottom-0 z-20 px-4 py-3 bg-background/90 backdrop-blur-xl border-t border-border pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
                    : "sticky bottom-0 z-20 px-4 py-3 bg-black/40 backdrop-blur-xl border-t border-white/10 rounded-b-2xl"
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className={`text-[11px] font-mono ${isMobile ? "text-muted-foreground" : "text-white/50"}`}>
                    {totalActivities} activities · ~{result.currency || "€"}{result.daily_budget_estimate}/day
                  </div>
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
            </>
          );

          if (isMobile) {
            return (
              <div ref={contentRef} className="flex-1 overflow-y-auto bg-background" style={{ paddingBottom: 100 }}>
                {panelContent}
              </div>
            );
          }

          return null;
        })()}
        </div>
      )}

      {/* Desktop floating panel */}
      {!isMobile && (
        <div
          ref={contentRef}
          className="absolute top-4 right-4 bottom-4 w-[450px] z-[1001] rounded-2xl shadow-2xl flex flex-col border border-white/[0.12] overflow-hidden"
          style={{
            backgroundColor: "rgba(11, 14, 14, 0.88)",
            backdropFilter: "blur(24px) saturate(1.4)",
            WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          }}
        >
          {(() => {
            const panelContent = (
              <>
                <div className="flex-1 overflow-y-auto">
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-sm leading-relaxed text-white/70">
                      {result.trip_summary}
                    </p>
                  </div>

                  <div className="mx-4 mb-3">
                    <button
                      onClick={() => setCostOpen(!costOpen)}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.07] border border-white/10 text-left transition-colors hover:bg-white/[0.12]"
                    >
                      <CreditCard className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium flex-1 text-white">
                        ~{result.currency || "USD"}{costBreakdown.total}/person total
                      </span>
                      <span className="text-[11px] font-mono mr-1 text-white/50">
                        ~{result.currency || "USD"}{costBreakdown.dailyAvg}/day
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-white/50 transition-transform ${costOpen ? "rotate-180" : ""}`} />
                    </button>
                    {costOpen && (
                      <div className="mt-2 px-4 py-3 rounded-xl bg-white/[0.05] border border-white/10 animate-fade-in space-y-2">
                        {costBreakdown.categories.map(([cat, amount]) => (
                          <div key={cat} className="flex items-center justify-between">
                            <span className="text-xs text-white/50 capitalize">{cat}</span>
                            <span className="text-xs font-mono text-white/80">
                              ~{result.currency || "USD"}{Math.round(amount)}
                            </span>
                          </div>
                        ))}
                        <div className="border-t border-white/10 pt-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">Total per person</span>
                          <span className="text-xs font-mono font-semibold text-primary">
                            ~{result.currency || "USD"}{costBreakdown.total}
                          </span>
                        </div>
                      </div>
                    )}
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

                  {result.packing_suggestions && result.packing_suggestions.length > 0 && (
                    <div className="mx-4 mt-4 mb-6">
                      <button
                        onClick={() => setPackingOpen(!packingOpen)}
                        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.07] border border-white/10 text-left"
                      >
                        <Package className="h-4 w-4 text-white/50" />
                        <span className="text-sm font-medium flex-1 text-white">
                          Packing suggestions
                        </span>
                        <span className="text-xs text-white/40">
                          {result.packing_suggestions.length} items
                        </span>
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

                <div className="sticky bottom-0 z-20 px-4 py-3 bg-black/40 backdrop-blur-xl border-t border-white/10 rounded-b-2xl">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] text-white/50 font-mono">
                      {totalActivities} activities · ~{result.currency || "€"}{result.daily_budget_estimate}/day
                    </div>
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
              </>
            );
            return panelContent;
          })()}
        </div>
      )}

      {/* Alternatives Sheet */}
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
    </div>
  );
}

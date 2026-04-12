import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, RefreshCw, Package, MapPin, CalendarDays, CreditCard, ChevronDown, ChevronUp, Share2, SlidersHorizontal, Hotel, Sparkles, Map as MapIcon, Maximize2, X, Plane, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { DestinationSection } from "./DestinationSection";
import { DaySection } from "./DaySection";
import { TransportCard } from "./TransportCard";
import { AccommodationCard } from "./AccommodationCard";
import { AlternativesSheet } from "./AlternativesSheet";
import { ResultsMap } from "./ResultsMap";
import { useResultsState } from "./useResultsState";
import type { AITripResult, AIDay, AIActivity } from "./useResultsState";

interface Props {
  tripId: string;
  planId?: string | null;
  result: AITripResult;
  onClose: () => void;
  onRegenerate: () => void;
  onAdjust?: () => void;
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TripResultsView({ tripId, planId, result, onClose, onRegenerate, onAdjust }: Props) {
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
  type CoordsMap = Map<string, { lat: number; lng: number }>;
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

  const remainingCount = totalActivities - state.addedCount;

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

  const handleRemoveActivity = useCallback((_dayDate: string, _index: number) => {}, []);

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

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-background overflow-y-auto">
      <div className="max-w-[700px] mx-auto min-h-full flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-30 px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-3 bg-background/80 backdrop-blur-xl border-b border-border">
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

        {/* Overview map — default visible at 250px */}
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
              <button
                onClick={() => setMapFullscreen(true)}
                className="absolute top-3 right-3 p-2 rounded-lg bg-background/80 backdrop-blur-sm border border-border hover:bg-accent transition-colors"
              >
                <Maximize2 className="h-4 w-4 text-foreground" />
              </button>
              <button
                onClick={() => setMapVisible(false)}
                className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-background/80 backdrop-blur-sm border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Hide map
              </button>
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

        {/* Per-destination content */}
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

              {/* ✈️ Flights placeholder — first destination only */}
              {destIdx === 0 && (
                <div className="px-4 mb-4">
                  <h3 className="text-lg font-semibold text-foreground mb-3">✈️ Flights</h3>
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
              )}

              {/* 🏨 Accommodation */}
              {dest.accommodation && (
                <div className="px-4">
                  <h3 className="text-lg font-semibold text-foreground mb-3">🏨 Where you'll stay</h3>
                </div>
              )}
              {dest.accommodation && (
                <AccommodationCard
                  name={dest.accommodation.name}
                  stars={dest.accommodation.stars}
                  pricePerNight={dest.accommodation.price_per_night}
                  currency={dest.accommodation.currency}
                  bookingUrl={dest.accommodation.booking_url}
                  locationHint={dest.name}
                />
              )}

              {/* 💰 Cost summary */}
              {destIdx === 0 && (
                <div className="mx-4 mb-4">
                  <h3 className="text-lg font-semibold text-foreground mb-3">💰 Trip budget</h3>
                  <button
                    onClick={() => setCostOpen(!costOpen)}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border text-left hover:bg-accent/50 transition-colors"
                  >
                    <CreditCard className="h-4 w-4 text-[#0D9488]" />
                    <span className="flex-1 text-sm font-medium text-foreground">
                      ~{currency}{costBreakdown.total} total
                      <span className="text-muted-foreground font-normal"> · ~{currency}{costBreakdown.dailyAvg}/day</span>
                    </span>
                    {costOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {costOpen && (
                    <div className="mt-2 px-4 py-3 rounded-xl bg-card border border-border animate-fade-in space-y-1.5">
                      {costBreakdown.categories.map(([cat, amount]) => (
                        <div key={cat} className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{cat}</span>
                          <span className="text-xs font-mono text-foreground">~{currency}{Math.round(amount)}</span>
                        </div>
                      ))}
                      <div className="border-t border-border pt-1.5 flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Total per person</span>
                        <span className="text-xs font-mono font-semibold text-[#0D9488]">~{currency}{costBreakdown.total}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 📅 Itinerary */}
              <div className="px-4 mb-3">
                <h3 className="text-lg font-semibold text-foreground">📅 Your itinerary</h3>
              </div>

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
                    isAdded={state.isAdded}
                    onToggleAdd={(d, a) => state.toggleActivity(d, a)}
                    onRequestChange={(dd, i, a) => state.requestAlternatives(dd, i, a, tripId)}
                    onRemoveActivity={handleRemoveActivity}
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
        {result.packing_suggestions && result.packing_suggestions.length > 0 && (
          <div className="mx-4 mt-2 mb-6">
            <button
              onClick={() => setPackingOpen(!packingOpen)}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border text-left hover:bg-accent/50 transition-colors"
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

        {/* Bottom spacer */}
        <div className="h-24" />
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-xl border-t border-border pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
        <div className="max-w-[700px] mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              className="text-xs text-muted-foreground hover:text-foreground gap-1 h-8 px-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {onAdjust && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onAdjust}
                className="text-xs text-muted-foreground hover:text-foreground gap-1 h-8 px-2"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="text-xs text-muted-foreground hover:text-foreground gap-1 h-8 px-2"
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>
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

      {/* Fullscreen map overlay */}
      {mapFullscreen && (
        <div className="fixed inset-0 z-[10000] bg-background">
          <div className="absolute top-4 left-4 z-10">
            <button
              onClick={() => setMapFullscreen(false)}
              className="p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-accent transition-colors"
            >
              <X className="h-5 w-5 text-foreground" />
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
      {state.alternativesFor && (
        <AlternativesSheet
          activity={state.alternativesFor.activity}
          alternatives={state.alternatives}
          loading={state.loadingAlternatives}
          onSelect={() => {
            state.setAlternativesFor(null);
          }}
          onClose={() => state.setAlternativesFor(null)}
        />
      )}
    </div>,
    document.body
  );
}

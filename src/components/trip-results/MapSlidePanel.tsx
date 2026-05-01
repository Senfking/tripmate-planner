import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon, X, Maximize2, Minimize2, CalendarDays, MapPin, Sparkles, ArrowLeft } from "lucide-react";
import { ResultsMap } from "./ResultsMap";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { AITripResult, AIDay } from "./useResultsState";

export type MapState = "closed" | "partial" | "full";

interface Props {
  result: AITripResult;
  allDays: AIDay[];
  refinedCoords: Map<string, { lat: number; lng: number }>;
  totalActivities: number;
  state: MapState;
  onStateChange: (state: MapState) => void;
}

export function MapSlidePanel({ result, allDays, refinedCoords, totalActivities, state, onStateChange }: Props) {
  const [activeDayIndex, setActiveDayIndex] = useState(-1);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // On mobile, "partial" doesn't make sense (no side-by-side layout) — promote to "full".
  useEffect(() => {
    if (!isDesktop && state === "partial") onStateChange("full");
  }, [isDesktop, state, onStateChange]);

  useEffect(() => {
    if (state === "closed") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onStateChange(state === "full" && isDesktop ? "partial" : "closed");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, onStateChange, isDesktop]);

  useEffect(() => {
    if (state === "closed") setActiveDayIndex(-1);
  }, [state]);

  const dayCount = allDays.length;

  const dateRange = useMemo(() => {
    if (result.destinations.length === 0) return "";
    const first = result.destinations[0].start_date;
    const last = result.destinations[result.destinations.length - 1].end_date;
    try {
      return `${format(parseISO(first), "MMM d")} – ${format(parseISO(last), "MMM d")}`;
    } catch {
      return "";
    }
  }, [result]);

  const activeActivities = useMemo(() => {
    if (activeDayIndex < 0) return totalActivities;
    return allDays[activeDayIndex]?.activities.length || 0;
  }, [activeDayIndex, allDays, totalActivities]);

  if (state === "closed") return null;

  const mapMode = activeDayIndex >= 0 ? "day" : "overview";

  if (state === "partial") {
    return (
      <div className="relative w-[440px] max-w-[46vw] min-w-[400px] shrink-0 border-l border-border bg-background">
        <div className="absolute inset-0 z-0">
          <ResultsMap
            key="partial"
            result={result}
            activeDayIndex={activeDayIndex}
            allDays={allDays}
            mode={mapMode}
            refinedCoords={refinedCoords}
          />
        </div>

        <div className="absolute inset-x-0 top-0 z-20 border-b border-border bg-background/92 backdrop-blur-xl">
          <div className="flex items-center gap-2 px-4 py-3">
            <MapIcon className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground">Trip Map</span>
              <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                {dayCount} days · {totalActivities} spots
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onStateChange("full")}
                className="h-8 w-8 rounded-lg border border-border bg-card text-foreground shadow-sm hover:bg-accent transition-colors flex items-center justify-center"
                title="Open full screen map"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => onStateChange("closed")}
                className="h-8 w-8 rounded-lg border border-border bg-card text-foreground shadow-sm hover:bg-accent transition-colors flex items-center justify-center"
                title="Close map"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div
            className="flex gap-1.5 px-3 pb-3 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch" }}
          >
            <button
              onClick={() => setActiveDayIndex(-1)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors shrink-0",
                activeDayIndex === -1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              All days
            </button>
            {allDays.map((day, i) => (
              <button
                key={day.date}
                onClick={() => setActiveDayIndex(i)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors shrink-0",
                  activeDayIndex === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                Day {day.day_number}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-muted">
      <div className="absolute inset-0">
        <ResultsMap
          key="full"
          result={result}
          activeDayIndex={activeDayIndex}
          allDays={allDays}
          mode={mapMode}
          refinedCoords={refinedCoords}
        />
      </div>

      <div
        className="absolute inset-x-0 top-0 z-[1200] px-3 sm:px-4 pb-4 pointer-events-none"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      >
        {/* Mobile-first: back button row, then info card below */}
        <div className="flex items-start gap-2 sm:gap-3">
          {/* Mobile back/close button (left) */}
          <button
            onClick={() => onStateChange("closed")}
            className="sm:hidden pointer-events-auto h-10 w-10 rounded-full bg-card/92 backdrop-blur-xl border border-border text-foreground shadow-lg hover:bg-accent transition-colors flex items-center justify-center shrink-0"
            aria-label="Close map"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Info card — full width on mobile (minus buttons), constrained on desktop */}
          <div className="pointer-events-auto bg-card/92 backdrop-blur-xl rounded-2xl border border-border shadow-2xl px-4 py-3 sm:px-5 sm:py-4 flex-1 min-w-0 sm:max-w-sm sm:flex-initial">
            <h2 className="text-sm sm:text-base font-bold text-foreground truncate">{result.trip_title}</h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{dateRange}</p>
            <div className="flex items-center gap-3 mt-2 sm:mt-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] text-primary font-semibold">
                <CalendarDays className="h-3 w-3" /> {dayCount} days
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-primary font-semibold">
                <MapPin className="h-3 w-3" /> {result.destinations.length} cities
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-primary font-semibold">
                <Sparkles className="h-3 w-3" /> {activeActivities} spots
              </span>
            </div>
          </div>

          <div className="hidden sm:block flex-1" />

          {/* Desktop controls (right) */}
          <div className="hidden sm:flex pointer-events-auto items-center gap-2 shrink-0">
            {isDesktop && (
              <button
                onClick={() => onStateChange("partial")}
                className="h-10 w-10 rounded-xl border border-border bg-card/92 backdrop-blur-xl text-foreground shadow-2xl hover:bg-accent transition-colors flex items-center justify-center"
                title="Back to partial map"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => onStateChange("closed")}
              className="h-10 w-10 rounded-xl border border-border bg-card/92 backdrop-blur-xl text-foreground shadow-2xl hover:bg-accent transition-colors flex items-center justify-center"
              title="Close map"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-[1200] pointer-events-none">
        <div className="p-4">
          <div className="pointer-events-auto bg-card/92 backdrop-blur-xl rounded-2xl border border-border shadow-2xl p-3 max-w-xl mx-auto">
            <div
              className="flex gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch" }}
            >
              <button
                onClick={() => setActiveDayIndex(-1)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0",
                  activeDayIndex === -1 ? "bg-primary text-primary-foreground shadow-md" : "bg-muted/80 text-muted-foreground hover:bg-accent"
                )}
              >
                All days
              </button>
              {allDays.map((day, i) => {
                let label = `Day ${day.day_number}`;
                try {
                  label += ` · ${format(parseISO(day.date), "MMM d")}`;
                } catch {}
                return (
                  <button
                    key={day.date}
                    onClick={() => setActiveDayIndex(i)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0",
                      activeDayIndex === i ? "bg-primary text-primary-foreground shadow-md" : "bg-muted/80 text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {activeDayIndex >= 0 && allDays[activeDayIndex] && (
              <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-foreground">
                  {allDays[activeDayIndex].activities.length} activities
                </span>
                <span className="text-[10px] text-muted-foreground">{allDays[activeDayIndex].theme || ""}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

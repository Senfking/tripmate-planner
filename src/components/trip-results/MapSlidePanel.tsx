import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon, X, Maximize2, CalendarDays, MapPin, Sparkles } from "lucide-react";
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
  const [activeDayIndex, setActiveDayIndex] = useState(-1); // -1 = all days

  // Escape key closes
  useEffect(() => {
    if (state === "closed") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onStateChange(state === "full" ? "partial" : "closed");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, onStateChange]);

  // Reset day filter when closing
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

  // PARTIAL: side panel
  if (state === "partial") {
    return (
      <div className="w-[420px] max-w-[45vw] shrink-0 flex flex-col border-l border-border bg-background">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/50 shrink-0">
          <MapIcon className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-foreground">Trip Map</span>
            <span className="text-[10px] text-muted-foreground ml-2 font-mono">
              {dayCount} days · {totalActivities} spots
            </span>
          </div>
          <button
            onClick={() => onStateChange("full")}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            title="Full screen"
          >
            <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => onStateChange("closed")}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            title="Close map"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Day filter pills */}
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto border-b border-border bg-card/30 shrink-0 scrollbar-none">
          <button
            onClick={() => setActiveDayIndex(-1)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors shrink-0",
              activeDayIndex === -1
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
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
                activeDayIndex === i
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              Day {day.day_number}
            </button>
          ))}
        </div>

        {/* Map */}
        <div className="flex-1 min-h-0">
          <ResultsMap
            result={result}
            activeDayIndex={activeDayIndex}
            allDays={allDays}
            mode={activeDayIndex >= 0 ? "day" : "overview"}
            refinedCoords={refinedCoords}
          />
        </div>
      </div>
    );
  }

  // FULL: fullscreen map with overlay controls
  return (
    <div className="fixed inset-0 z-[10000] bg-background flex flex-col">
      {/* Map fills everything */}
      <div className="absolute inset-0">
        <ResultsMap
          result={result}
          activeDayIndex={activeDayIndex}
          allDays={allDays}
          mode={activeDayIndex >= 0 ? "day" : "overview"}
          refinedCoords={refinedCoords}
        />
      </div>

      {/* Top overlay: summary + close */}
      <div className="relative z-10 pointer-events-none">
        <div className="flex items-start gap-3 p-4">
          {/* Summary card */}
          <div className="pointer-events-auto bg-card/90 backdrop-blur-xl rounded-2xl border border-border shadow-2xl px-5 py-4 max-w-sm">
            <h2 className="text-base font-bold text-foreground truncate">{result.trip_title}</h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{dateRange}</p>
            <div className="flex items-center gap-3 mt-2.5">
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

          <div className="flex-1" />

          {/* Close button */}
          <button
            onClick={() => onStateChange("partial")}
            className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/90 backdrop-blur-xl text-foreground shadow-2xl border border-border hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
            <span className="text-xs font-semibold">Close</span>
          </button>
        </div>
      </div>

      {/* Bottom overlay: day filter */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="p-4">
          <div className="pointer-events-auto bg-card/90 backdrop-blur-xl rounded-2xl border border-border shadow-2xl p-3 max-w-xl mx-auto">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setActiveDayIndex(-1)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0",
                  activeDayIndex === -1
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted/80 text-muted-foreground hover:bg-accent"
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
                      activeDayIndex === i
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted/80 text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {/* Active day info */}
            {activeDayIndex >= 0 && allDays[activeDayIndex] && (
              <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-foreground">
                  {allDays[activeDayIndex].activities.length} activities
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {allDays[activeDayIndex].theme || ""}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

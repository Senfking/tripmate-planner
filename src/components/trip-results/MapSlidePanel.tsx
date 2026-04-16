import { useCallback, useEffect, useState } from "react";
import { Map as MapIcon, X, Maximize2, Minimize2, ChevronLeft } from "lucide-react";
import { ResultsMap } from "./ResultsMap";
import { cn } from "@/lib/utils";
import type { AITripResult, AIDay } from "./useResultsState";

type MapState = "closed" | "partial" | "full";

interface Props {
  result: AITripResult;
  allDays: AIDay[];
  refinedCoords: Map<string, { lat: number; lng: number }>;
  totalActivities: number;
}

export function MapSlidePanel({ result, allDays, refinedCoords, totalActivities }: Props) {
  const [state, setState] = useState<MapState>("closed");

  const cycle = useCallback(() => {
    setState((s) => {
      if (s === "closed") return "partial";
      if (s === "partial") return "full";
      return "closed";
    });
  }, []);

  // Escape key closes
  useEffect(() => {
    if (state === "closed") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setState("closed");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state]);

  const dayCount = allDays.length;

  return (
    <>
      {/* Backdrop for full mode */}
      {state === "full" && (
        <div
          className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setState("partial")}
        />
      )}

      {/* Floating open button — only when closed */}
      {state === "closed" && (
        <button
          onClick={() => setState("partial")}
          className="fixed top-[calc(env(safe-area-inset-top,0px)+72px)] right-4 z-[10000] flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-card/95 backdrop-blur-xl text-foreground shadow-xl border border-border hover:bg-accent hover:border-primary/30 transition-all duration-200 group"
        >
          <MapIcon className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">Map</span>
          <span className="text-[10px] text-muted-foreground font-mono">{totalActivities}</span>
        </button>
      )}

      {/* Sliding panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full z-[9999] flex flex-col bg-background border-l border-border shadow-2xl transition-all duration-300 ease-out",
          state === "closed" && "translate-x-full w-0",
          state === "partial" && "translate-x-0 w-[420px] max-w-[90vw]",
          state === "full" && "translate-x-0 w-full"
        )}
      >
        {/* Panel header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/50 backdrop-blur-xl shrink-0">
          <MapIcon className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-foreground">Trip Map</span>
            <span className="text-[10px] text-muted-foreground ml-2 font-mono">
              {dayCount} days · {totalActivities} spots
            </span>
          </div>

          {/* Expand / Shrink */}
          <button
            onClick={() => setState(state === "full" ? "partial" : "full")}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            title={state === "full" ? "Shrink" : "Expand"}
          >
            {state === "full" ? (
              <Minimize2 className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>

          {/* Close */}
          <button
            onClick={() => setState("closed")}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            title="Close map"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Map body */}
        <div className="flex-1 relative">
          {state !== "closed" && (
            <ResultsMap
              result={result}
              activeDayIndex={-1}
              allDays={allDays}
              mode="overview"
              refinedCoords={refinedCoords}
            />
          )}

          {/* Drag handle on left edge (partial mode) */}
          {state === "partial" && (
            <button
              onClick={() => setState("full")}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-14 rounded-full bg-card border border-border shadow-lg flex items-center justify-center hover:bg-accent transition-colors"
              title="Expand map"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

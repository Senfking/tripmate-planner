import { useEffect } from "react";
import { Map as MapIcon, X, Maximize2, Minimize2 } from "lucide-react";
import { ResultsMap } from "./ResultsMap";
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
  // Escape key closes
  useEffect(() => {
    if (state === "closed") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onStateChange("closed");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, onStateChange]);

  const dayCount = allDays.length;

  if (state === "closed") return null;

  return (
    <div
      className={cn(
        "flex flex-col border-l border-border bg-background transition-all duration-300 ease-out shrink-0 relative",
        state === "partial" && "w-[420px]",
        state === "full" && "w-[65%]"
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
          onClick={() => onStateChange(state === "full" ? "partial" : "full")}
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
          onClick={() => onStateChange("closed")}
          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          title="Close map"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Map body */}
      <div className="flex-1 relative min-h-0">
        <ResultsMap
          result={result}
          activeDayIndex={-1}
          allDays={allDays}
          mode="overview"
          refinedCoords={refinedCoords}
        />
      </div>
    </div>
  );
}

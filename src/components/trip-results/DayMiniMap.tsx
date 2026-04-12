import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { ResultsMap } from "./ResultsMap";
import type { AITripResult, AIDay } from "./useResultsState";

interface Props {
  result: AITripResult;
  allDays: AIDay[];
  dayIndex: number;
  refinedCoords?: Map<string, { lat: number; lng: number }>;
}

export function DayMiniMap({ result, allDays, dayIndex, refinedCoords }: Props) {
  const day = allDays[dayIndex];
  if (!day) return null;

  const hasCoords = day.activities.some((a) => a.latitude != null && a.longitude != null);
  if (!hasCoords) return null;

  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl overflow-hidden border border-border relative ${expanded ? "h-[400px]" : "h-[200px]"} transition-all`}>
      <ResultsMap
        result={result}
        activeDayIndex={dayIndex}
        allDays={allDays}
        mode="day"
        refinedCoords={refinedCoords}
      />
      {/* Controls overlay above Leaflet z-index */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="pointer-events-auto absolute top-2 right-2 p-1.5 rounded-lg bg-white dark:bg-gray-800 shadow-md border border-border hover:bg-accent transition-colors"
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5 text-foreground" /> : <Maximize2 className="h-3.5 w-3.5 text-foreground" />}
        </button>
      </div>
    </div>
  );
}

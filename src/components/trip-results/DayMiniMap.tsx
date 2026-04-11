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

  return (
    <div className="h-[200px] rounded-xl overflow-hidden border border-border">
      <ResultsMap
        result={result}
        activeDayIndex={dayIndex}
        allDays={allDays}
        mode="day"
        refinedCoords={refinedCoords}
      />
    </div>
  );
}

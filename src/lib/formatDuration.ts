// Activity duration formatter shared between ActivityCard and ResultsMap.
//
// Background: ActivityCard rendered durations as "120min" while ResultsMap
// rendered "2h" / "5h 30m". The "120min" form scales poorly for anchor
// venues (a 6-hour Dubai nightclub night reads as "360min" — technically
// correct, structurally noisy). Normalize to the same `${h}h [${m}m]` form
// across all activity surfaces.

export function formatActivityDuration(minutes: number | null | undefined): string | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

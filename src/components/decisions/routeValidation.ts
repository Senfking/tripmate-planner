import { differenceInDays, parseISO } from "date-fns";
import type { RouteStop } from "@/hooks/useRouteStops";

export type ValidationResult = {
  hardError: string | null;
  softWarning: string | null;
  info: string | null;
};

export function validateRouteDate(
  startDate: string,
  endDate: string,
  existingStops: RouteStop[],
  excludeStopId?: string
): ValidationResult {
  const result: ValidationResult = { hardError: null, softWarning: null, info: null };

  if (!startDate || !endDate) return result;

  // End strictly before start is a hard error
  if (endDate < startDate) {
    result.hardError = "End date must be after start date";
    return result;
  }

  // Same day = single-day stop, show info
  if (endDate === startDate) {
    result.info = "This is a single-day stop - no overnight stay";
  }

  // Filter out self when editing
  const stops = excludeStopId
    ? existingStops.filter((s) => s.id !== excludeStopId)
    : existingStops;

  // Overlap check
  const overlap = stops.find(
    (s) => startDate < s.end_date && endDate > s.start_date
  );
  if (overlap) {
    result.hardError = `⚠️ These dates overlap with ${overlap.destination}. Please select different dates.`;
    return result;
  }

  // Gap check - find adjacent stops
  if (stops.length > 0) {
    const sorted = [...stops].sort((a, b) =>
      a.end_date.localeCompare(b.end_date)
    );

    // Check gap before this stop (last stop ending before our start)
    const prevStop = sorted
      .filter((s) => s.end_date <= startDate)
      .pop();
    if (prevStop) {
      const gapDays = differenceInDays(parseISO(startDate), parseISO(prevStop.end_date));
      if (gapDays > 0) {
        result.softWarning = `💬 ${gapDays}-day gap after ${prevStop.destination}. Intentional? (e.g. a travel or rest day)`;
      }
    }

    // Check gap after this stop
    const nextStop = sorted.find((s) => s.start_date >= endDate);
    if (nextStop) {
      const gapDays = differenceInDays(parseISO(nextStop.start_date), parseISO(endDate));
      if (gapDays > 0 && !result.softWarning) {
        result.softWarning = `💬 ${gapDays}-day gap before ${nextStop.destination}. Intentional? (e.g. a travel or rest day)`;
      }
    }
  }

  return result;
}

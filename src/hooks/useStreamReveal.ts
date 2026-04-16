import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { AITripResult } from "@/components/trip-results/useResultsState";

/**
 * Each item in the reveal timeline has a key (used to look up its delay)
 * and a contextual message shown in the composing indicator while it reveals.
 */
interface TimelineEntry {
  key: string;
  delay: number;
  message: string;
}

/**
 * Builds a flat reveal timeline from the itinerary structure.
 *
 * Timing is adaptive: the total reveal duration scales with the number of days
 * so a 3-day trip feels brisk (~8s) while a 10-day trip doesn't drag (~14s).
 */
function buildTimeline(result: AITripResult): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  // Collect all days across destinations (flat)
  const allDays: { destName: string; dayNumber: number; theme: string; activityCount: number; destIdx: number }[] = [];
  let dayNum = 1;
  for (let di = 0; di < result.destinations.length; di++) {
    const dest = result.destinations[di];
    for (const day of dest.days) {
      allDays.push({
        destName: dest.name,
        dayNumber: dayNum++,
        theme: day.theme,
        activityCount: day.activities.length,
        destIdx: di,
      });
    }
  }

  const totalDays = allDays.length;

  // Adaptive timing: target total reveal duration
  // 3 days → ~8s, 5 days → ~10s, 7 days → ~12s, 10+ days → ~14s
  const targetDuration = Math.min(14000, Math.max(8000, 6000 + totalDays * 800));

  // Fixed overhead for header elements
  const headerOverhead = 2000; // title + stats + summary
  const overviewOverhead = 1500; // map + overview sections
  const remainingTime = targetDuration - headerOverhead - overviewOverhead;

  // Per-day timing
  const dayGap = Math.max(150, Math.min(400, remainingTime / (totalDays + 1)));
  // Destination header gets extra pause
  const destHeaderGap = dayGap * 1.5;

  let cursor = 0;

  // 1. Title (immediate)
  entries.push({ key: "title", delay: cursor, message: "Setting up your trip..." });

  // 2. Stat pills
  cursor += 200;
  entries.push({ key: "stats", delay: cursor, message: "Setting up your trip..." });

  // 3. Summary
  cursor += 400;
  entries.push({ key: "summary", delay: cursor, message: "Writing your trip summary..." });

  // 4. Map
  cursor += 700;
  entries.push({ key: "map", delay: cursor, message: "Mapping your route..." });

  // 5. Overview sections (flights, stays, budget) — appear together quickly
  cursor += 400;
  entries.push({ key: "overview-flights", delay: cursor, message: "Checking flight options..." });
  cursor += 200;
  entries.push({ key: "overview-stays", delay: cursor, message: "Finding your accommodations..." });
  cursor += 200;
  entries.push({ key: "overview-budget", delay: cursor, message: "Calculating your budget..." });

  // 6. Destinations and days
  let prevDestIdx = -1;
  for (const day of allDays) {
    // Destination header (only on first day of new destination)
    if (day.destIdx !== prevDestIdx) {
      cursor += destHeaderGap;
      const destName = day.destName;
      entries.push({
        key: `dest-${day.destIdx}`,
        delay: cursor,
        message: `Planning ${destName}...`,
      });
      prevDestIdx = day.destIdx;
    }

    // Day card
    cursor += dayGap;
    const dayMessage = getDayMessage(day.dayNumber, day.theme, day.destName, day.activityCount);
    entries.push({
      key: `day-${day.dayNumber}`,
      delay: cursor,
      message: dayMessage,
    });
  }

  // 7. Packing suggestions (if any)
  if (result.packing_suggestions?.length > 0) {
    cursor += 300;
    entries.push({ key: "packing", delay: cursor, message: "Packing your bags..." });
  }

  // 8. Bottom bar / completion
  cursor += 500;
  entries.push({ key: "complete", delay: cursor, message: "Your trip is ready!" });

  return entries;
}

/**
 * Generate a contextual message for a day being revealed.
 * Varies the phrasing so messages don't feel repetitive.
 */
function getDayMessage(dayNum: number, theme: string, destName: string, activityCount: number): string {
  const templates = [
    `Adding day ${dayNum} activities...`,
    `Building your day ${dayNum} itinerary...`,
    `Planning day ${dayNum} in ${destName}...`,
    `Curating ${activityCount} experiences for day ${dayNum}...`,
  ];

  // Add theme-specific messages when available
  if (theme) {
    const lowerTheme = theme.toLowerCase();
    if (lowerTheme.includes("food") || lowerTheme.includes("dining") || lowerTheme.includes("culinary")) {
      templates.push(`Finding your dinner spot for day ${dayNum}...`);
    }
    if (lowerTheme.includes("morning") || lowerTheme.includes("sunrise")) {
      templates.push(`Routing your morning in ${destName}...`);
    }
    if (lowerTheme.includes("culture") || lowerTheme.includes("museum") || lowerTheme.includes("history")) {
      templates.push(`Discovering cultural gems for day ${dayNum}...`);
    }
    if (lowerTheme.includes("nature") || lowerTheme.includes("outdoor") || lowerTheme.includes("hike")) {
      templates.push(`Mapping outdoor adventures for day ${dayNum}...`);
    }
    if (lowerTheme.includes("market") || lowerTheme.includes("shop")) {
      templates.push(`Scouting the best markets for day ${dayNum}...`);
    }
    if (lowerTheme.includes("beach") || lowerTheme.includes("coast")) {
      templates.push(`Finding the perfect beach spots for day ${dayNum}...`);
    }
    if (lowerTheme.includes("night") || lowerTheme.includes("evening")) {
      templates.push(`Planning your evening in ${destName}...`);
    }
  }

  // Pick based on day number for deterministic variety
  return templates[dayNum % templates.length];
}

export interface RevealState {
  /** Whether the reveal animation is still running */
  isRevealing: boolean;
  /** CSS animation delay in ms for a given key, or null if the key isn't in the timeline */
  getDelay: (key: string) => number | undefined;
  /** Current contextual message for the composing indicator */
  currentMessage: string;
  /** Progress fraction 0–1 */
  progress: number;
  /** Total duration of the reveal in ms */
  totalDuration: number;
}

export function useStreamReveal(result: AITripResult | null, enabled: boolean): RevealState {
  const timeline = useMemo(() => (result && enabled ? buildTimeline(result) : []), [result, enabled]);

  // Build a delay lookup map
  const delayMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of timeline) {
      map.set(entry.key, entry.delay);
    }
    return map;
  }, [timeline]);

  const totalDuration = useMemo(() => {
    if (timeline.length === 0) return 0;
    // Add 300ms for the last animation to finish playing
    return timeline[timeline.length - 1].delay + 300;
  }, [timeline]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealing, setIsRevealing] = useState(enabled);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Set up timers for tracking current message
  useEffect(() => {
    if (!enabled || timeline.length === 0) {
      setIsRevealing(false);
      return;
    }

    setIsRevealing(true);
    setCurrentIndex(0);

    // Schedule message updates at each entry's delay
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < timeline.length; i++) {
      const t = setTimeout(() => {
        setCurrentIndex(i);
      }, timeline[i].delay);
      timers.push(t);
    }

    // Schedule completion
    const completeTimer = setTimeout(() => {
      setIsRevealing(false);
    }, totalDuration);
    timers.push(completeTimer);

    timersRef.current = timers;
    return () => timers.forEach(clearTimeout);
  }, [enabled, timeline, totalDuration]);

  const getDelay = useCallback(
    (key: string): number | undefined => delayMap.get(key),
    [delayMap]
  );

  const currentMessage = timeline.length > 0 && currentIndex < timeline.length
    ? timeline[currentIndex].message
    : "";

  const progress = timeline.length > 0
    ? Math.min(1, (currentIndex + 1) / timeline.length)
    : 1;

  return {
    isRevealing: enabled && isRevealing,
    getDelay,
    currentMessage,
    progress,
    totalDuration,
  };
}

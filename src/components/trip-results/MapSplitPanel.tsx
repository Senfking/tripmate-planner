import { useState } from "react";
import { X, Map as MapIcon, CalendarDays, MapPin } from "lucide-react";
import { ResultsMap } from "./ResultsMap";
import type { AITripResult, AIDay } from "./useResultsState";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";

/** Day-color palette for pins — visually distinct, accessible */
export const DAY_COLORS = [
  "#3B82F6", // blue
  "#0D9488", // teal
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#84CC16", // lime
  "#F97316", // orange
  "#6366F1", // indigo
  "#14B8A6", // emerald-ish
  "#E11D48", // rose
];

export function getDayColor(dayNumber: number): string {
  return DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];
}

interface Props {
  result: AITripResult;
  allDays: AIDay[];
  totalActivities: number;
  refinedCoords?: Map<string, { lat: number; lng: number }>;
  highlightedPin?: string | null;
  onPinClick?: (dayDate: string, activityIndex: number) => void;
  onClose: () => void;
  /** For tablet/mobile: controls whether map is visible */
  visible: boolean;
}

export function MapSplitPanel({
  result,
  allDays,
  totalActivities,
  refinedCoords,
  highlightedPin,
  onPinClick,
  onClose,
  visible,
}: Props) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Mobile: bottom sheet drawer
  if (isMobile) {
    return (
      <Drawer open={visible} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DrawerContent className="max-h-[70vh]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <MapIcon className="h-4 w-4 text-[#0D9488]" />
              <span className="text-sm font-semibold text-foreground">
                {allDays.length} days · {totalActivities} spots
              </span>
            </div>
          </div>
          <div className="h-[60vh]">
            <ResultsMap
              result={result}
              activeDayIndex={-1}
              allDays={allDays}
              mode="overview"
              refinedCoords={refinedCoords}
              highlightedPin={highlightedPin}
              onPinClick={onPinClick}
              useDayColors
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Tablet: inline map taking full width
  if (isTablet) {
    if (!visible) return null;
    return (
      <div className="h-[calc(100vh-140px)] w-full relative animate-fade-in">
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/90 backdrop-blur border border-border shadow-sm">
          <MapIcon className="h-3.5 w-3.5 text-[#0D9488]" />
          <span className="text-xs font-semibold text-foreground">
            {allDays.length} days · {totalActivities} spots
          </span>
        </div>
        <ResultsMap
          result={result}
          activeDayIndex={-1}
          allDays={allDays}
          mode="overview"
          refinedCoords={refinedCoords}
          highlightedPin={highlightedPin}
          onPinClick={onPinClick}
          useDayColors
        />
      </div>
    );
  }

  // Desktop: sticky side panel
  if (!visible) return null;
  return (
    <div
      className="sticky top-0 h-screen border-l border-border flex flex-col bg-background animate-fade-in"
      style={{ transition: "width 300ms cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-[#0D9488]" />
          <span className="text-xs font-semibold text-foreground">
            {allDays.length} days · {totalActivities} spots
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          title="Close map"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Day color legend */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border overflow-x-auto scrollbar-none shrink-0">
        {allDays.map((day) => (
          <span
            key={day.day_number}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white whitespace-nowrap shrink-0"
            style={{ background: getDayColor(day.day_number) }}
          >
            D{day.day_number}
          </span>
        ))}
      </div>

      {/* Map */}
      <div className="flex-1 min-h-0">
        <ResultsMap
          result={result}
          activeDayIndex={-1}
          allDays={allDays}
          mode="overview"
          refinedCoords={refinedCoords}
          highlightedPin={highlightedPin}
          onPinClick={onPinClick}
          useDayColors
        />
      </div>
    </div>
  );
}

/** Collapsed map button for desktop when map is hidden */
export function CollapsedMapButton({ onClick, totalActivities }: { onClick: () => void; totalActivities: number }) {
  return (
    <button
      onClick={onClick}
      className="fixed top-20 right-4 z-40 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card text-foreground shadow-lg border border-border hover:bg-accent hover:shadow-xl transition-all duration-200"
    >
      <MapIcon className="h-4 w-4 text-[#0D9488]" />
      <span className="text-xs font-semibold">Show map</span>
      <span className="text-[10px] text-muted-foreground">{totalActivities} pins</span>
    </button>
  );
}

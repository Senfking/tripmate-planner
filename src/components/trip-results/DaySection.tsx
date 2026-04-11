import { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ActivityCard } from "./ActivityCard";
import { TravelTimeConnector } from "./TravelTimeConnector";
import { DayMiniMap } from "./DayMiniMap";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";
import type { AIDay, AIActivity, AITripResult } from "./useResultsState";

interface Props {
  day: AIDay;
  destinationName: string;
  result: AITripResult;
  allDays: AIDay[];
  refinedCoords?: Map<string, { lat: number; lng: number }>;
  isAdded: (dayDate: string, title: string) => boolean;
  onToggleAdd: (day: AIDay, activity: AIActivity) => void;
  onRequestChange: (dayDate: string, index: number, activity: AIActivity) => void;
  onRemoveActivity: (dayDate: string, index: number) => void;
  onCoordsRefined?: (dayDate: string, activityIndex: number, lat: number, lng: number) => void;
}

function DayThumbnail({ activity, location }: { activity: AIActivity; location: string }) {
  const { photos, isLoading } = useGooglePlaceDetails(activity.title || "", location);
  const [imgError, setImgError] = useState(false);
  const heroSrc = !imgError && photos.length > 0 ? photos[0] : null;

  if (isLoading) return <Skeleton className="w-full h-full rounded-none" />;
  if (heroSrc) {
    return (
      <img
        src={heroSrc}
        alt={activity.title}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className="w-full h-full bg-accent flex items-center justify-center">
      <span className="text-lg">📍</span>
    </div>
  );
}

export function DaySection({
  day,
  destinationName,
  result,
  allDays,
  refinedCoords,
  isAdded,
  onToggleAdd,
  onRequestChange,
  onRemoveActivity,
  onCoordsRefined,
}: Props) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const dateStr = (() => {
    try {
      return format(parseISO(day.date), "MMM d");
    } catch {
      return day.date;
    }
  })();

  // Scroll into view on expand
  useEffect(() => {
    if (open && cardRef.current) {
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [open]);

  const firstActivity = day.activities[0];
  const dayIndex = allDays.findIndex((d) => d.date === day.date);

  return (
    <div ref={cardRef} className="rounded-xl border border-border bg-card overflow-hidden transition-all">
      {/* Collapsed card */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
      >
        {/* Thumbnail */}
        <div className="w-[72px] h-[56px] rounded-lg overflow-hidden flex-shrink-0 bg-muted">
          {firstActivity && (
            <DayThumbnail activity={firstActivity} location={destinationName} />
          )}
        </div>

        {/* Day info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-wide">
              Day {day.day_number}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {dateStr} · {day.activities.length} {day.activities.length === 1 ? "Experience" : "Experiences"}
            </span>
          </div>
          {day.theme && (
            <p className="text-[13px] font-medium text-foreground mt-1 truncate">
              {day.theme}
            </p>
          )}
        </div>

        {/* Chevron */}
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border animate-fade-in">
          {/* Activities */}
          <div className="py-2">
            {day.activities.map((activity, i) => (
              <div key={`${day.date}-${i}`}>
                {i > 0 && (
                  <TravelTimeConnector
                    travelTime={activity.travel_time_from_previous || null}
                    travelMode={activity.travel_mode_from_previous || null}
                  />
                )}
                <ActivityCard
                  activity={activity}
                  day={day}
                  index={i}
                  isAdded={isAdded(day.date, activity.title)}
                  onToggleAdd={() => onToggleAdd(day, activity)}
                  onRequestChange={() => onRequestChange(day.date, i, activity)}
                  onRemove={() => onRemoveActivity(day.date, i)}
                  onCoordsRefined={(lat, lng) => onCoordsRefined?.(day.date, i, lat, lng)}
                  animDelay={i * 50}
                />
              </div>
            ))}
          </div>

          {/* Embedded mini-map for this day */}
          <div className="mx-4 mb-4">
            <DayMiniMap
              result={result}
              allDays={allDays}
              dayIndex={dayIndex}
              refinedCoords={refinedCoords}
            />
          </div>
        </div>
      )}
    </div>
  );
}

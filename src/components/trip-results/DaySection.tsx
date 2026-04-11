import { useState, forwardRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ActivityCard } from "./ActivityCard";
import { TravelTimeConnector } from "./TravelTimeConnector";
import type { AIDay, AIActivity } from "./useResultsState";

interface Props {
  day: AIDay;
  defaultExpanded?: boolean;
  isAdded: (dayDate: string, title: string) => boolean;
  onToggleAdd: (day: AIDay, activity: AIActivity) => void;
  onRequestChange: (dayDate: string, index: number, activity: AIActivity) => void;
  onRemoveActivity: (dayDate: string, index: number) => void;
  onActivityClick?: (activity: AIActivity) => void;
  onCoordsRefined?: (dayDate: string, activityIndex: number, lat: number, lng: number) => void;
}

export const DaySection = forwardRef<HTMLDivElement, Props>(
  ({ day, defaultExpanded = false, isAdded, onToggleAdd, onRequestChange, onRemoveActivity, onActivityClick, onCoordsRefined }, ref) => {
    const [open, setOpen] = useState(defaultExpanded);
    const dateStr = (() => {
      try {
        return format(parseISO(day.date), "MMM d");
      } catch {
        return day.date;
      }
    })();

    return (
      <div ref={ref} data-day-date={day.date}>
        {/* Day Header */}
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                Day {day.day_number}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                · {day.activities.length} Experiences · {dateStr}
              </span>
            </div>
            {day.theme && (
              <p className="text-xs text-muted-foreground/70 mt-0.5 italic">
                {day.theme}
              </p>
            )}
          </div>
        </button>

        {/* Activities */}
        {open && (
          <div className="pb-2">
            {day.activities.map((activity, i) => (
              <div key={`${day.date}-${i}`}>
                {i > 0 && (
                  <TravelTimeConnector
                    travelTime={activity.travel_time_from_previous || null}
                    travelMode={activity.travel_mode_from_previous || null}
                  />
                )}
                <div onClick={() => onActivityClick?.(activity)}>
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
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

DaySection.displayName = "DaySection";

import { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, PenLine, Plus, Map as MapIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ActivityCard } from "./ActivityCard";
import { TravelTimeConnector } from "./TravelTimeConnector";
import { DayReactionSummary } from "./DayReactionSummary";
import { TripDiscussion } from "./TripDiscussion";
import { EditDaySheet } from "./EditDaySheet";
import { AddActivityForm } from "./AddActivityForm";
import { useGooglePlaceDetails } from "@/hooks/useGooglePlaceDetails";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { AIDay, AIActivity, AITripResult } from "./useResultsState";

interface Props {
  day: AIDay;
  planId?: string | null;
  isDraft?: boolean;
  destinationName: string;
  result: AITripResult;
  allDays: AIDay[];
  refinedCoords?: Map<string, { lat: number; lng: number }>;
  onRequestChange: (dayDate: string, index: number, activity: AIActivity) => void;
  onRequestDescribedChange: (dayDate: string, index: number, activity: AIActivity, description: string) => void;
  onCustomPlaceSwap: (dayDate: string, index: number, placeName: string) => Promise<any>;
  onRemoveActivity: (dayDate: string, index: number, activity: AIActivity) => void;
  isActivityRemoved: (dayDate: string, index: number, title: string) => boolean;
  onAddLocalActivity: (dayDate: string, activity: AIActivity) => void;
  getLocalAdditions: (dayDate: string) => AIActivity[];
  getReplacedActivity: (dayDate: string, activityIndex: number) => AIActivity | null;
  onCoordsRefined?: (dayDate: string, activityIndex: number, lat: number, lng: number) => void;
  onOpenDayMap?: (dayIndex: number) => void;
  /** When true, render a skeleton placeholder card instead of the populated
   *  one. Used while streaming — the day's number/date/theme are known from
   *  the meta-event skeleton, but its activities haven't arrived yet. The
   *  skeleton matches the populated card's outer shape (border, radius,
   *  height) so the swap to populated is layout-stable. */
  skeleton?: boolean;
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
  planId,
  isDraft = false,
  destinationName,
  result,
  allDays,
  refinedCoords,
  onRequestChange,
  onRequestDescribedChange,
  onCustomPlaceSwap,
  onRemoveActivity,
  isActivityRemoved,
  onAddLocalActivity,
  getLocalAdditions,
  getReplacedActivity,
  onCoordsRefined,
  onOpenDayMap,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editDayOpen, setEditDayOpen] = useState(false);
  const [addingActivity, setAddingActivity] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const dateStr = (() => {
    try {
      return format(parseISO(day.date), "MMM d");
    } catch {
      return day.date;
    }
  })();

  useEffect(() => {
    if (open && cardRef.current) {
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [open]);

  const firstActivity = day.activities[0];
  const dayIndex = allDays.findIndex((d) => d.date === day.date);
  const localAdditions = getLocalAdditions(day.date);
  const baseActivities = day.activities.map((act, i) => getReplacedActivity(day.date, i) || act);
  const allActivities = [...baseActivities, ...localAdditions];

  // Filter out removed activities
  const visibleActivities = allActivities.filter(
    (act, i) => !isActivityRemoved(day.date, i, act.title)
  );

  return (
    <>
      <div ref={cardRef} id={`section-day-${day.day_number}`} className="rounded-xl border border-border bg-card overflow-hidden transition-all">
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
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#0D9488]/15 text-[#0D9488] border border-[#0D9488]/25 text-[10px] font-bold uppercase tracking-wide">
                Day {day.day_number}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {dateStr} · {visibleActivities.length === 0
                  ? "No activities scheduled"
                  : `${visibleActivities.length} ${visibleActivities.length === 1 ? "Experience" : "Experiences"}`}
              </span>
              {planId && !isDraft && (
                <DayReactionSummary planId={planId} dayIndex={dayIndex} activityCount={day.activities.length} />
              )}
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
            {/* Day toolbar */}
            <div className="flex items-center justify-end gap-3 px-3 py-2">
              {onOpenDayMap && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenDayMap(dayIndex); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <MapIcon className="h-3 w-3" /> View day on map
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setEditDayOpen(true); }}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <PenLine className="h-3 w-3" /> Edit day
              </button>
            </div>

            {/* Day-level comments */}
            {planId && (
              <div className="px-4 py-3 border-b border-border bg-accent/20">
                <TripDiscussion
                  planId={planId}
                  activityKey={`day-${dayIndex}`}
                  placeholder="Comment on this day..."
                  compact
                  isDraft={isDraft}
                />
              </div>
            )}

            {/* Activities */}
            <div className="py-2">
              {visibleActivities.length === 0 ? (
                // Theme-only empty state. Dedup at receipt time can occasionally
                // strip a day to zero activities (the model picked place_ids
                // already claimed by earlier days). Rather than emit a barren
                // "0 Experiences" card, show a styled empty-state with theme +
                // explicit CTA so the user knows the day is intentional, not
                // broken. The Add activity button below remains the primary
                // action.
                <div className="mx-4 mb-2 px-4 py-6 rounded-xl border border-dashed border-muted-foreground/25 bg-muted/30 text-center">
                  <p className="text-sm font-medium text-foreground mb-1">
                    No activities scheduled
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {day.theme
                      ? `${day.theme} — add your own to fill in this day.`
                      : "Add your own to fill in this day."}
                  </p>
                </div>
              ) : (
                visibleActivities.map((activity, i) => (
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
                      planId={planId || null}
                      isDraft={isDraft}
                      dayIndex={dayIndex}
                      activityIndex={i}
                      onRequestChange={() => onRequestChange(day.date, i, activity)}
                      onRequestDescribedChange={(desc) => onRequestDescribedChange(day.date, i, activity, desc)}
                      onCustomPlaceSwap={(name) => onCustomPlaceSwap(day.date, i, name)}
                      onRemove={() => onRemoveActivity(day.date, i, activity)}
                      onCoordsRefined={(lat, lng) => onCoordsRefined?.(day.date, i, lat, lng)}
                      animDelay={i * 50}
                    />
                  </div>
                ))
              )}
            </div>

            {/* Add activity */}
            {addingActivity ? (
              <AddActivityForm
                dayDate={day.date}
                onAdd={(act) => {
                  onAddLocalActivity(day.date, act);
                  setAddingActivity(false);
                }}
                onClose={() => setAddingActivity(false)}
              />
            ) : (
              <button
                onClick={() => setAddingActivity(true)}
                className="mx-4 mb-3 w-[calc(100%-2rem)] flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-[#0D9488]/30 text-[#0D9488] text-xs font-medium hover:bg-[#0D9488]/5 transition-colors"
              >
                <Plus className="h-3 w-3" /> Add activity
              </button>
            )}

          </div>
        )}
      </div>

      {/* Edit Day Sheet */}
      {editDayOpen && (
        <EditDaySheet
          day={day}
          onApply={(instruction) => {
            setEditDayOpen(false);
            toast.info(`Updating Day ${day.day_number}...`);
          }}
          onClose={() => setEditDayOpen(false)}
        />
      )}
    </>
  );
}

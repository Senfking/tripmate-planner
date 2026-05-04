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
import type { ActivityCostFormatter } from "./formatActivityCost";

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
  /** Per-person cost formatter — when present, ActivityCard renders prices
   *  in user's profile currency primary with destination currency subtitle. */
  costFormatter?: ActivityCostFormatter;
  /** "calendar" (default) shows a real "MMM d" date; "generic" hides it
   *  so date-agnostic templates don't render sentinel dates. */
  dateMode?: "calendar" | "generic";
  /** When true, hide editing affordances: edit-day, add-activity,
   *  request-change, remove, and the comments panel. */
  readOnly?: boolean;
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
  skeleton = false,
  costFormatter,
  dateMode = "calendar",
  readOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editDayOpen, setEditDayOpen] = useState(false);
  const [addingActivity, setAddingActivity] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const dateStr = (() => {
    if (dateMode === "generic") return "";
    try {
      return format(parseISO(day.date), "MMM d");
    } catch {
      return day.date;
    }
  })();

  useEffect(() => {
    if (open && cardRef.current) {
      // Bring the day card near the top of the viewport so it becomes the
      // user's center of attention. The hero is not sticky, so we use a
      // small constant gap rather than measuring the (huge) hero height.
      setTimeout(() => {
        const el = cardRef.current;
        if (!el) return;
        const SCROLL_TOP_GAP = 24;
        const marked = document.querySelector<HTMLElement>("[data-results-scroll-root='true']");
        const useInner = !!(marked && marked.scrollHeight > marked.clientHeight + 1);
        const elementRect = el.getBoundingClientRect();
        if (useInner && marked) {
          const rootRect = marked.getBoundingClientRect();
          const targetTop = Math.max(0, marked.scrollTop + (elementRect.top - rootRect.top) - SCROLL_TOP_GAP);
          marked.scrollTo({ top: targetTop, behavior: "smooth" });
        } else {
          const targetTop = Math.max(0, window.scrollY + elementRect.top - SCROLL_TOP_GAP);
          window.scrollTo({ top: targetTop, behavior: "smooth" });
        }
      }, 80);
    }
  }, [open]);

  // Listen for timeline-rail clicks. When the rail says "expand section-day-N"
  // and that's us, open ourselves so the user lands on populated content.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id === `section-day-${day.day_number}`) {
        setOpen(true);
      }
    };
    window.addEventListener("results:expand", handler as EventListener);
    return () => window.removeEventListener("results:expand", handler as EventListener);
  }, [day.day_number]);

  // Skeleton placeholder while the day's activities are still streaming. Same
  // outer dimensions as the populated card so swap-in is layout-stable.
  // Placed after all hooks to satisfy rules-of-hooks (the `skeleton` prop can
  // flip false once the day arrives).
  if (skeleton) {
    return (
      <div
        id={`section-day-${day.day_number}`}
        className="rounded-xl border border-border bg-card overflow-hidden"
        aria-busy="true"
      >
        <div className="w-full flex items-center gap-3 p-3">
          {/* Thumbnail placeholder — matches populated 72x56 */}
          <div className="w-[72px] h-[56px] rounded-lg overflow-hidden flex-shrink-0 bg-muted animate-pulse" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#0D9488]/15 text-[#0D9488] border border-[#0D9488]/25 text-[10px] font-bold uppercase tracking-wide">
                Day {day.day_number}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {dateStr ? `${dateStr} · ` : ""}
                <span className="inline-block align-middle h-3 w-20 rounded bg-muted animate-pulse" />
              </span>
            </div>
            {day.theme ? (
              <p className="text-[13px] font-medium text-foreground mt-1 truncate">
                {day.theme}
              </p>
            ) : (
              <div className="mt-1.5 h-3 w-2/3 rounded bg-muted animate-pulse" />
            )}
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
        </div>
      </div>
    );
  }


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
      <div
        ref={cardRef}
        id={`section-day-${day.day_number}`}
        className="group rounded-2xl border border-border bg-card overflow-visible transition-all shadow-sm hover:shadow-xl hover:-translate-y-0.5"
      >
        {/* Collapsed card — cinematic banner header with dark overlay */}
        <button
          onClick={() => setOpen(!open)}
          className="w-full text-left relative block overflow-hidden"
        >
          {/* Background image — full-bleed banner */}
          <div className="relative h-[140px] sm:h-[160px] w-full bg-muted overflow-hidden">
            {firstActivity ? (
              <DayThumbnail activity={firstActivity} location={destinationName} />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#0D9488]/20 to-[#0D9488]/5" />
            )}
            {/* Dark gradient overlay — bottom-up for text legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-[hsl(180_25%_8%)] via-[hsl(180_25%_8%)]/70 via-40% to-transparent transition-opacity duration-300" />
            {/* Subtle teal accent vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(13,148,136,0.18),_transparent_60%)] pointer-events-none" />

            {/* Top-left: oversized day numeral */}
            <div className="absolute top-3 left-4 flex items-baseline gap-2">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-white/60">Day</span>
              <span className="text-[28px] font-bold leading-none tabular-nums text-white drop-shadow-md">
                {String(day.day_number).padStart(2, "0")}
              </span>
            </div>

            {/* Top-right: chevron in glass pill */}
            <div className="absolute top-3 right-3 h-7 w-7 rounded-full bg-white/10 backdrop-blur-md ring-1 ring-white/20 flex items-center justify-center transition-transform duration-300 group-hover:bg-white/20">
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 text-white" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-white" />
              )}
            </div>

            {/* Bottom: theme + meta */}
            <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5 pt-6">
              {day.theme && (
                <h3 className="text-[18px] sm:text-[20px] font-semibold text-white leading-tight tracking-tight line-clamp-2 drop-shadow-sm">
                  {day.theme}
                </h3>
              )}
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/75 tabular-nums">
                  {dateStr}
                </span>
                {dateStr && (
                  <span className="text-white/30">•</span>
                )}
                <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#5EEAD4]">
                  {visibleActivities.length === 0
                    ? "No activities"
                    : `${visibleActivities.length} ${visibleActivities.length === 1 ? "experience" : "experiences"}`}
                </span>
                {planId && !isDraft && (
                  <div className="ml-auto">
                    <DayReactionSummary planId={planId} dayIndex={dayIndex} activityCount={day.activities.length} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </button>

        {/* Expanded content */}
        {open && (
          <div className="border-t border-border animate-fade-in">
            {/* Day toolbar — subordinate but accessible */}
            <div className="flex items-center justify-end gap-3 px-3.5 py-2 bg-muted/20">
              {onOpenDayMap && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenDayMap(dayIndex); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <MapIcon className="h-3 w-3" /> View day on map
                </button>
              )}
              {!readOnly && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditDayOpen(true); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <PenLine className="h-3 w-3" /> Edit day
                </button>
              )}
            </div>

            {/* Day-level comments — only when trip is saved (draft notice
                shown once at top of timeline instead of per-day) */}
            {planId && !readOnly && !isDraft && (
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
                      destinationName={destinationName}
                      onRequestChange={() => onRequestChange(day.date, i, activity)}
                      onRequestDescribedChange={(desc) => onRequestDescribedChange(day.date, i, activity, desc)}
                      onCustomPlaceSwap={(name) => onCustomPlaceSwap(day.date, i, name)}
                      onRemove={() => onRemoveActivity(day.date, i, activity)}
                      onCoordsRefined={(lat, lng) => onCoordsRefined?.(day.date, i, lat, lng)}
                      animDelay={i * 50}
                      costFormatter={costFormatter}
                    />
                  </div>
                ))
              )}
            </div>

            {/* Add activity */}
            {!readOnly && (
              addingActivity ? (
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
              )
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

import { useEffect, useMemo } from "react";
import { Sparkles, AlertTriangle, Check, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StreamingState } from "@/hooks/useStreamingTripGeneration";
import type { AIActivity, AIDay, AITripResult } from "@/components/trip-results/useResultsState";

type Props = {
  destination: string;
  state: StreamingState;
  onRetry: () => void;
  onComplete: (result: AITripResult) => void;
};

const STAGE_LABELS: Record<string, string> = {
  starting: "Connecting…",
  parsing_intent: "Reading your preferences…",
  picking_destination: "Picking your surprise destination…",
  destination_picked: "Destination locked in",
  geocoding: "Locating your destination…",
  searching_venues: "Finding venues that match your vibe…",
  hydrating_finalists: "Looking up venue details…",
  ranking: "Composing your day-by-day itinerary…",
  complete: "Your trip is ready!",
  error: "Something went wrong",
};

export function StreamingGeneratingScreen({ destination, state, onRetry, onComplete }: Props) {
  const { stage, meta, imageUrl, days, error, isCacheHit, result } = state;

  // Hand off to the parent results view when generation completes.
  useEffect(() => {
    if (stage === "complete" && result) onComplete(result);
  }, [stage, result, onComplete]);

  const stageLabel = STAGE_LABELS[stage] ?? "Crafting your trip…";

  // Skeleton placeholders for upcoming days.
  const skeletonDays = useMemo(() => {
    if (!meta) return [] as { day_number: number; date: string; theme: string }[];
    const arrived = new Set(days.map((d) => d.day_number));
    return meta.skeleton.filter((s) => !arrived.has(s.day_number));
  }, [meta, days]);

  const headerDestination = meta?.destination || destination || "Your destination";
  const numDays = meta?.num_days ?? 0;

  return (
    <div className="relative w-full h-full overflow-y-auto bg-background">
      {/* Hero */}
      <div className="relative h-[42vh] min-h-[280px] w-full overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={headerDestination}
            className="absolute inset-0 w-full h-full object-cover animate-fade-in"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted/60 to-muted/20 animate-pulse" />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0.6) 30%, transparent 60%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 p-5 lg:p-8 max-w-3xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            {isCacheHit ? "Loading saved trip" : "Live planning"}
          </p>
          <h1 className="text-3xl lg:text-4xl font-bold text-foreground">{headerDestination}</h1>
          {numDays > 0 && (
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {numDays} {numDays === 1 ? "day" : "days"}
            </p>
          )}
        </div>
      </div>

      {/* Progress pill */}
      <div className="sticky top-0 z-20 flex justify-center px-4 py-3 bg-gradient-to-b from-background/90 to-background/0 backdrop-blur-sm pointer-events-none">
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/95 backdrop-blur-xl border shadow-lg max-w-sm transition-all duration-500",
            stage === "complete" ? "border-[#0D9488]/30" : stage === "error" ? "border-destructive/40" : "border-[#0D9488]/20",
          )}
        >
          {stage === "complete" ? (
            <div className="h-5 w-5 rounded-full bg-[#0D9488] flex items-center justify-center animate-scale-in">
              <Check className="h-3 w-3 text-white" />
            </div>
          ) : stage === "error" ? (
            <div className="h-5 w-5 rounded-full bg-destructive flex items-center justify-center">
              <AlertTriangle className="h-3 w-3 text-white" />
            </div>
          ) : (
            <div
              className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Sparkles className="h-3 w-3 text-primary-foreground animate-pulse" />
            </div>
          )}
          <span className="text-xs font-medium text-foreground">{stageLabel}</span>
        </div>
      </div>

      {/* Day cards */}
      <div className="max-w-3xl mx-auto px-4 lg:px-8 pb-24 space-y-4 -mt-6">
        {days.map((day) => (
          <DayCard key={`day-${day.day_number}`} day={day} />
        ))}
        {skeletonDays.map((s) => (
          <SkeletonDayCard key={`skel-${s.day_number}`} day_number={s.day_number} date={s.date} theme={s.theme} />
        ))}

        {/* Empty state pre-meta */}
        {!meta && stage !== "error" && (
          <div className="space-y-3 pt-6">
            {[1, 2, 3].map((i) => (
              <SkeletonDayCard key={`pre-${i}`} day_number={i} date="" theme="" />
            ))}
          </div>
        )}
      </div>

      {/* Error overlay */}
      {stage === "error" && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-card shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-destructive">Couldn't finish your trip</p>
                <p className="text-xs text-muted-foreground mt-1">{error ?? "Unknown error"}</p>
              </div>
            </div>
            <Button
              onClick={onRetry}
              className="w-full h-10 rounded-xl font-semibold text-primary-foreground gap-2"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day card components
// ---------------------------------------------------------------------------

function DayCard({ day }: { day: AIDay }) {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-4 lg:p-5 shadow-sm animate-fade-in"
      style={{ animationDuration: "350ms" }}
    >
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-primary">Day {day.day_number}</span>
        {day.theme && <span className="text-sm font-medium text-foreground">{day.theme}</span>}
      </div>
      <div className="space-y-3">
        {day.activities.map((act, i) => (
          <ActivityRow key={`${day.day_number}-${i}`} activity={act} />
        ))}
        {day.activities.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No activities for this day</p>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ activity }: { activity: AIActivity }) {
  return (
    <div className="flex gap-3 items-start py-1.5">
      <div className="w-14 shrink-0 text-xs font-medium text-muted-foreground tabular-nums pt-0.5">
        {activity.start_time || "—"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{activity.title}</p>
          {activity.is_junto_pick && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              Junto pick
            </span>
          )}
        </div>
        {activity.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{activity.description}</p>
        )}
        {activity.location_name && activity.location_name !== activity.title && (
          <p className="text-[11px] text-muted-foreground/80 mt-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{activity.location_name}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function SkeletonDayCard({ day_number, date: _date, theme }: { day_number: number; date: string; theme: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-4 lg:p-5">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Day {day_number}
        </span>
        {theme ? (
          <span className="text-sm font-medium text-muted-foreground">{theme}</span>
        ) : (
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        )}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 items-start py-1.5">
            <div className="w-14 shrink-0">
              <div className="h-3 w-10 rounded bg-muted animate-pulse" />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

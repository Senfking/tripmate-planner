import { useState, useEffect, useRef, useMemo } from "react";
import { Check, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  destination: string;
  error: string | null;
  onRetry: () => void;
};

function getSteps(destination: string) {
  const d = destination || "your destination";
  return [
    { label: `Finding venues in ${d}…`, delay: 3000 },
    { label: "Checking opening hours and travel times…", delay: 7000 },
    { label: "Clustering by neighborhood…", delay: 11000 },
    { label: "Adding local insider tips…", delay: 16000 },
    { label: "Almost ready…", delay: 21000 },
    { label: "Polishing your itinerary…", delay: Infinity },
  ];
}

export function GeneratingScreen({ destination, error, onRetry }: Props) {
  const steps = useMemo(() => getSteps(destination), [destination]);
  const [completedCount, setCompletedCount] = useState(0);
  const [showDestination, setShowDestination] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (error) return;

    steps.forEach((step, i) => {
      if (step.delay === Infinity) return;
      const t = setTimeout(() => setCompletedCount(i + 1), step.delay);
      timers.current.push(t);
    });

    const destTimer = setTimeout(() => setShowDestination(true), 3000);
    timers.current.push(destTimer);

    return () => timers.current.forEach(clearTimeout);
  }, [error, steps]);

  // If error arrives, complete all
  // If results arrive externally, parent unmounts this — no action needed

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden">
      {/* Skeleton background — mimics TripResultsView layout */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Map skeleton */}
        <div className="h-[40vh] lg:h-full lg:flex-1 bg-muted/40 relative overflow-hidden">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/60 to-muted/20" />
          {/* Fake map grid lines */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }} />
          {/* Destination reveal */}
          <div className={cn(
            "absolute inset-0 flex items-end transition-all duration-1000",
            showDestination && destination ? "opacity-100" : "opacity-0"
          )}>
            <div className="w-full p-6 lg:p-8" style={{
              background: "linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0.8) 40%, transparent 100%)",
            }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">Your destination</p>
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground">{destination || "Somewhere amazing"}</h2>
            </div>
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 lg:w-[45%] lg:flex-none p-5 lg:p-8 space-y-5 overflow-hidden">
          {/* Date bar shimmer */}
          <div className="flex gap-3">
            <div className="h-5 w-24 rounded-full bg-muted animate-pulse" />
            <div className="h-5 w-20 rounded-full bg-muted/60 animate-pulse" />
          </div>

          {/* Day section skeletons */}
          {[1, 2, 3].map((day) => (
            <div key={day} className="space-y-3">
              <div className="h-6 w-32 rounded bg-muted animate-pulse" />
              {[1, 2].map((card) => (
                <div key={card} className="rounded-2xl border border-border bg-card/50 p-4 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-muted animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-1/2 rounded bg-muted/60 animate-pulse" />
                    </div>
                  </div>
                  <div className="h-3 w-full rounded bg-muted/40 animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Progress checklist overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
        <div className={cn(
          "w-full max-w-sm rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-6 pointer-events-auto",
          "transition-all duration-500",
          error ? "ring-1 ring-destructive/30" : ""
        )}>
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-5">
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-[15px]">Junto AI is working</p>
              <p className="text-xs text-muted-foreground">Crafting your perfect trip</p>
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-2.5">
            {STEPS.map((step, i) => {
              const isDone = i < completedCount;
              const isActive = i === completedCount && !error;
              const isFinal = step.delay === Infinity;
              const isPending = !isDone && !isActive;

              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 py-1.5 transition-all duration-500",
                    isDone ? "opacity-100" : isActive ? "opacity-100" : "opacity-40"
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-500",
                    isDone ? "bg-primary scale-100" : "bg-muted scale-90"
                  )}>
                    {isDone ? (
                      <Check className="h-3 w-3 text-primary-foreground animate-scale-in" />
                    ) : isActive && isFinal ? (
                      <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                    ) : isActive ? (
                      <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>

                  {/* Label */}
                  <span className={cn(
                    "text-sm transition-colors duration-500",
                    isDone ? "text-foreground font-medium" : isActive ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Error state */}
          {error && (
            <div className="mt-5 pt-4 border-t border-border animate-fade-in">
              <div className="flex items-start gap-2.5 mb-4">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Something went wrong</p>
                  <p className="text-xs text-muted-foreground mt-1">{error}</p>
                </div>
              </div>
              <Button
                onClick={onRetry}
                className="w-full h-10 rounded-xl font-semibold text-primary-foreground text-sm gap-2"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useGlobalIdeas } from "@/hooks/useGlobalIdeas";
import { Link } from "react-router-dom";
import { Lightbulb, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TabHeroHeader } from "@/components/ui/TabHeroHeader";
import { DesktopFooter } from "@/components/DesktopFooter";

const Ideas = () => {
  const { data, isLoading, isFetching } = useGlobalIdeas();
  const showSkeleton = isLoading || (!data && isFetching);
  const { totalSuggested = 0, totalPlanned = 0, trips = [] } = data ?? {};
  const hasIdeas = trips.length > 0;

  const subtitle = (() => {
    if (showSkeleton) return "Loading…";
    if (!hasIdeas) return "Collect places, activities, and plans across all your trips";
    return `${trips.length} trip${trips.length !== 1 ? "s" : ""} with ideas`;
  })();

  if (showSkeleton) {
    return (
      <div className="min-h-dvh flex flex-col bg-background">
        <TabHeroHeader title="Ideas" subtitle="Loading…" />
        <div className="px-4 mt-4 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-[14px] skeleton-shimmer" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  const isRefreshing = isFetching && !isLoading;
  const totalIdeas = totalSuggested + totalPlanned;

  const ideasSummary = (
    <div className="mt-3 flex flex-col items-center">
      <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-white/40 mb-2">
        Saved ideas
      </p>
      <p className={cn(
        "text-[34px] font-extrabold text-white tracking-tight leading-none transition-opacity duration-300",
        isRefreshing && "opacity-50"
      )}>
        {totalIdeas}
      </p>
      <span className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-white/10 text-white/80">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
        {totalPlanned} planned · {totalSuggested} suggested
      </span>
    </div>
  );

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <TabHeroHeader title="Ideas" subtitle={subtitle}>
        {hasIdeas ? ideasSummary : undefined}
      </TabHeroHeader>

      {!hasIdeas ? (
        <div className="flex flex-col items-center justify-center pt-20 text-center px-4 mt-4 md:max-w-[900px] md:mx-auto md:px-6 w-full">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488]/10">
            <Lightbulb className="h-8 w-8 text-[#0D9488]" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-foreground">No ideas yet</h2>
          <p className="mt-2 max-w-[280px] text-[15px] leading-relaxed text-muted-foreground">
            Save places, restaurants, and activities to your trips and they'll show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3 px-4 mt-4 pb-24 md:max-w-[900px] md:mx-auto md:px-6 w-full">
          {/* Desktop hero summary card */}
          <div
            className="hidden md:block rounded-2xl overflow-hidden mb-2"
            style={{
              background: "linear-gradient(145deg, #0f1f1e 0%, #0D9488 60%, #0369a1 100%)",
              padding: "32px 24px",
            }}
          >
            <p className="text-center text-[10px] uppercase tracking-[0.2em] font-semibold text-white/50 mb-3">
              Ideas across all trips
            </p>
            <p className={cn(
              "text-center text-[46px] font-bold text-white tracking-tight leading-none transition-opacity duration-300",
              isRefreshing && "opacity-50"
            )}>
              {totalIdeas}
            </p>
            <div className="flex justify-center gap-3 mt-5">
              <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center min-w-[120px]">
                <p className="text-[10px] uppercase tracking-wider font-medium text-white/40 mb-1">Suggested</p>
                <p className="text-[15px] font-bold text-white tabular-nums">{totalSuggested}</p>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center min-w-[120px]">
                <p className="text-[10px] uppercase tracking-wider font-medium text-emerald-300 mb-1">Planned</p>
                <p className="text-[15px] font-bold text-emerald-300 tabular-nums">{totalPlanned}</p>
              </div>
            </div>
          </div>

          {trips.map((trip) => (
            <Link
              key={trip.tripId}
              to={`/app/trips/${trip.tripId}/ideas`}
              className="group block rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)] active:scale-[0.98] transition-transform"
            >
              {/* Photo header */}
              <div className="relative h-[72px] overflow-hidden">
                <img
                  src={trip.photoUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 100%)" }}
                />
                <div className="relative z-10 flex items-center justify-between h-full px-4">
                  <p className="text-[15px] font-bold text-white truncate">{trip.tripName}</p>
                  <ChevronRight className="h-4 w-4 text-white/50 shrink-0" />
                </div>
              </div>

              {/* Counts row */}
              <div className="bg-white px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-[#0D9488]" />
                  <span className="text-[13px] font-medium text-muted-foreground">
                    {trip.totalCount} idea{trip.totalCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[12px] font-semibold tabular-nums">
                  {trip.plannedCount > 0 && (
                    <span className="text-emerald-600">{trip.plannedCount} planned</span>
                  )}
                  {trip.suggestedCount > 0 && (
                    <span className="text-muted-foreground">{trip.suggestedCount} suggested</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <DesktopFooter />
    </div>
  );
};

export default Ideas;

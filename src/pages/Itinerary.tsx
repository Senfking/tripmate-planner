import { useState } from "react";
import { useGlobalItinerary, type TripItineraryGroup } from "@/hooks/useGlobalItinerary";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin, Clock, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO, isToday, isTomorrow, differenceInDays, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { TabHeroHeader, type HeroPill } from "@/components/ui/TabHeroHeader";

type FilterType = "all" | "mine";

const Itinerary = () => {
  const { data: groups, isLoading } = useGlobalItinerary();
  const [filter, setFilter] = useState<FilterType>("all");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Gather all items across all trips, sorted by date
  const allItems = (groups ?? []).flatMap((g) =>
    g.items.map((item) => ({ ...item, tripName: g.tripName, tripEmoji: g.tripEmoji }))
  );
  const totalActivities = allItems.length;
  const totalPlaceholders = (groups ?? []).reduce((sum, g) => sum + g.placeholders.length, 0);

  // Find next upcoming item
  const nextItem = allItems.find((item) => parseISO(item.dayDate) >= today);

  const nextRelative = (() => {
    if (!nextItem) return "";
    const d = parseISO(nextItem.dayDate);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    const days = differenceInDays(d, today);
    return `In ${days}d`;
  })();

  const subtitle = (() => {
    if (isLoading) return "Loading…";
    if (totalActivities === 0 && totalPlaceholders === 0) return "Nothing planned yet";
    if (totalActivities === 0 && totalPlaceholders > 0) return `${totalPlaceholders} destination${totalPlaceholders !== 1 ? "s" : ""} awaiting activities`;
    if (nextItem) return `Next up: ${nextItem.title}`;
    return `${totalActivities} upcoming activities`;
  })();

  const pills: HeroPill[] = [];
  if (!isLoading) {
    if (totalActivities > 0) {
      pills.push({ icon: <CalendarDays className="h-3 w-3" />, label: `${totalActivities} planned` });
    }
    if (nextRelative) {
      pills.push({ icon: <Clock className="h-3 w-3" />, label: nextRelative });
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-10rem)]" style={{ backgroundColor: "#F1F5F9" }}>
        <TabHeroHeader title="Itinerary" subtitle="Loading…" />
        <div className="px-4 mt-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[56px] rounded-[14px] skeleton-shimmer" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  // Build a unified timeline: group all items by date across trips
  const filteredGroups: TripItineraryGroup[] = (groups ?? []).map((g) => {
    if (filter === "all") return g;
    return {
      ...g,
      items: g.items.filter(
        (i) => i.attendance === "in" || i.attendance === null
      ),
    };
  }).filter((g) => g.items.length > 0 || g.placeholders.length > 0);

  // Flatten into date-based timeline
  const timelineItems = filteredGroups.flatMap((g) =>
    g.items.map((item) => ({
      ...item,
      tripName: g.tripName,
      tripEmoji: g.tripEmoji,
      tripId: item.tripId,
    }))
  );

  // Group by date for calendar-list view
  const dateMap = new Map<string, typeof timelineItems>();
  for (const item of timelineItems) {
    const existing = dateMap.get(item.dayDate) ?? [];
    existing.push(item);
    dateMap.set(item.dayDate, existing);
  }
  const sortedDates = Array.from(dateMap.keys()).sort();

  // Placeholders (destinations without items)
  const allPlaceholders = filteredGroups.flatMap((g) =>
    g.placeholders.map((p) => ({ ...p, tripName: g.tripName, tripEmoji: g.tripEmoji }))
  );

  const isEmpty = sortedDates.length === 0 && allPlaceholders.length === 0;

  return (
    <div className="min-h-[calc(100vh-10rem)]" style={{ backgroundColor: "#F1F5F9" }}>
      <TabHeroHeader title="Itinerary" subtitle={subtitle} pills={pills}>
        {/* Upcoming preview — next 3 days with items */}
        {nextItem && sortedDates.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {sortedDates.slice(0, 4).map((date) => {
              const d = parseISO(date);
              const items = dateMap.get(date) ?? [];
              const isActive = isToday(d);
              return (
                <div
                  key={date}
                  className="flex flex-col items-center shrink-0"
                  style={{
                    minWidth: 56,
                    padding: "8px 6px",
                    borderRadius: 14,
                    background: isActive ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.08)",
                    border: isActive ? "1px solid rgba(255,255,255,0.30)" : "1px solid transparent",
                  }}
                >
                  <span className="text-[10px] font-semibold uppercase text-white/50">
                    {format(d, "EEE")}
                  </span>
                  <span className={cn(
                    "text-[18px] font-bold leading-none mt-0.5",
                    isActive ? "text-white" : "text-white/80"
                  )}>
                    {format(d, "d")}
                  </span>
                  <div className="flex gap-0.5 mt-1.5">
                    {items.slice(0, 3).map((_, i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: isActive ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)" }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TabHeroHeader>

      <div className="px-4 mt-4 pb-32">
        {/* Filter toggle */}
        <div className="mb-4 flex gap-1 rounded-xl bg-white p-1 border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {(["all", "mine"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
                filter === f
                  ? "bg-[#0D9488] text-white shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              {f === "all" ? "All activities" : "My Plan"}
            </button>
          ))}
        </div>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488]/10">
              <CalendarDays className="h-8 w-8 text-[#0D9488]" />
            </div>
            <h2 className="mt-5 text-lg font-bold text-foreground">
              {filter === "all" ? "Nothing planned yet" : "Nothing confirmed for you yet"}
            </h2>
            <p className="mt-2 max-w-[260px] text-[15px] leading-relaxed text-muted-foreground">
              {filter === "all"
                ? "Confirm your trip route to start building your itinerary."
                : "Mark yourself as attending activities in your trips."}
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {/* Calendar-list timeline */}
            {sortedDates.map((date, dateIdx) => {
              const d = parseISO(date);
              const items = dateMap.get(date) ?? [];
              const isActiveDay = isToday(d);
              const isTmrw = isTomorrow(d);

              return (
                <div key={date} className="flex gap-3 mb-0.5">
                  {/* Date column — left sidebar */}
                  <div className="flex flex-col items-center w-[52px] shrink-0 pt-1">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider",
                      isActiveDay ? "text-[#0D9488]" : "text-muted-foreground"
                    )}>
                      {isActiveDay ? "Today" : isTmrw ? "Tmrw" : format(d, "EEE")}
                    </span>
                    <span className={cn(
                      "text-[22px] font-bold leading-none mt-0.5",
                      isActiveDay ? "text-[#0D9488]" : "text-foreground"
                    )}>
                      {format(d, "d")}
                    </span>
                    <span className={cn(
                      "text-[10px] font-medium",
                      isActiveDay ? "text-[#0D9488]/60" : "text-muted-foreground/60"
                    )}>
                      {format(d, "MMM")}
                    </span>
                    {/* Timeline connector */}
                    {dateIdx < sortedDates.length - 1 && (
                      <div className="flex-1 w-px mt-2 mb-0" style={{ background: "rgba(0,0,0,0.08)" }} />
                    )}
                  </div>

                  {/* Items for this date */}
                  <div className="flex-1 min-w-0 pb-4 space-y-1.5">
                    {items.map((item) => (
                      <Link
                        key={item.id}
                        to={`/app/trips/${item.tripId}/itinerary`}
                        className={cn(
                          "block rounded-[14px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3 active:scale-[0.98] transition-transform",
                          isActiveDay
                            ? "bg-white border-[#0D9488]/15"
                            : "bg-white border-[#F1F5F9]"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {/* Attendance indicator */}
                          {item.attendance === "in" && (
                            <span className="h-2 w-2 rounded-full bg-[#0D9488] shrink-0" />
                          )}
                          {item.attendance === "maybe" && (
                            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[11px] text-muted-foreground">
                                {item.tripEmoji ?? "✈️"} {item.tripName}
                              </span>
                              {item.startTime && (
                                <span className="text-[11px] text-muted-foreground/60">
                                  · {item.startTime.slice(0, 5)}
                                </span>
                              )}
                            </div>
                            <p className="text-[14px] font-medium text-foreground truncate">
                              {item.title}
                            </p>
                            {item.locationText && (
                              <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {item.locationText}
                              </p>
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] shrink-0",
                              item.status === "confirmed"
                                ? "border-[#0D9488]/30 text-[#0D9488]"
                                : "border-muted-foreground/30 text-muted-foreground"
                            )}
                          >
                            {item.status}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Destinations without items */}
            {allPlaceholders.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 pl-1">
                  Needs planning
                </p>
                {allPlaceholders.map((stop) => (
                  <div
                    key={stop.id}
                    className="bg-white rounded-[14px] border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3 flex items-center justify-between mb-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">
                          {(stop as any).tripEmoji ?? "✈️"} {stop.destination}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(stop.startDate), "MMM d")} – {format(parseISO(stop.endDate), "MMM d")}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0 text-xs" asChild>
                      <Link to={`/app/trips/${stop.tripId}/itinerary`}>Plan</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Itinerary;

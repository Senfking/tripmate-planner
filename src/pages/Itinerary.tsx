import { useState } from "react";
import { useGlobalItinerary, type TripItineraryGroup } from "@/hooks/useGlobalItinerary";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin, Plane } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isToday, isTomorrow, differenceInDays, addDays, isBefore, isEqual } from "date-fns";
import { cn } from "@/lib/utils";
import { TabHeroHeader, type HeroPill } from "@/components/ui/TabHeroHeader";
import { TripStartBanner, TripEndBanner } from "@/components/itinerary/TripBannerDivider";
import { DesktopFooter } from "@/components/DesktopFooter";

type FilterType = "all" | "mine";

/** Generate every date string between start and end (inclusive) */
function enumerateDays(start: string, end: string): string[] {
  const dates: string[] = [];
  let cur = parseISO(start);
  const last = parseISO(end);
  while (isBefore(cur, last) || isEqual(cur, last)) {
    dates.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
  }
  return dates;
}

interface TripBoundary {
  tripName: string;
  tripEmoji: string | null;
  tripId: string;
  tripStartDate: string | null;
  tripEndDate: string | null;
  tripDestination: string | null;
  tripCoverImagePath: string | null;
  routeStopDests: string[];
}
interface DestBoundary { destination: string; tripName: string; tripEmoji: string | null; tripId: string }

const Itinerary = () => {
  const { data: groups, isLoading } = useGlobalItinerary();
  const [filter, setFilter] = useState<FilterType>("all");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = format(today, "yyyy-MM-dd");

  const allItems = (groups ?? []).flatMap((g) =>
    g.items.map((item) => ({ ...item, tripName: g.tripName, tripEmoji: g.tripEmoji }))
  );
  const totalActivities = allItems.length;

  const allPlaceholders = (groups ?? []).flatMap((g) =>
    g.placeholders.map((p) => ({ ...p, tripName: g.tripName, tripEmoji: g.tripEmoji }))
  );

  const nextItem = allItems.find((item) => item.dayDate >= todayStr);

  const nextRelative = (() => {
    if (!nextItem) return "";
    const d = parseISO(nextItem.dayDate);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return `In ${differenceInDays(d, today)}d`;
  })();

  const subtitle = (() => {
    if (isLoading) return "Loading…";
    if (totalActivities === 0 && allPlaceholders.length === 0 && !(groups ?? []).some(g => g.tripStartDate)) return "Nothing planned yet";
    if (totalActivities === 0 && allPlaceholders.length > 0)
      return `${allPlaceholders.length} destination${allPlaceholders.length !== 1 ? "s" : ""} on your route`;
    if (nextItem) return `Next: ${nextItem.title} · ${nextRelative}`;
    if (totalActivities > 0) return `${totalActivities} activities planned`;
    const tripCount = (groups ?? []).filter(g => g.tripStartDate).length;
    if (tripCount > 0) return `${tripCount} trip${tripCount !== 1 ? "s" : ""} coming up`;
    return "Nothing planned yet";
  })();

  const pills: HeroPill[] = [];
  if (!isLoading) {
    if (totalActivities > 0) {
      pills.push({ icon: <CalendarDays className="h-3 w-3" />, label: `${totalActivities} planned` });
    }
    if (allPlaceholders.length > 0) {
      pills.push({ icon: <MapPin className="h-3 w-3" />, label: `${allPlaceholders.length} stop${allPlaceholders.length !== 1 ? "s" : ""}` });
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F1F5F9" }}>
        <TabHeroHeader title="Itinerary" subtitle="Loading…" />
        <div className="px-4 mt-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[56px] rounded-[14px] skeleton-shimmer" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  // Apply filter
  const filteredGroups: TripItineraryGroup[] = (groups ?? []).map((g) => {
    if (filter === "all") return g;
    return {
      ...g,
      items: g.items.filter((i) => i.attendance === "in" || i.attendance === null),
    };
  }).filter((g) => g.items.length > 0 || g.placeholders.length > 0 || (g.tripStartDate && g.tripEndDate));

  // Build items by date
  type TimelineItem = typeof allItems[number];
  const dateMap = new Map<string, TimelineItem[]>();
  for (const g of filteredGroups) {
    for (const item of g.items) {
      const enriched = { ...item, tripName: g.tripName, tripEmoji: g.tripEmoji };
      const existing = dateMap.get(item.dayDate) ?? [];
      existing.push(enriched);
      dateMap.set(item.dayDate, existing);
    }
  }

  // Trip start/end boundaries
  const tripStartMap = new Map<string, TripBoundary[]>();
  const tripEndMap = new Map<string, TripBoundary[]>();
  // Destination start/end boundaries
  const destStartMap = new Map<string, DestBoundary[]>();
  const destEndMap = new Map<string, DestBoundary[]>();

  // Collect all dates we need to show
  const allDatesSet = new Set<string>([...dateMap.keys()]);

  for (const g of filteredGroups) {
    const routeStopDests = g.placeholders.map((p) => p.destination);
    const b: TripBoundary = {
      tripName: g.tripName,
      tripEmoji: g.tripEmoji,
      tripId: g.tripId,
      tripStartDate: g.tripStartDate,
      tripEndDate: g.tripEndDate,
      tripDestination: g.tripDestination,
      tripCoverImagePath: g.tripCoverImagePath,
      routeStopDests,
    };

    // Trip-level boundaries
    if (g.tripStartDate && g.tripEndDate) {
      const start = g.tripStartDate >= todayStr ? g.tripStartDate : todayStr;
      const end = g.tripEndDate;
      if (start <= end) {
        // Add every day of the trip
        for (const d of enumerateDays(start, end)) {
          allDatesSet.add(d);
        }
        // Mark trip boundaries
        if (g.tripStartDate >= todayStr) {
          const arr = tripStartMap.get(g.tripStartDate) ?? [];
          arr.push(b);
          tripStartMap.set(g.tripStartDate, arr);
        }
        const endArr = tripEndMap.get(g.tripEndDate) ?? [];
        endArr.push(b);
        tripEndMap.set(g.tripEndDate, endArr);
      }
    }

    // Destination-level boundaries
    for (const p of g.placeholders) {
      const db: DestBoundary = { destination: p.destination, tripName: g.tripName, tripEmoji: g.tripEmoji, tripId: g.tripId };
      const startArr = destStartMap.get(p.startDate) ?? [];
      startArr.push(db);
      destStartMap.set(p.startDate, startArr);
      allDatesSet.add(p.startDate);

      const endArr = destEndMap.get(p.endDate) ?? [];
      endArr.push(db);
      destEndMap.set(p.endDate, endArr);
      allDatesSet.add(p.endDate);
    }
  }

  const sortedDates = Array.from(allDatesSet).sort();
  const isEmpty = sortedDates.length === 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F1F5F9" }}>
      <TabHeroHeader title="Itinerary" subtitle={subtitle} pills={pills}>
        {/* Mini calendar strip */}
        {sortedDates.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {sortedDates.slice(0, 7).map((date) => {
              const d = parseISO(date);
              const itemCount = (dateMap.get(date) ?? []).length;
              const isActive = isToday(d);
              return (
                <button
                  key={date}
                  onClick={() => {
                    const el = document.getElementById(`day-${date}`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="flex flex-col items-center shrink-0 cursor-pointer active:scale-95 transition-transform"
                  style={{
                    minWidth: 44,
                    padding: "5px 4px",
                    borderRadius: 12,
                    background: isActive ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.08)",
                    border: isActive ? "1px solid rgba(255,255,255,0.30)" : "1px solid transparent",
                  }}
                >
                  <span className="text-[10px] font-semibold uppercase text-white/50">
                    {format(d, "EEE")}
                  </span>
                  <span className={cn(
                    "text-[17px] font-bold leading-none mt-0.5",
                    isActive ? "text-white" : "text-white/80"
                  )}>
                    {format(d, "d")}
                  </span>
                  <span className="text-[8px] font-medium uppercase text-white/30 mt-0.5">
                    {format(d, "MMM")}
                  </span>
                  {itemCount > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {Array.from({ length: Math.min(itemCount, 3) }).map((_, i) => (
                        <span
                          key={i}
                          className="h-1 w-1 rounded-full"
                          style={{
                            background: isActive ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </TabHeroHeader>

      <div className="px-4 mt-4 pb-32 md:max-w-[900px] md:mx-auto md:px-8">
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
            {sortedDates.map((date, dateIdx) => {
              const d = parseISO(date);
              const items = dateMap.get(date) ?? [];
              const tripStarts = tripStartMap.get(date) ?? [];
              const tripEnds = tripEndMap.get(date) ?? [];
              const destStarts = destStartMap.get(date) ?? [];
              const destEnds = destEndMap.get(date) ?? [];
              const isActiveDay = isToday(d);
              const isTmrw = isTomorrow(d);
              const hasItems = items.length > 0;

              return (
                <div key={date} id={`day-${date}`} className="scroll-mt-4">
                  {/* Trip start — photo banner */}
                  {tripStarts.map((trip, i) => (
                    <TripStartBanner
                      key={`trip-start-${trip.tripId}-${i}`}
                      tripId={trip.tripId}
                      tripName={trip.tripName}
                      tripEmoji={trip.tripEmoji}
                      tripStartDate={trip.tripStartDate}
                      tripEndDate={trip.tripEndDate}
                      tripDestination={trip.tripDestination}
                      tripCoverImagePath={trip.tripCoverImagePath}
                      routeStopDests={trip.routeStopDests}
                    />
                  ))}

                  {/* Destination arrival — visible divider before the day */}
                  {destStarts.map((dest, i) => (
                    <div
                      key={`dest-start-${dest.tripId}-${dest.destination}-${i}`}
                      className="flex items-center gap-2.5 py-2.5 px-1"
                    >
                      <div className="flex-1 h-px bg-[#0D9488]/15" />
                      <MapPin className="h-3.5 w-3.5 text-[#0D9488]/60 shrink-0" />
                      <span className="text-[11px] font-semibold text-[#0D9488]/70 whitespace-nowrap">
                        → {dest.destination}
                      </span>
                      <div className="flex-1 h-px bg-[#0D9488]/15" />
                    </div>
                  ))}

                  {/* Day row */}
                  <div className="flex gap-3 mb-0.5">
                    {/* Date column */}
                    <div className="flex flex-col items-center w-[52px] shrink-0 pt-1">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider",
                        isActiveDay ? "text-[#0D9488]" : "text-muted-foreground"
                      )}>
                        {isActiveDay ? "Today" : isTmrw ? "Tmrw" : format(d, "EEE")}
                      </span>
                      <span className={cn(
                        "text-[22px] font-bold leading-none mt-0.5",
                        isActiveDay ? "text-[#0D9488]" : hasItems ? "text-foreground" : "text-muted-foreground/40"
                      )}>
                        {format(d, "d")}
                      </span>
                      <span className={cn(
                        "text-[10px] font-medium",
                        isActiveDay ? "text-[#0D9488]/60" : "text-muted-foreground/60"
                      )}>
                        {format(d, "MMM")}
                      </span>
                      {dateIdx < sortedDates.length - 1 && (
                        <div className="flex-1 w-px mt-2 mb-0" style={{ background: "rgba(0,0,0,0.08)" }} />
                      )}
                    </div>

                    {/* Content column */}
                    <div className="flex-1 min-w-0 pb-3 space-y-1.5">
                      {/* Activity cards */}
                      {items.map((item) => (
                        <Link
                          key={item.id}
                          to={`/app/trips/${item.tripId}/itinerary`}
                          className={cn(
                            "block rounded-[14px] border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3 active:scale-[0.98] transition-transform",
                            isActiveDay ? "bg-white border-[#0D9488]/15" : "bg-white border-[#F1F5F9]"
                          )}
                        >
                          <div className="flex items-center gap-2">
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

                      {/* Empty day */}
                      {!hasItems && (
                        <div className="py-1">
                          <span className="text-[11px] text-muted-foreground/30 italic">Free day</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Destination departure — visible divider after the day */}
                  {destEnds.map((dest, i) => (
                    <div
                      key={`dest-end-${dest.tripId}-${dest.destination}-${i}`}
                      className="flex items-center gap-2.5 py-2 px-1"
                    >
                      <div className="flex-1 h-px bg-muted-foreground/15" />
                      <MapPin className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                      <span className="text-[11px] font-medium text-muted-foreground/50 whitespace-nowrap">
                        ← leaving {dest.destination}
                      </span>
                      <div className="flex-1 h-px bg-muted-foreground/15" />
                    </div>
                  ))}

                  {/* Trip end — photo banner */}
                  {tripEnds.map((trip, i) => (
                    <TripEndBanner
                      key={`trip-end-${trip.tripId}-${i}`}
                      tripId={trip.tripId}
                      tripName={trip.tripName}
                      tripEmoji={trip.tripEmoji}
                      tripStartDate={trip.tripStartDate}
                      tripEndDate={trip.tripEndDate}
                      tripDestination={trip.tripDestination}
                      tripCoverImagePath={trip.tripCoverImagePath}
                      routeStopDests={trip.routeStopDests}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Itinerary;

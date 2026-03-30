import { useState } from "react";
import { useGlobalItinerary, type TripItineraryGroup } from "@/hooks/useGlobalItinerary";
import { Link } from "react-router-dom";
import { CalendarDays, MapPin, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

type Filter = "all" | "mine";

const Itinerary = () => {
  const { data: groups, isLoading } = useGlobalItinerary();
  const [filter, setFilter] = useState<Filter>("all");

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#0D9488]" />
      </div>
    );
  }

  // Apply filter
  const filtered: TripItineraryGroup[] = (groups ?? []).map((g) => {
    if (filter === "all") return g;
    return {
      ...g,
      items: g.items.filter(
        (i) => i.attendance === "in" || i.attendance === null
      ),
    };
  }).filter((g) => g.items.length > 0 || g.placeholders.length > 0);

  const isEmpty = filtered.length === 0;

  return (
    <div className="min-h-[calc(100vh-10rem)] bg-[#F1F5F9] px-4 pb-32 pt-6">
      <h1 className="mb-4 text-[22px] font-bold text-foreground">Itinerary</h1>

      {/* Toggle */}
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
        <div className="flex flex-col items-center justify-center pt-20 text-center">
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
        <div className="space-y-5">
          {filtered.map((group) => (
            <TripGroup key={group.tripId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
};

function TripGroup({ group }: { group: TripItineraryGroup }) {
  const dates = group.items.map((i) => i.dayDate);
  const minDate = dates.length ? dates[0] : group.placeholders[0]?.startDate;
  const maxDate = dates.length
    ? dates[dates.length - 1]
    : group.placeholders[group.placeholders.length - 1]?.endDate;

  const dateRange =
    minDate && maxDate
      ? `${format(parseISO(minDate), "d MMM")} – ${format(parseISO(maxDate), "d MMM")}`
      : "";

  // Group items by date
  const byDate = new Map<string, typeof group.items>();
  for (const item of group.items) {
    const existing = byDate.get(item.dayDate) ?? [];
    existing.push(item);
    byDate.set(item.dayDate, existing);
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base">{group.tripEmoji ?? "✈️"}</span>
        <span className="text-sm font-semibold text-foreground truncate">{group.tripName}</span>
        {dateRange && (
          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
            {dateRange}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {Array.from(byDate.entries()).map(([date, dateItems]) => (
          <div key={date}>
            <p className="text-xs font-medium text-muted-foreground mb-1 pl-1">
              {format(parseISO(date), "EEE d MMM")}
            </p>
            {dateItems.map((item) => (
              <Link
                key={item.id}
                to={`/app/trips/${item.tripId}/itinerary`}
                className="block bg-white rounded-[14px] border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3 mb-1.5 active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-2">
                  {/* Attendance dot */}
                  {item.attendance === "in" && (
                    <span className="h-2 w-2 rounded-full bg-[#0D9488] shrink-0" />
                  )}
                  {item.attendance === "maybe" && (
                    <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
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
        ))}

        {/* Placeholders for route stops without items */}
        {group.placeholders.map((stop) => (
          <div
            key={stop.id}
            className="bg-white rounded-[14px] border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-foreground truncate">
                  {stop.destination}
                </p>
                <p className="text-xs text-muted-foreground">
                  Itinerary not added yet
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 text-xs" asChild>
              <Link to={`/app/trips/${stop.tripId}/itinerary`}>Plan this</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Itinerary;

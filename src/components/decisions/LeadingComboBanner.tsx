import { format, parseISO, differenceInDays } from "date-fns";
import type { DateOption } from "@/hooks/useProposals";
import type { RouteStop } from "@/hooks/useRouteStops";

type Props = {
  leadingCombo: {
    destination: string;
    dateOption: DateOption | null;
  } | null;
  routeStops: RouteStop[];
  isRouteLocked: boolean;
};

export function LeadingComboBanner({ leadingCombo, routeStops, isRouteLocked }: Props) {
  const fmt = (d: string) => format(parseISO(d), "MMM d");

  // Route-based banners take priority
  if (routeStops.length > 0) {
    const sorted = [...routeStops].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const tripStart = sorted[0]?.start_date;
    const tripEnd = [...routeStops].sort((a, b) => b.end_date.localeCompare(a.end_date))[0]?.end_date;
    const totalDays = tripStart && tripEnd ? differenceInDays(parseISO(tripEnd), parseISO(tripStart)) : 0;

    if (isRouteLocked) {
      return (
        <div className="rounded-lg bg-gradient-to-r from-primary to-primary/80 px-4 py-3 text-primary-foreground">
          <p className="text-sm font-medium">
            🔒 {routeStops.length}-stop route · {fmt(tripStart)} – {fmt(tripEnd)} · {totalDays} days - locked
          </p>
        </div>
      );
    }

    if (routeStops.length === 1) {
      return (
        <div className="rounded-lg bg-primary/10 px-4 py-3">
          <p className="text-sm text-primary font-medium">
            📍 1 stop confirmed - keep adding!
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-lg bg-primary/10 px-4 py-3">
        <p className="text-sm text-primary font-medium">
          🗺️ {routeStops.length}-stop route · {fmt(tripStart)} – {fmt(tripEnd)} · {totalDays} days
        </p>
      </div>
    );
  }

  // Fallback: show frontrunner
  if (!leadingCombo) return null;

  const dateStr = leadingCombo.dateOption
    ? `${format(new Date(leadingCombo.dateOption.start_date + "T00:00:00"), "MMM d")} – ${format(new Date(leadingCombo.dateOption.end_date + "T00:00:00"), "MMM d")}`
    : null;

  return (
    <div className="rounded-lg bg-primary/10 px-4 py-3">
      <p className="text-sm text-primary font-medium">
        🏆 {leadingCombo.destination}
        {dateStr && <> · {dateStr}</>} is currently winning
      </p>
    </div>
  );
}

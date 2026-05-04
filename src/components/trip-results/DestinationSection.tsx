import { MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  name: string;
  startDate: string;
  endDate: string;
  intro: string;
  dayRange: string;
  /** "calendar" (default) shows "MMM d — MMM d"; "generic" hides the
   *  date range entirely so date-agnostic templates don't print sentinel
   *  dates like "Jan 1 — Jan 7". */
  dateMode?: "calendar" | "generic";
}

export function DestinationSection({ name, startDate, endDate, dayRange, dateMode = "calendar" }: Props) {
  const showDates = dateMode !== "generic";
  const startStr = (() => {
    try { return format(parseISO(startDate), "MMM d"); } catch { return startDate; }
  })();
  const endStr = (() => {
    try { return format(parseISO(endDate), "MMM d"); } catch { return endDate; }
  })();

  return (
    <div className="px-4 pt-6 pb-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <MapPin className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-foreground leading-tight">
            {name}
          </h2>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
            {showDates && <span>{startStr} — {endStr}</span>}
            {showDates && <span className="text-muted-foreground/40">·</span>}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium text-[11px] ring-1 ring-inset ring-primary/20">
              {dayRange}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

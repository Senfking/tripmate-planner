import { format, parseISO } from "date-fns";

interface Props {
  name: string;
  startDate: string;
  endDate: string;
  intro: string;
  dayRange: string;
}

export function DestinationSection({ name, startDate, endDate, intro, dayRange }: Props) {
  const startStr = (() => {
    try { return format(parseISO(startDate), "MMM d"); } catch { return startDate; }
  })();
  const endStr = (() => {
    try { return format(parseISO(endDate), "MMM d"); } catch { return endDate; }
  })();

  return (
    <div className="px-4 pt-6 pb-3">
      <h2 className="text-2xl font-bold text-primary leading-tight">
        {name}
      </h2>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
        <span>{startStr} — {endStr}</span>
        <span className="px-1.5 py-0.5 rounded bg-accent font-mono text-[10px]">
          {dayRange}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
        {intro}
      </p>
    </div>
  );
}

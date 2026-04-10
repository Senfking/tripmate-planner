import { format, parseISO } from "date-fns";
import { getCategoryColor } from "./categoryColors";

interface Props {
  name: string;
  startDate: string;
  endDate: string;
  intro: string;
  dayRange: string;
}

const GRADIENT_PRESETS = [
  ["#F97316", "#EF4444"],
  ["#A855F7", "#EC4899"],
  ["#22C55E", "#0D9488"],
  ["#3B82F6", "#6366F1"],
];

export function DestinationSection({ name, startDate, endDate, intro, dayRange }: Props) {
  const startStr = (() => {
    try { return format(parseISO(startDate), "MMM d"); } catch { return startDate; }
  })();
  const endStr = (() => {
    try { return format(parseISO(endDate), "MMM d"); } catch { return endDate; }
  })();

  return (
    <div className="px-4 pt-6 pb-3">
      <h2
        className="text-2xl font-bold text-foreground leading-tight"
        style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        {name}
      </h2>
      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
        <span>{startStr} — {endStr}</span>
        <span className="px-1.5 py-0.5 rounded bg-[#1e2130] font-mono text-[10px]">
          {dayRange}
        </span>
      </div>
      <p className="text-sm text-muted-foreground/80 mt-3 leading-relaxed">
        {intro}
      </p>

      {/* Photo placeholder carousel */}
      <div className="flex gap-2.5 mt-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
        {GRADIENT_PRESETS.map((g, i) => (
          <div
            key={i}
            className="w-44 h-28 rounded-xl flex-shrink-0 snap-start"
            style={{
              background: `linear-gradient(135deg, ${g[0]}30, ${g[1]}20)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

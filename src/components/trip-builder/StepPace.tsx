import { cn } from "@/lib/utils";
import type { PaceLevel } from "./useTripBuilderDefaults";

type Props = {
  value: PaceLevel;
  source: string | null;
  onChange: (v: PaceLevel) => void;
};

type Option = {
  key: PaceLevel;
  label: string;
  tag: string;
  desc: string;
  /** intensity 1-3 */
  intensity: 1 | 2 | 3;
};

// Order: light → balanced → packed (low to high intensity).
// Field name stays `pace` to match the existing edge function contract;
// `relaxed` = "Light", `balanced` = "Balanced", `packed` = "Active".
const OPTIONS: Option[] = [
  {
    key: "relaxed",
    label: "Light",
    tag: "just food anchors",
    desc: "Lunch and dinner spots, leave the days open",
    intensity: 1,
  },
  {
    key: "balanced",
    label: "Balanced",
    tag: "a few highlights per day",
    desc: "2–3 activities + meals, room to wander",
    intensity: 2,
  },
  {
    key: "packed",
    label: "Active",
    tag: "packed itinerary",
    desc: "4–5 activities per day, every slot filled",
    intensity: 3,
  },
];

function IntensityBars({ intensity, selected }: { intensity: 1 | 2 | 3; selected: boolean }) {
  return (
    <div className="flex items-end gap-1" aria-hidden="true">
      {[1, 2, 3].map((i) => {
        const active = i <= intensity;
        const heights = ["h-2", "h-3", "h-4"];
        return (
          <span
            key={i}
            className={cn(
              "w-1.5 rounded-full transition-colors",
              heights[i - 1],
              active
                ? selected
                  ? "bg-primary-foreground"
                  : "bg-primary"
                : selected
                ? "bg-primary-foreground/30"
                : "bg-muted-foreground/25",
            )}
          />
        );
      })}
    </div>
  );
}

export function StepPace({ value, source, onChange }: Props) {
  return (
    <div className="flex flex-col h-full px-6 pt-12 sm:pt-16 font-sans">
      <h2 className="text-2xl font-bold text-foreground mb-1">How full should your days be?</h2>
      {source ? (
        <p className="text-xs text-muted-foreground mb-4">{source}</p>
      ) : (
        <p className="text-xs text-muted-foreground mb-4">
          We'll match the itinerary intensity to your travel style.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {OPTIONS.map((opt) => {
          const selected = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              aria-pressed={selected}
              className={cn(
                "w-full flex items-start gap-4 p-4 sm:p-5 rounded-2xl border text-left transition-all active:scale-[0.99]",
                selected
                  ? "border-transparent text-primary-foreground shadow-lg"
                  : "bg-card border-border hover:border-primary/40 hover:shadow-sm",
              )}
              style={selected ? { background: "var(--gradient-primary)" } : undefined}
            >
              <div
                className={cn(
                  "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                  selected ? "bg-primary-foreground/15" : "bg-muted/60",
                )}
              >
                <IntensityBars intensity={opt.intensity} selected={selected} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p
                    className={cn(
                      "font-semibold text-[15px] leading-tight",
                      selected ? "text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {opt.label}
                  </p>
                  <span
                    className={cn(
                      "text-[12px] font-medium",
                      selected ? "text-primary-foreground/75" : "text-muted-foreground",
                    )}
                  >
                    — {opt.tag}
                  </span>
                </div>
                <p
                  className={cn(
                    "text-sm mt-1 leading-snug",
                    selected ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {opt.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";
import type { BudgetLevel } from "./useTripBuilderDefaults";

type Props = {
  value: BudgetLevel;
  source: string | null;
  onChange: (v: BudgetLevel) => void;
};

const OPTIONS: { key: BudgetLevel; emoji: string; label: string; desc: string }[] = [
  { key: "budget", emoji: "💰", label: "Budget", desc: "Street food, hostels, local transport" },
  { key: "mid-range", emoji: "💳", label: "Mid-range", desc: "Nice restaurants, 3-star hotels, mix of transport" },
  { key: "premium", emoji: "💎", label: "Premium", desc: "Fine dining, luxury stays, private transfers" },
];

export function StepBudget({ value, source, onChange }: Props) {
  return (
    <div className="flex flex-col h-full px-6 pt-12 sm:pt-16">
      <h2 className="text-2xl font-bold text-foreground mb-1">What's your budget style?</h2>
      {source && (
        <p className="text-xs text-muted-foreground mb-4">{source}</p>
      )}
      {!source && <div className="mb-4" />}

      <div className="flex flex-col gap-3">
        {OPTIONS.map((opt) => {
          const selected = value === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              className={cn(
                "flex items-center gap-4 p-5 rounded-2xl border transition-all text-left active:scale-[0.98]",
                selected
                  ? "border-transparent text-primary-foreground shadow-lg"
                  : "bg-card border-border hover:border-primary/40 hover:shadow-sm"
              )}
              style={selected ? { background: "var(--gradient-primary)" } : undefined}
            >
              <span className="text-3xl">{opt.emoji}</span>
              <div>
                <p className={cn("font-semibold text-[15px]", selected ? "text-primary-foreground" : "text-foreground")}>{opt.label}</p>
                <p className={cn("text-sm mt-0.5", selected ? "text-primary-foreground/70" : "text-muted-foreground")}>{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

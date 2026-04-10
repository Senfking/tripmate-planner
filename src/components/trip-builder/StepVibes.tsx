import { cn } from "@/lib/utils";

type Props = {
  selected: string[];
  source: string | null;
  hasVibeBoard: boolean;
  onToggle: (v: string) => void;
};

const VIBES = [
  { emoji: "🏖️", label: "Beach" },
  { emoji: "🏛️", label: "Culture" },
  { emoji: "🍜", label: "Food" },
  { emoji: "🌙", label: "Nightlife" },
  { emoji: "⛰️", label: "Adventure" },
  { emoji: "🧘", label: "Relaxation" },
  { emoji: "🛍️", label: "Shopping" },
  { emoji: "📸", label: "Sightseeing" },
];

export function StepVibes({ selected, source, hasVibeBoard, onToggle }: Props) {
  return (
    <div className="flex flex-col h-full px-6 pt-12 sm:pt-16">
      <h2 className="text-2xl font-bold text-foreground mb-1">What's the vibe?</h2>
      {source && (
        <p className="text-xs text-muted-foreground mb-2">{source}</p>
      )}
      <p className="text-sm text-muted-foreground mb-5">Select all that apply</p>

      <div className="flex flex-wrap gap-2.5">
        {VIBES.map((v) => {
          const isOn = selected.includes(v.label);
          return (
            <button
              key={v.label}
              onClick={() => onToggle(v.label)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all active:scale-[0.95]",
                isOn
                  ? "text-primary-foreground border-transparent shadow-md"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              )}
              style={isOn ? { background: "var(--gradient-primary)" } : undefined}
            >
              <span>{v.emoji}</span>
              {v.label}
            </button>
          );
        })}
      </div>

      {hasVibeBoard && (
        <p className="text-xs text-muted-foreground mt-6 bg-muted/50 rounded-lg px-3 py-2">
          💡 We'll also use your group's Vibe Board preferences when generating the itinerary
        </p>
      )}
    </div>
  );
}

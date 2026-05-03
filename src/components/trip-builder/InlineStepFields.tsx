import { useState, useCallback, useRef } from "react";
import type { DateRange } from "react-day-picker";
import { MapPin, Sparkles, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/decisions/DateRangePicker";
import { cn } from "@/lib/utils";
import type { BudgetLevel, PaceLevel } from "./useTripBuilderDefaults";
import type { PremiumInputData } from "./PremiumTripInput";

type TravelParty = "solo" | "couple" | "friends" | "family" | "group";

const PARTY_OPTIONS: { key: TravelParty; label: string; emoji: string }[] = [
  { key: "solo", label: "Solo", emoji: "🧑" },
  { key: "couple", label: "Couple", emoji: "💑" },
  { key: "friends", label: "Friends", emoji: "👯" },
  { key: "family", label: "Family", emoji: "👨‍👩‍👧‍👦" },
  { key: "group", label: "Group", emoji: "👥" },
];

const BUDGET_OPTIONS: { key: BudgetLevel; label: string; symbol: string }[] = [
  { key: "budget", label: "Budget", symbol: "$" },
  { key: "mid-range", label: "Mid-range", symbol: "$$" },
  { key: "premium", label: "Premium", symbol: "$$$" },
  { key: "luxury" as BudgetLevel, label: "Luxury", symbol: "$$$$" },
];

const PACE_OPTIONS: { key: PaceLevel; label: string }[] = [
  { key: "relaxed", label: "Light" },
  { key: "balanced", label: "Balanced" },
  { key: "packed", label: "Active" },
];

const VIBE_OPTIONS = [
  { emoji: "🍜", label: "Food" },
  { emoji: "🏛️", label: "Culture" },
  { emoji: "⛰️", label: "Adventure" },
  { emoji: "🧘", label: "Relaxation" },
  { emoji: "🌙", label: "Nightlife" },
  { emoji: "🌿", label: "Nature" },
  { emoji: "💎", label: "Hidden gems" },
  { emoji: "📸", label: "Photography" },
];

const MAX_VIBES = 3;

type Props = {
  onGenerate: (data: PremiumInputData) => void;
};

/** Compact inline step-by-step builder rendered directly on /trips/new
 *  instead of opening a separate modal. Captures the same fields as
 *  PremiumTripInput but in a slimmer form factor. */
export function InlineStepFields({ onGenerate }: Props) {
  const [destination, setDestination] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [travelParty, setTravelParty] = useState<TravelParty | null>(null);
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel | null>(null);
  const [pace, setPace] = useState<PaceLevel | null>(null);
  const [vibes, setVibes] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const destRef = useRef<HTMLInputElement>(null);

  const destMissing = destination.trim().length === 0;
  const dateMissing = !dateRange?.from;
  const canGenerate = !destMissing && !dateMissing;

  const toggleVibe = useCallback((label: string) => {
    setVibes((prev) => {
      if (prev.includes(label)) return prev.filter((v) => v !== label);
      if (prev.length >= MAX_VIBES) return prev;
      return [...prev, label];
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canGenerate) {
      setShowErrors(true);
      destRef.current?.focus();
      return;
    }
    onGenerate({
      destination: destination.trim(),
      dateRange,
      travelParty,
      kidsAges: "",
      budgetLevel,
      pace,
      vibes,
      dealBreakers: "",
      freeText: "",
    });
  }, [canGenerate, destination, dateRange, travelParty, budgetLevel, pace, vibes, onGenerate]);

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5 animate-fade-in text-left">
      {/* Destination */}
      <div className="space-y-1.5">
        <label className="text-[12.5px] font-semibold text-foreground">
          Where to? <span className="text-[#0D9488]">*</span>
        </label>
        <div className="relative">
          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={destRef}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Bali"
            className={cn(
              "h-11 pl-10 rounded-xl bg-background text-[14px]",
              showErrors && destMissing
                ? "border-red-300 focus-visible:ring-red-200"
                : ""
            )}
            aria-invalid={showErrors && destMissing}
          />
        </div>
        {showErrors && destMissing && (
          <p className="text-[12px] text-red-500 pl-1">Required</p>
        )}
      </div>

      {/* Dates */}
      <div className="space-y-1.5">
        <label className="text-[12.5px] font-semibold text-foreground">
          When? <span className="text-[#0D9488]">*</span>
        </label>
        <div className={cn("rounded-xl", showErrors && dateMissing && "ring-1 ring-red-300")}>
          <DateRangePicker value={dateRange} onChange={setDateRange} className="w-full" />
        </div>
        {showErrors && dateMissing && (
          <p className="text-[12px] text-red-500 pl-1">Required</p>
        )}
      </div>

      {/* Who's going */}
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-foreground px-0.5">
          Who's going? <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PARTY_OPTIONS.map((opt) => {
            const selected = travelParty === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTravelParty(selected ? null : opt.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all active:scale-[0.96] border",
                  selected
                    ? "text-primary-foreground border-transparent shadow-sm"
                    : "bg-card text-foreground border-border hover:border-primary/40"
                )}
                style={selected ? { background: "var(--gradient-primary)" } : undefined}
              >
                <span>{opt.emoji}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Budget */}
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-foreground px-0.5">
          Budget <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {BUDGET_OPTIONS.map((opt) => {
            const selected = budgetLevel === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setBudgetLevel(selected ? null : opt.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all active:scale-[0.96] border",
                  selected
                    ? "text-primary-foreground border-transparent shadow-sm"
                    : "bg-card text-foreground border-border hover:border-primary/40"
                )}
                style={selected ? { background: "var(--gradient-primary)" } : undefined}
              >
                <span className="font-mono text-[11px] opacity-70">{opt.symbol}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pace */}
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-foreground px-0.5">
          Daily pace <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PACE_OPTIONS.map((opt) => {
            const selected = pace === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPace(selected ? null : opt.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[13px] font-medium transition-all active:scale-[0.96] border",
                  selected
                    ? "text-primary-foreground border-transparent shadow-sm"
                    : "bg-card text-foreground border-border hover:border-primary/40"
                )}
                style={selected ? { background: "var(--gradient-primary)" } : undefined}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Vibes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <label className="text-[12.5px] font-semibold text-foreground">
            Vibes <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <span className="text-[11px] text-muted-foreground">Pick up to 3</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VIBE_OPTIONS.map((opt) => {
            const selected = vibes.includes(opt.label);
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => toggleVibe(opt.label)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all active:scale-[0.96] border",
                  selected
                    ? "text-primary-foreground border-transparent shadow-sm"
                    : "bg-card text-foreground border-border hover:border-primary/40"
                )}
                style={selected ? { background: "var(--gradient-primary)" } : undefined}
              >
                <span>{opt.emoji}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate */}
      <button
        type="button"
        onClick={handleSubmit}
        className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-white font-semibold text-[15px] shadow-[0_4px_14px_-2px_hsl(var(--primary)/0.5)] transition-all hover:brightness-110 active:scale-[0.99]"
      >
        <Sparkles className="h-4 w-4" />
        Generate my trip
        <ArrowRight className="h-4 w-4" />
      </button>
      {!canGenerate && (
        <p className="text-[11.5px] text-muted-foreground text-center -mt-2">
          Add a destination and dates to continue
        </p>
      )}
    </div>
  );
}

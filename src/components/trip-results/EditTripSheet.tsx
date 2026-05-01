import { useMemo, useState } from "react";
import { X, Sparkles, Loader2, Wallet, Gauge, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AITripResult } from "./useResultsState";

interface Props {
  result: AITripResult;
  onRegenerate: (prompt: string) => void;
  onClose: () => void;
  loading?: boolean;
}

const SAMPLE_REFINEMENTS = [
  "Make it more food-focused — add iconic restaurants and food markets",
  "Lean into nightlife and live music in the evenings",
  "Slow it down — fewer activities per day, more downtime",
  "More hidden gems and local spots, fewer tourist hotspots",
  "Add more outdoor adventure and nature experiences",
  "Make day 2 more relaxing — a spa or beach afternoon",
  "Swap one day for a guided day trip outside the city",
  "Make it more romantic — sunset views, intimate dinners",
  "Family-friendly — activities that work for kids too",
  "Bump up the budget — premium stays and tasting menus",
];

type TierValue = "budget" | "mid-range" | "premium" | "luxury";

const BUDGET_TIERS: { value: TierValue; label: string; hint: string }[] = [
  { value: "budget", label: "Budget", hint: "Hostels, street food" },
  { value: "mid-range", label: "Mid-range", hint: "3★ hotels, casual dining" },
  { value: "premium", label: "Premium", hint: "4★ stays, nice restaurants" },
  { value: "luxury", label: "Luxury", hint: "5★ stays, fine dining" },
];

// Multipliers applied to the trip's existing daily budget (which already
// encodes destination cost-of-living) to derive a tier-appropriate target.
const TIER_MULTIPLIERS: Record<TierValue, number> = {
  budget: 0.5,
  "mid-range": 1.0,
  premium: 2.0,
  luxury: 4.0,
};

function computeTierBudget(baseDaily: number, baseTier: TierValue, targetTier: TierValue): number {
  if (!baseDaily || baseDaily <= 0) return 0;
  // Normalize: scale base down to a "mid-range equivalent" then up to target tier.
  const midEquivalent = baseDaily / TIER_MULTIPLIERS[baseTier];
  return Math.round(midEquivalent * TIER_MULTIPLIERS[targetTier]);
}

export function EditTripSheet({ result, onRegenerate, onClose, loading }: Props) {
  const initialTier = (result.budget_tier ?? "mid-range") as TierValue;
  const baseDaily = Number(result.daily_budget_estimate) || 0;

  const [tier, setTier] = useState<TierValue>(initialTier);
  const [dailyBudget, setDailyBudget] = useState<string>(
    baseDaily ? String(baseDaily) : ""
  );
  // Tracks the last auto-populated value so we can detect manual overrides.
  const [lastAutoValue, setLastAutoValue] = useState<string>(
    baseDaily ? String(baseDaily) : ""
  );
  const [refinement, setRefinement] = useState("");

  const handleTierChange = (next: TierValue) => {
    setTier(next);
    if (!baseDaily) return;
    // Only auto-populate when the user hasn't manually overridden the field.
    const isUntouched = dailyBudget.trim() === "" || dailyBudget === lastAutoValue;
    if (isUntouched) {
      const suggested = String(computeTierBudget(baseDaily, initialTier, next));
      setDailyBudget(suggested);
      setLastAutoValue(suggested);
    }
  };

  const handleDailyBudgetChange = (value: string) => {
    setDailyBudget(value);
    // Any keystroke that diverges from the last auto value counts as manual.
  };

  // Pick 3 sample suggestions to show as chips, rotating each open
  const samples = useMemo(() => {
    const shuffled = [...SAMPLE_REFINEMENTS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }, []);

  const currency = result.currency || "USD";
  const tierChanged = tier !== initialTier;
  const budgetChanged =
    Number(dailyBudget || 0) !== Number(result.daily_budget_estimate || 0) && dailyBudget.trim() !== "";

  const buildPrompt = () => {
    const parts: string[] = [];
    if (refinement.trim()) parts.push(refinement.trim());
    if (tierChanged) parts.push(`Change the overall budget tier to ${tier}.`);
    if (budgetChanged) parts.push(`Target a daily budget of about ${currency}${dailyBudget} per person.`);
    return parts.join(" ");
  };

  const canSubmit = (refinement.trim().length > 0 || tierChanged || budgetChanged) && !loading;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-card rounded-t-2xl sm:rounded-2xl border border-border p-5 pb-8 animate-slide-up shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Refine your plan
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Tweak the existing itinerary — change the vibe, swap focus, or adjust budget.
        </p>

        {/* Refinement prompt */}
        <div className="mb-5">
          <label className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide mb-2 block">
            What should change?
          </label>
          <textarea
            value={refinement}
            onChange={(e) => setRefinement(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            placeholder="e.g. Make it more focused on food, fewer museums, add a half-day trip outside the city…"
          />

          {/* Sample prompt chips */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {samples.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setRefinement(s)}
                className="px-2.5 py-1 rounded-full text-[11px] bg-accent/60 hover:bg-accent text-foreground/80 hover:text-foreground border border-border transition-colors text-left"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Budget tier */}
        <div className="mb-5">
          <label className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Gauge className="h-3 w-3" /> Budget tier
          </label>
          <div className="grid grid-cols-2 gap-2">
            {BUDGET_TIERS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTier(t.value)}
                className={cn(
                  "text-left px-3 py-2 rounded-xl border transition-all",
                  tier === t.value
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border bg-background hover:bg-accent/50"
                )}
              >
                <div className="text-[13px] font-semibold text-foreground">{t.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{t.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Daily budget */}
        <div className="mb-6">
          <label className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Wallet className="h-3 w-3" /> Daily budget per person
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">{currency}</span>
            <input
              type="number"
              inputMode="numeric"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value)}
              placeholder="e.g. 150"
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="text-xs text-muted-foreground">/ day</span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => onRegenerate(buildPrompt())}
            disabled={!canSubmit}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Regenerate plan
          </Button>
        </div>
      </div>
    </div>
  );
}

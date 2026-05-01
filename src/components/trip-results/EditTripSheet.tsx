import { useEffect, useMemo, useState } from "react";
import { X, Sparkles, Loader2, Wallet, Gauge, Wand2, ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
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

interface TierBudgets {
  budget: number;
  midRange: number;
  premium: number;
  luxury: number;
}

const TIER_TO_KEY: Record<TierValue, keyof TierBudgets> = {
  budget: "budget",
  "mid-range": "midRange",
  premium: "premium",
  luxury: "luxury",
};

function formatAmount(currency: string, amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

export function EditTripSheet({ result, onRegenerate, onClose, loading }: Props) {
  const initialTier = (result.budget_tier ?? "mid-range") as TierValue;
  const baseDaily = Number(result.daily_budget_estimate) || 0;
  const currency = result.currency || "USD";

  const [tier, setTier] = useState<TierValue>(initialTier);
  const [refinement, setRefinement] = useState("");

  // Disclosure state for the "set exact daily target" power-user input.
  const [overrideOpen, setOverrideOpen] = useState(false);
  // The manual override value. Empty string = no override active; tier default
  // is the source of truth. A non-empty value here always wins over the tier
  // default for both display and prompt construction.
  const [manualBudget, setManualBudget] = useState<string>("");

  // Destination-aware tier defaults from the AI gateway. Null until loaded;
  // remains null on failure so the auto-populate behavior simply doesn't fire.
  const [tierBudgets, setTierBudgets] = useState<TierBudgets | null>(null);
  const [budgetsLoading, setBudgetsLoading] = useState(true);

  // Compose a destination string from the trip — first city covers most cases;
  // multi-stop trips fall back to a comma-joined list (capped to 3 to keep the
  // prompt focused).
  const destinationLabel = useMemo(() => {
    const names = (result.destinations ?? [])
      .map((d) => d?.name)
      .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
    if (names.length === 0) return result.trip_title || "";
    return names.slice(0, 3).join(", ");
  }, [result.destinations, result.trip_title]);

  const numDays = useMemo(() => {
    return (result.destinations ?? []).reduce((acc, d) => acc + (d?.days?.length || 0), 0) || 1;
  }, [result.destinations]);

  // Fetch tier defaults once on mount.
  useEffect(() => {
    let cancelled = false;
    if (!destinationLabel) {
      setBudgetsLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-tier-budgets", {
          body: { destination: destinationLabel, currency, numDays },
        });
        if (cancelled) return;
        if (error || !data?.success || !data?.tiers) {
          setTierBudgets(null);
        } else {
          setTierBudgets(data.tiers as TierBudgets);
        }
      } catch {
        if (!cancelled) setTierBudgets(null);
      } finally {
        if (!cancelled) setBudgetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destinationLabel, currency, numDays]);

  const tierDefaultAmount = tierBudgets ? tierBudgets[TIER_TO_KEY[tier]] : 0;
  const tierCaption = tierBudgets ? `About ${formatAmount(currency, tierDefaultAmount)}/day` : "";

  // Single source of truth for the budget signal sent to the LLM.
  const hasManualOverride = manualBudget.trim() !== "" && Number(manualBudget) > 0;
  const effectiveDailyAmount = hasManualOverride
    ? Number(manualBudget)
    : tierDefaultAmount;

  const handleOpenOverride = () => {
    setOverrideOpen(true);
    // Pre-fill with the current tier default so the user has a starting point.
    if (manualBudget.trim() === "" && tierDefaultAmount > 0) {
      setManualBudget(String(tierDefaultAmount));
    }
  };

  const handleResetOverride = () => {
    setManualBudget("");
    setOverrideOpen(false);
  };

  const tierChanged = tier !== initialTier;
  const budgetChanged =
    effectiveDailyAmount > 0 &&
    Math.round(effectiveDailyAmount) !== Math.round(baseDaily);

  const buildPrompt = () => {
    const parts: string[] = [];
    if (refinement.trim()) parts.push(refinement.trim());
    // Send ONE coherent budget signal. Tier is always context for vibe/style;
    // the numeric amount (manual override OR tier default) is the target.
    if (tierChanged || budgetChanged) {
      const amountStr = effectiveDailyAmount > 0
        ? `targeting about ${currency}${Math.round(effectiveDailyAmount)} per person per day`
        : "";
      const tierStr = tierChanged
        ? `Shift the trip to a ${tier} feel (style, accommodation class, dining tone)`
        : `Keep the ${tier} feel`;
      parts.push([tierStr, amountStr].filter(Boolean).join(" ") + ".");
    }
    return parts.join(" ");
  };

  // Pick 3 sample suggestions to show as chips, rotating each open
  const samples = useMemo(() => {
    const shuffled = [...SAMPLE_REFINEMENTS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }, []);

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
                onClick={() => handleTierChange(t.value)}
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

        {/* Daily budget — fine-tune override */}
        <div className="mb-6">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Wallet className="h-3 w-3" /> Adjust daily target (optional)
          </label>
          {budgetsLoading ? (
            <div className="h-10 rounded-xl border border-border bg-muted/40 animate-pulse flex items-center px-3">
              <span className="text-xs text-muted-foreground">
                Estimating typical {currency} spend for {destinationLabel || "your trip"}…
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-muted-foreground">{currency}</span>
              <input
                type="number"
                inputMode="numeric"
                value={dailyBudget}
                onChange={(e) => handleDailyBudgetChange(e.target.value)}
                placeholder={tierBudgets ? String(tierBudgets[TIER_TO_KEY[tier]]) : "e.g. 150"}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-xs text-muted-foreground">/ day</span>
            </div>
          )}
          {!budgetsLoading && !tierBudgets && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Couldn't load destination defaults — enter a target manually if you want to adjust.
            </p>
          )}
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

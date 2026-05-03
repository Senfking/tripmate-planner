import { useState, useCallback, useMemo, useRef } from "react";
import type { DateRange } from "react-day-picker";
import {
  MapPin,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Info,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/decisions/DateRangePicker";
import { cn } from "@/lib/utils";
import type { BudgetLevel, PaceLevel } from "./useTripBuilderDefaults";

/* ─── Types ───────────────────────────────────────── */

type TravelParty = "solo" | "couple" | "friends" | "family" | "group";

export type PremiumInputData = {
  destination: string;
  dateRange: DateRange | undefined;
  travelParty: TravelParty | null;
  kidsAges: string;
  budgetLevel: BudgetLevel | null;
  pace: PaceLevel | null;
  vibes: string[];
  dealBreakers: string;
  freeText: string;
};

type Props = {
  onGenerate: (data: PremiumInputData) => void;
  onStartBlank?: () => void;
  initialDestination?: string;
  /** Pre-fills the free-text prompt field. Used by the Hero handoff so a
   *  prompt typed on the landing or trip-builder hero pre-populates the
   *  builder's textarea. The user still clicks Generate themselves — we
   *  do not auto-submit. */
  initialFreeText?: string;
  /** Full prefill — vibes/budget/pace/party. Used when opened from a
   *  template so the user sees their template defaults applied. */
  initialData?: Partial<PremiumInputData>;
  /** When true, "Where to?" renders as a static, non-editable label. */
  lockedDestination?: boolean;
  /** Override the hero title (default: "Plan your trip"). */
  title?: string;
  /** Override the hero subtitle. */
  subtitle?: string;
  /** Hide the free-text prompt + "or build step by step" divider. */
  hideFreeText?: boolean;
  /** Hide the entire hero block (title/subtitle/free-text). Used when the
   *  form is rendered below another hero (e.g. inline on /trips/new). */
  hideHero?: boolean;
  /** Optional badge rendered under the hero title — shows the template
   *  origin with a small thumbnail. */
  templateBadge?: { label: string; thumbnailUrl?: string | null };
  /** When true, render the Generate CTA inline at the bottom of the form
   *  (instead of fixed-positioned). Use when the form is inlined inside a
   *  scrollable host page rather than rendered as a full-screen modal. */
  inline?: boolean;
};

/* ─── Constants ───────────────────────────────────── */

const PARTY_OPTIONS: { key: TravelParty; label: string; emoji: string }[] = [
  { key: "solo", label: "Solo", emoji: "🧍" },
  { key: "couple", label: "Couple", emoji: "💑" },
  { key: "friends", label: "Friends", emoji: "👯" },
  { key: "family", label: "Family", emoji: "👨‍👩‍👧" },
  { key: "group", label: "Group", emoji: "👥" },
];

const BUDGET_OPTIONS: { key: BudgetLevel; label: string; symbol: string }[] = [
  { key: "budget", label: "Budget", symbol: "$" },
  { key: "mid-range", label: "Mid-range", symbol: "$$" },
  { key: "premium", label: "Premium", symbol: "$$$" },
  { key: "luxury" as BudgetLevel, label: "Luxury", symbol: "$$$$" },
];

const PACE_OPTIONS: { key: PaceLevel; label: string; emoji: string; tag: string; desc: string; intensity: 1 | 2 | 3 }[] = [
  { key: "relaxed", label: "Light", emoji: "🍃", tag: "lots of free time", desc: "1 activity + dinner. Most of the day is yours to wander.", intensity: 1 },
  { key: "balanced", label: "Balanced", emoji: "⚖️", tag: "a few highlights per day", desc: "2 activities + lunch and dinner — one anchor in the morning, one in the afternoon.", intensity: 2 },
  { key: "packed", label: "Active", emoji: "⚡", tag: "morning to night", desc: "3 activities + breakfast, lunch, dinner — morning, afternoon, and evening.", intensity: 3 },
];

const VIBE_OPTIONS: { label: string; emoji: string }[] = [
  { label: "Food", emoji: "🍜" },
  { label: "Culture", emoji: "🏛️" },
  { label: "Adventure", emoji: "🥾" },
  { label: "Relaxation", emoji: "🧘" },
  { label: "Nightlife", emoji: "🌃" },
  { label: "Nature", emoji: "🌿" },
  { label: "Hidden gems", emoji: "💎" },
  { label: "Photography", emoji: "📸" },
];

const MAX_VIBES = 3;

/* ─── Component ───────────────────────────────────── */

export function PremiumTripInput({
  onGenerate,
  onStartBlank,
  initialDestination,
  initialFreeText,
  initialData,
  lockedDestination,
  title,
  subtitle,
  hideFreeText,
  hideHero,
  templateBadge,
  inline,
}: Props) {
  const [destination, setDestination] = useState(
    initialData?.destination ?? initialDestination ?? ""
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>(initialData?.dateRange);
  const [travelParty, setTravelParty] = useState<TravelParty | null>(
    initialData?.travelParty ?? null
  );
  const [kidsAges, setKidsAges] = useState(initialData?.kidsAges ?? "");
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel | null>(
    initialData?.budgetLevel ?? null
  );
  const [pace, setPace] = useState<PaceLevel | null>(initialData?.pace ?? null);
  const [vibes, setVibes] = useState<string[]>(initialData?.vibes ?? []);
  const [vibeWarning, setVibeWarning] = useState(false);
  const [dealBreakers, setDealBreakers] = useState(initialData?.dealBreakers ?? "");
  const [freeText, setFreeText] = useState(initialData?.freeText ?? initialFreeText ?? "");
  // (deal-breakers is now always visible — no collapsible state needed)

  const [showErrors, setShowErrors] = useState(false);
  const [paceInfoOpen, setPaceInfoOpen] = useState(false);

  const destRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);

  const destMissing = destination.trim().length === 0;
  const dateMissing = !dateRange?.from;
  const canGenerate = !destMissing && !dateMissing;

  // Heuristic: warn (don't block) when the destination string suggests
  // multiple locations. We check for " and ", "+", "/" or 2+ commas
  // (regional names like "South Tyrol, Italy" have a single comma).
  const looksMultiDestination = useMemo(() => {
    const t = destination.trim();
    if (t.length < 3) return false;
    if (/\s+and\s+/i.test(t)) return true;
    if (/[+/]/.test(t)) return true;
    const commaCount = (t.match(/,/g) || []).length;
    if (commaCount >= 2) return true;
    return false;
  }, [destination]);

  const toggleVibe = useCallback((label: string) => {
    setVibes((prev) => {
      if (prev.includes(label)) return prev.filter((v) => v !== label);
      if (prev.length >= MAX_VIBES) {
        setVibeWarning(true);
        setTimeout(() => setVibeWarning(false), 2000);
        return prev;
      }
      return [...prev, label];
    });
  }, []);

  const handleGenerate = useCallback(() => {
    if (!canGenerate) {
      setShowErrors(true);
      const target = destMissing ? destRef.current : dateRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onGenerate({
      destination: destination.trim(),
      dateRange,
      travelParty,
      kidsAges: kidsAges.trim(),
      budgetLevel,
      pace,
      vibes,
      dealBreakers: dealBreakers.trim(),
      freeText: freeText.trim(),
    });
  }, [destination, dateRange, travelParty, kidsAges, budgetLevel, pace, vibes, dealBreakers, freeText, canGenerate, destMissing, onGenerate]);

  const heroTitle = title ?? "Plan your trip";
  const heroSubtitle =
    subtitle ?? "Describe your dream trip — or fill in the form below";

  return (
    <div className={cn(
      "w-full max-w-lg mx-auto px-4",
      inline ? "pb-6" : "pb-[calc(env(safe-area-inset-bottom,0px)+12rem)]"
    )}>
      {/* ── Hero ── */}
      {!hideHero && (
        <div className="relative pt-8 pb-6 -mx-4 px-4 mb-5 bg-gradient-to-b from-primary/5 via-primary/[0.02] to-transparent">
          <div className="text-center mb-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4 bg-primary/10 border border-primary/30">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary tracking-wider uppercase">Junto AI</span>
            </div>
            <h1 className="text-[28px] sm:text-3xl font-bold text-foreground tracking-tight leading-[1.15]">
              {heroTitle}
            </h1>
            <p className="text-muted-foreground text-sm mt-2 px-2">
              {heroSubtitle}
            </p>
            {templateBadge && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/8 border border-primary/20 pl-1 pr-3 py-1">
                {templateBadge.thumbnailUrl ? (
                  <img
                    src={templateBadge.thumbnailUrl}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover ring-1 ring-primary/20"
                  />
                ) : (
                  <span className="h-6 w-6 rounded-full bg-primary/15" />
                )}
                <span className="text-[11px] font-medium text-primary tracking-wide">
                  {templateBadge.label}
                </span>
              </div>
            )}
          </div>

          {!hideFreeText && (
            <>
              <div className="rounded-2xl bg-card/80 backdrop-blur border border-border shadow-sm p-3">
                <Textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder='e.g. "10 days in Japan with my partner — food, temples, no early mornings"'
                  rows={3}
                  className="rounded-xl bg-background border-border resize-none text-[14px] placeholder:text-[14px] focus-visible:ring-primary/40 focus-visible:ring-offset-0"
                />
                {freeText.trim().length > 0 && (
                  <p className="text-[11px] text-primary/80 mt-2 px-1 flex items-center gap-1 animate-fade-in">
                    <Sparkles className="h-3 w-3" />
                    We'll prioritize this over the form below
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 mt-6 px-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  Or build it step by step
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Required fields card ── */}
      <div className="rounded-2xl bg-card border border-border shadow-sm p-5 space-y-4">
        {/* Destination */}
        <div ref={destRef} className="space-y-1.5 scroll-mt-24">
          <label className="text-[13px] font-semibold text-foreground">Where to? *</label>
          {lockedDestination ? (
            <div
              className="relative h-12 pl-10 pr-3 rounded-xl bg-muted/50 border border-border flex items-center"
              aria-readonly="true"
            >
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" />
              <span className="text-[14px] font-semibold text-foreground truncate">
                {destination}
              </span>
              <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                From template
              </span>
            </div>
          ) : (
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Bali"
                className={cn(
                  "h-12 pl-10 rounded-xl bg-background text-[14px] placeholder:text-[14px]",
                  showErrors && destMissing
                    ? "border-red-300 focus-visible:ring-red-200"
                    : "border-border"
                )}
                aria-invalid={showErrors && destMissing}
                autoFocus
              />
            </div>
          )}
          {showErrors && destMissing && (
            <p className="text-[12px] text-red-500 pl-1 animate-fade-in">Required</p>
          )}
          {!lockedDestination && looksMultiDestination && (
            <p className="text-[12px] text-muted-foreground pl-1 leading-snug animate-fade-in">
              We currently support single-destination trips. Try one city at a time for best results.
            </p>
          )}
        </div>

        {/* Date range */}
        <div ref={dateRef} className="space-y-1.5 scroll-mt-24">
          <label className="text-[13px] font-semibold text-foreground">When? *</label>
          <div className={cn(
            "rounded-xl",
            showErrors && dateMissing && "ring-1 ring-red-300"
          )}>
            <DateRangePicker value={dateRange} onChange={setDateRange} className="w-full" />
          </div>
          {showErrors && dateMissing && (
            <p className="text-[12px] text-red-500 pl-1 animate-fade-in">Required</p>
          )}
        </div>
      </div>

      {/* ── Quick picks (optional) ── */}
      <div className="mt-5 space-y-5">
        {/* Travel party */}
        <div className="space-y-2">
          <label className="text-[13px] font-semibold text-foreground px-1">Who's going?</label>
          <div className="flex flex-wrap gap-2">
            {PARTY_OPTIONS.map(({ key, label, emoji }) => {
              const selected = travelParty === key;
              return (
                <button
                  key={key}
                  onClick={() => setTravelParty(selected ? null : key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all active:scale-[0.96]",
                    "border",
                    selected
                      ? "text-primary-foreground border-transparent shadow-md"
                      : "bg-card text-foreground border-border hover:border-primary/40"
                  )}
                  style={selected ? { background: "var(--gradient-primary)" } : undefined}
                >
                  <span className="text-base leading-none" aria-hidden>{emoji}</span>
                  {label}
                </button>
              );
            })}
          </div>

          {/* Family → kids ages */}
          {travelParty === "family" && (
            <div className="pl-1 pt-1 animate-fade-in">
              <label className="text-xs text-muted-foreground">Kids' ages?</label>
              <Input
                value={kidsAges}
                onChange={(e) => setKidsAges(e.target.value)}
                placeholder="e.g. 4, 8, 12"
                className="h-9 mt-1 rounded-lg text-sm max-w-[200px]"
              />
            </div>
          )}

          {/* Group → helper text */}
          {travelParty === "group" && (
            <p className="text-xs text-muted-foreground pl-1 pt-1 animate-fade-in">
              We'll help with group preferences after — for now, plan for the host's vibe
            </p>
          )}
        </div>

        {/* Budget */}
        <div className="space-y-2">
          <label className="text-[13px] font-semibold text-foreground px-1">Budget</label>
          <div className="flex flex-wrap gap-2">
            {BUDGET_OPTIONS.map((opt) => {
              const selected = budgetLevel === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setBudgetLevel(selected ? null : opt.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all active:scale-[0.96]",
                    "border",
                    selected
                      ? "text-primary-foreground border-transparent shadow-md"
                      : "bg-card text-foreground border-border hover:border-primary/40"
                  )}
                  style={selected ? { background: "var(--gradient-primary)" } : undefined}
                >
                  <span className="font-mono text-xs opacity-70">{opt.symbol}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pace */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <label className="text-[13px] font-semibold text-foreground">Daily pace</label>
              <button
                type="button"
                onClick={() => setPaceInfoOpen((v) => !v)}
                aria-label="What does each pace mean?"
                aria-expanded={paceInfoOpen}
                className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors active:scale-95"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">How busy each day feels</span>
          </div>
          {paceInfoOpen && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2 animate-fade-in">
              {PACE_OPTIONS.map((opt) => (
                <div key={opt.key} className="flex items-start gap-2.5">
                  <span className="flex items-end gap-0.5 mt-1.5 shrink-0" aria-hidden="true">
                    {[1, 2, 3].map((i) => {
                      const active = i <= opt.intensity;
                      const heights = ["h-1.5", "h-2.5", "h-3.5"];
                      return (
                        <span
                          key={i}
                          className={cn(
                            "w-1 rounded-full",
                            heights[i - 1],
                            active ? "bg-primary" : "bg-muted-foreground/30"
                          )}
                        />
                      );
                    })}
                  </span>
                  <p className="text-xs text-foreground leading-snug">
                    <span className="font-semibold">{opt.label}</span>
                    <span className="text-muted-foreground"> — {opt.desc}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {PACE_OPTIONS.map((opt) => {
              const selected = pace === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setPace(selected ? null : opt.key)}
                  aria-pressed={selected}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium transition-all active:scale-[0.96]",
                    "border",
                    selected
                      ? "text-primary-foreground border-transparent shadow-md"
                      : "bg-card text-foreground border-border hover:border-primary/40"
                  )}
                  style={selected ? { background: "var(--gradient-primary)" } : undefined}
                  title={opt.tag}
                >
                  <span className="text-base leading-none" aria-hidden>{opt.emoji}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
          {pace && (
            <p className="text-xs text-muted-foreground pl-1 animate-fade-in">
              {PACE_OPTIONS.find((o) => o.key === pace)?.tag}
            </p>
          )}
        </div>

        {/* Vibes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <label className="text-[13px] font-semibold text-foreground">Vibes</label>
            <span className="text-xs text-muted-foreground">Pick up to 3</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {VIBE_OPTIONS.map(({ label, emoji }) => {
              const selected = vibes.includes(label);
              return (
                <button
                  key={label}
                  onClick={() => toggleVibe(label)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all active:scale-[0.96]",
                    "border",
                    selected
                      ? "text-primary-foreground border-transparent shadow-md"
                      : "bg-card text-foreground border-border hover:border-primary/40"
                  )}
                  style={selected ? { background: "var(--gradient-primary)" } : undefined}
                >
                  <span className="text-base leading-none" aria-hidden>{emoji}</span>
                  {label}
                </button>
              );
            })}
          </div>
          {vibeWarning && (
            <p className="text-xs text-amber-600 flex items-center gap-1 pl-1 animate-fade-in">
              <AlertCircle className="h-3 w-3" />
              Max 3 vibes — deselect one first
            </p>
          )}
        </div>
      </div>

      {/* ── Deal-breakers (always visible) ── */}
      <div className="mt-5 space-y-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-foreground px-1">
          Anything to avoid?
          <span className="text-xs font-normal text-muted-foreground/70">(optional)</span>
        </label>
        <p className="text-xs text-primary/80 italic px-1">This is the question that makes the difference</p>
        <Textarea
          value={dealBreakers}
          onChange={(e) => setDealBreakers(e.target.value)}
          placeholder="e.g. no tourist traps, no early mornings, no seafood, nothing requiring 3-month-ahead reservations"
          rows={3}
          className="rounded-xl bg-card border-border resize-none"
        />
      </div>

      {/* ── Generate CTA (fixed bottom) ── */}
      <div className="fixed bottom-0 inset-x-0 bg-background/90 backdrop-blur-lg border-t border-border z-10">
        <div className="max-w-lg mx-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 space-y-2">
          <Button
            onClick={handleGenerate}
            className="w-full h-12 rounded-xl font-semibold text-[15px] text-primary-foreground gap-2"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-4 w-4" />
            Generate my trip
          </Button>
          {!canGenerate && (
            <p className="text-[11px] text-muted-foreground text-center -mt-0.5">
              Add a destination and dates to continue
            </p>
          )}
          {onStartBlank && (
            <button
              type="button"
              onClick={onStartBlank}
              className="w-full inline-flex items-center justify-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Or start without an itinerary
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

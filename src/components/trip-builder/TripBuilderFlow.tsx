import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { DateRange } from "react-day-picker";
import { parseISO } from "date-fns";
import { ArrowLeft, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { useTripBuilderDefaults, type BudgetLevel, type PaceLevel } from "./useTripBuilderDefaults";
import { parseFreeText } from "./parseFreeText";
import { StepEntryChoice } from "./StepEntryChoice";
import { StepDestination } from "./StepDestination";
import { StepDates } from "./StepDates";
import { StepBudget } from "./StepBudget";
import { StepVibes } from "./StepVibes";
import { StepPace } from "./StepPace";
import { StepExtras } from "./StepExtras";
import { GeneratingScreen } from "./GeneratingScreen";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import type { AITripResult } from "@/components/trip-results/useResultsState";

type Props = {
  tripId: string;
  onClose: () => void;
  onSuccess?: (data: any) => void;
};

/**
 * Normalizes the raw Edge Function response into a valid AITripResult.
 *
 * The edge function returns `{ success: true, ...itinerary }` — the itinerary
 * fields are spread at the top level. The AI-generated JSON *should* match the
 * AITripResult schema, but since an LLM produces it, fields may be missing,
 * named differently, or have unexpected types. This function provides safe
 * defaults so TripResultsView never crashes on undefined property access.
 */
function normalizeAIResponse(raw: Record<string, any>): AITripResult {
  // Destinations: the core data — must be an array
  const destinations = Array.isArray(raw.destinations) ? raw.destinations : [];

  // Ensure every destination has the required nested structure
  const safeDestinations = destinations.map((dest: any) => ({
    name: dest?.name || "Unknown destination",
    start_date: dest?.start_date || "",
    end_date: dest?.end_date || dest?.start_date || "",
    intro: dest?.intro || "",
    days: Array.isArray(dest?.days)
      ? dest.days.map((day: any) => ({
          date: day?.date || "",
          day_number: day?.day_number || 0,
          theme: day?.theme || "",
          activities: Array.isArray(day?.activities) ? day.activities : [],
        }))
      : [],
    accommodation: dest?.accommodation || undefined,
    transport_to_next: dest?.transport_to_next || undefined,
  }));

  // map_center: the AI might omit it, use `center`, or use lat/longitude keys
  let mapCenter = raw.map_center;
  if (!mapCenter || typeof mapCenter.lat !== "number") {
    // Fallback: try to derive from first activity with coordinates
    for (const dest of safeDestinations) {
      for (const day of dest.days) {
        for (const act of day.activities) {
          if (act.latitude != null && act.longitude != null) {
            mapCenter = { lat: act.latitude, lng: act.longitude };
            break;
          }
        }
        if (mapCenter?.lat != null) break;
      }
      if (mapCenter?.lat != null) break;
    }
  }
  // Final fallback
  if (!mapCenter || typeof mapCenter.lat !== "number") {
    mapCenter = { lat: 0, lng: 0 };
  }

  return {
    trip_title: raw.trip_title || raw.title || "Your Trip",
    trip_summary: raw.trip_summary || raw.summary || "",
    destinations: safeDestinations,
    map_center: mapCenter,
    map_zoom: typeof raw.map_zoom === "number" ? raw.map_zoom : 6,
    daily_budget_estimate: typeof raw.daily_budget_estimate === "number" ? raw.daily_budget_estimate : 0,
    currency: raw.currency || "USD",
    packing_suggestions: Array.isArray(raw.packing_suggestions) ? raw.packing_suggestions : [],
    total_activities: typeof raw.total_activities === "number" ? raw.total_activities : 0,
  };
}

type Answers = {
  destination: string;
  surpriseMe: boolean;
  dateRange: DateRange | undefined;
  flexible: boolean;
  flexibleDuration: number;
  budgetLevel: BudgetLevel;
  vibes: string[];
  pace: PaceLevel;
  dietary: string[];
  notes: string;
  freeText: string;
};

const TOTAL_STEPS = 7; // 0=entry, 1=dest, 2=dates, 3=budget, 4=vibes, 5=pace, 6=extras

export function TripBuilderFlow({ tripId, onClose, onSuccess }: Props) {
  const defaults = useTripBuilderDefaults(tripId);
  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [results, setResults] = useState<AITripResult | null>(null);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const pendingGenerate = useRef(false);

  const [answers, setAnswers] = useState<Answers>({
    destination: "",
    surpriseMe: false,
    dateRange: undefined,
    flexible: false,
    flexibleDuration: 7,
    budgetLevel: "mid-range",
    vibes: [],
    pace: "balanced",
    dietary: [],
    notes: "",
    freeText: "",
  });

  // Apply defaults once loaded
  useEffect(() => {
    if (defaults.isLoading || defaultsApplied) return;
    setDefaultsApplied(true);

    const updates: Partial<Answers> = {};

    if (defaults.destination) updates.destination = defaults.destination;
    if (defaults.startDate) {
      updates.dateRange = {
        from: parseISO(defaults.startDate),
        to: defaults.endDate ? parseISO(defaults.endDate) : undefined,
      };
    }
    if (defaults.budgetLevel) updates.budgetLevel = defaults.budgetLevel;
    if (defaults.vibes.length > 0) updates.vibes = [...defaults.vibes];
    if (defaults.pace) updates.pace = defaults.pace;

    setAnswers((prev) => ({ ...prev, ...updates }));
  }, [defaults.isLoading, defaultsApplied, defaults]);

  const hasVibeBoard = useMemo(() => {
    return !!defaults.vibeSource;
  }, [defaults.vibeSource]);

  const update = useCallback(<K extends keyof Answers>(key: K, val: Answers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: val }));
  }, []);

  // Determine which steps still need input given current answers
  const findFirstIncompleteStep = useCallback((ans: Answers): number => {
    // Step 1: destination
    if (!ans.surpriseMe && !ans.destination.trim()) return 1;
    // Step 2: dates
    if (!ans.flexible && !ans.dateRange?.from) return 2;
    // Steps 3-6 always have defaults, so skip to generate
    return -1; // All required info present
  }, []);

  const handleFreeText = useCallback((text: string) => {
    const parsed = parseFreeText(text);
    const updates: Partial<Answers> = { freeText: text, notes: text };

    if (parsed.destination && !answers.destination) updates.destination = parsed.destination;
    if (parsed.budgetLevel) updates.budgetLevel = parsed.budgetLevel;
    if (parsed.vibes.length > 0) updates.vibes = [...new Set([...answers.vibes, ...parsed.vibes])];
    if (parsed.dietary.length > 0) updates.dietary = [...new Set([...answers.dietary, ...parsed.dietary])];
    if (parsed.durationDays) {
      updates.flexible = true;
      updates.flexibleDuration = parsed.durationDays;
    }

    const merged = { ...answers, ...updates };
    setAnswers(merged as Answers);

    // Skip to first step that still needs input, or generate directly
    const nextStep = findFirstIncompleteStep(merged as Answers);
    if (nextStep === -1) {
      // All required info filled — flag for auto-generation
      pendingGenerate.current = true;
    } else {
      setStep(nextStep);
    }
  }, [answers, findFirstIncompleteStep]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);

    try {
      const payload = {
        trip_id: tripId,
        destination: answers.surpriseMe ? null : answers.destination,
        surprise_me: answers.surpriseMe,
        start_date: answers.flexible ? null : (answers.dateRange?.from?.toISOString().split("T")[0] || null),
        end_date: answers.flexible ? null : (answers.dateRange?.to?.toISOString().split("T")[0] || null),
        flexible: answers.flexible,
        duration_days: answers.flexible ? answers.flexibleDuration : null,
        budget_level: answers.budgetLevel,
        vibes: answers.vibes,
        pace: answers.pace,
        dietary: answers.dietary,
        notes: answers.notes,
        free_text: answers.freeText,
        group_size: defaults.groupSize || 1,
      };

      const { data, error } = await supabase.functions.invoke("generate-trip-itinerary", {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data) throw new Error("No data returned from generate-trip-itinerary");

      const normalized = normalizeAIResponse(data);

      setResults(normalized);
      onSuccess?.(normalized);
    } catch (err: any) {
      console.error("[TripBuilder] Generation failed:", err);
      setGenError(err?.message || "Failed to generate itinerary. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [tripId, answers, defaults.groupSize, onSuccess, onClose]);

  // Auto-generate after free text fills all required fields
  useEffect(() => {
    if (pendingGenerate.current && !generating) {
      pendingGenerate.current = false;
      handleGenerate();
    }
  }, [answers, generating, handleGenerate]);

  const toggleVibe = useCallback((v: string) => {
    setAnswers((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(v) ? prev.vibes.filter((x) => x !== v) : [...prev.vibes, v],
    }));
  }, []);

  const toggleDietary = useCallback((v: string) => {
    setAnswers((prev) => {
      if (v === "No restrictions") return { ...prev, dietary: prev.dietary.includes(v) ? [] : [v] };
      const next = prev.dietary.filter((d) => d !== "No restrictions");
      return { ...prev, dietary: next.includes(v) ? next.filter((x) => x !== v) : [...next, v] };
    });
  }, []);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 1: return answers.surpriseMe || answers.destination.trim().length > 0;
      case 2: return answers.flexible || !!answers.dateRange?.from;
      default: return true;
    }
  }, [step, answers]);

  const isLastStep = step === TOTAL_STEPS - 1;

  if (results) {
    return (
      <TripResultsView
        tripId={tripId}
        result={results}
        onClose={onClose}
        onRegenerate={() => {
          setResults(null);
          handleGenerate();
        }}
      />
    );
  }

  if (generating || genError) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <GeneratingScreen
          destination={answers.surpriseMe ? "" : answers.destination}
          error={genError}
          onRetry={handleGenerate}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2 max-w-2xl mx-auto w-full">
        {step > 0 ? (
          <button onClick={() => setStep((s) => s - 1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
        ) : (
          <div className="w-9" />
        )}

        {/* Progress dots */}
        {step > 0 && (
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS - 1 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i < step ? "w-6" : "w-1.5",
                  i < step ? "opacity-100" : "opacity-30"
                )}
                style={i < step ? { background: "var(--gradient-primary)" } : { background: "hsl(var(--foreground))" }}
              />
            ))}
          </div>
        )}

        <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-muted transition-colors">
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto flex justify-center">
        <div className="w-full max-w-2xl">
        {step === 0 && (
          <StepEntryChoice
            onStepByStep={() => setStep(1)}
            onFreeText={handleFreeText}
          />
        )}
        {step === 1 && (
          <StepDestination
            value={answers.destination}
            source={defaults.destinationSource}
            surpriseMe={answers.surpriseMe}
            onChange={(v) => update("destination", v)}
            onSurpriseMe={(v) => update("surpriseMe", v)}
          />
        )}
        {step === 2 && (
          <StepDates
            dateRange={answers.dateRange}
            source={defaults.dateSource}
            flexible={answers.flexible}
            flexibleDuration={answers.flexibleDuration}
            onDateChange={(r) => update("dateRange", r)}
            onFlexibleChange={(v) => update("flexible", v)}
            onDurationChange={(d) => update("flexibleDuration", d)}
          />
        )}
        {step === 3 && (
          <StepBudget
            value={answers.budgetLevel}
            source={defaults.budgetSource}
            onChange={(v) => update("budgetLevel", v)}
          />
        )}
        {step === 4 && (
          <StepVibes
            selected={answers.vibes}
            source={defaults.vibeSource}
            hasVibeBoard={hasVibeBoard}
            onToggle={toggleVibe}
          />
        )}
        {step === 5 && (
          <StepPace
            value={answers.pace}
            source={defaults.paceSource}
            onChange={(v) => update("pace", v)}
          />
        )}
        {step === 6 && (
          <StepExtras
            dietary={answers.dietary}
            notes={answers.notes}
            onToggleDietary={toggleDietary}
            onNotesChange={(v) => update("notes", v)}
          />
        )}
        </div>
      </div>

      {/* Footer */}
      {step > 0 && (
        <div className="border-t border-border bg-background flex justify-center">
          <div className="w-full max-w-2xl px-6 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3">
            {isLastStep ? (
              <div className="flex gap-3 sm:justify-end">
                <Button
                  variant="outline"
                  className="flex-1 sm:flex-none sm:px-8 h-12 rounded-xl"
                  onClick={() => setStep(step + 1 > 6 ? 6 : step - 1)}
                >
                  Back
                </Button>
                <Button
                  className="flex-1 sm:flex-none sm:px-8 h-12 rounded-xl font-semibold text-primary-foreground text-[15px] gap-2"
                  style={{ background: "var(--gradient-primary)" }}
                  onClick={handleGenerate}
                >
                  <Sparkles className="h-4 w-4" />
                  Generate my trip
                </Button>
              </div>
            ) : (
              <div className="sm:flex sm:justify-end">
                <Button
                  className="w-full sm:w-auto sm:px-12 h-12 rounded-xl font-semibold text-primary-foreground text-[15px]"
                  style={{ background: "var(--gradient-primary)" }}
                  disabled={!canAdvance}
                  onClick={() => setStep((s) => s + 1)}
                >
                  {step === 6 ? (
                    <><Sparkles className="h-4 w-4 mr-1.5" />Generate my trip</>
                  ) : "Continue"}
                </Button>
              </div>
            )}
            {step === 6 && (
              <button
                onClick={handleGenerate}
                className="w-full sm:w-auto text-center text-sm text-muted-foreground mt-2"
              >
                Skip extras
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

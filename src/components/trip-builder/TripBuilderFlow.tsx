import { useState, useEffect, useCallback, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { parseISO } from "date-fns";
import { ArrowLeft, X } from "lucide-react";
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

    setAnswers((prev) => ({ ...prev, ...updates }));
    setStep(1); // Go to first questionnaire step to review
  }, [answers.destination, answers.vibes, answers.dietary]);

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

      toast.success("Itinerary generated! 🎉");
      onSuccess?.(data);
      onClose();
    } catch (err: any) {
      setGenError(err?.message || "Failed to generate itinerary. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [tripId, answers, defaults.groupSize, onSuccess, onClose]);

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
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2">
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
      <div className="flex-1 overflow-y-auto">
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

      {/* Footer */}
      {step > 0 && (
        <div className="px-6 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3 border-t border-border bg-background">
          {isLastStep ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                onClick={() => setStep(step + 1 > 6 ? 6 : step - 1)}
              >
                Back
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl font-semibold text-primary-foreground text-[15px]"
                style={{ background: "var(--gradient-primary)" }}
                onClick={handleGenerate}
              >
                Generate my trip ✨
              </Button>
            </div>
          ) : (
            <Button
              className="w-full h-12 rounded-xl font-semibold text-primary-foreground text-[15px]"
              style={{ background: "var(--gradient-primary)" }}
              disabled={!canAdvance}
              onClick={() => setStep((s) => s + 1)}
            >
              {step === 6 ? "Generate my trip ✨" : "Continue"}
            </Button>
          )}
          {step === 6 && (
            <button
              onClick={handleGenerate}
              className="w-full text-center text-sm text-muted-foreground mt-2"
            >
              Skip extras
            </button>
          )}
        </div>
      )}
    </div>
  );
}

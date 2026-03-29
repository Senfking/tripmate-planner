import { useState, useEffect, useCallback } from "react";
import { useVibeBoard } from "@/hooks/useVibeBoard";
import { VibeQuestion } from "./VibeQuestion";
import { VibeSummary } from "./VibeSummary";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock, Unlock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const QUESTIONS = [
  {
    key: "energy",
    label: "Trip energy",
    options: ["Full send 🔥", "Balanced 😎", "Chill 🧘"],
  },
  {
    key: "budget",
    label: "Budget vibe",
    options: ["Splash out 💸", "Fair split ⚖️", "Keep it lean 🪙"],
  },
  {
    key: "accommodation",
    label: "Accommodation",
    options: ["Together 🏠", "Own rooms 🏨", "Don't mind 🤷"],
  },
  {
    key: "length",
    label: "Trip length",
    options: ["Weekend", "4–5 days", "Week+"],
  },
  {
    key: "musthave",
    label: "Must-have activities",
    multiSelect: true,
    options: [
      "Food & drinks 🍽️",
      "Nightlife 🎉",
      "Culture & history 🏛️",
      "Beach & sun 🏖️",
      "Nature & hiking 🥾",
      "Wellness & spa 🧖",
      "Shopping 🛍️",
      "Adventure & sports 🏄",
      "Art & design 🎨",
      "Relaxation only 😴",
    ],
  },
];

type LocalAnswers = Record<string, string[]>;

type Props = {
  tripId: string;
  myRole: string | undefined;
  isActive: boolean;
  isLocked: boolean;
  memberCount: number;
};

export function VibeBoard({
  tripId,
  myRole,
  isActive,
  isLocked,
  memberCount,
}: Props) {
  const {
    myResponses,
    aggregates,
    respondentCount,
    isLoading,
    submitAnswers,
    activateBoard,
    lockBoard,
    unlockBoard,
  } = useVibeBoard(tripId);

  const canManage = myRole === "owner" || myRole === "admin";
  const hasSubmitted = myResponses.length > 0;

  // Local draft state
  const [draft, setDraft] = useState<LocalAnswers>({});
  const [initialized, setInitialized] = useState(false);

  // Seed draft from saved responses once loaded
  useEffect(() => {
    if (isLoading || initialized) return;
    if (myResponses.length > 0) {
      const seeded: LocalAnswers = {};
      for (const r of myResponses) {
        if (!seeded[r.question_key]) seeded[r.question_key] = [];
        seeded[r.question_key].push(r.answer_value);
      }
      setDraft(seeded);
    }
    setInitialized(true);
  }, [isLoading, myResponses, initialized]);

  const handleSelect = useCallback(
    (questionKey: string, value: string, multiSelect?: boolean) => {
      setDraft((prev) => {
        const current = prev[questionKey] || [];
        if (multiSelect) {
          if (current.includes(value)) {
            return {
              ...prev,
              [questionKey]: current.filter((v) => v !== value),
            };
          }
          if (current.length >= 2) {
            return { ...prev, [questionKey]: [current[1], value] };
          }
          return { ...prev, [questionKey]: [...current, value] };
        }
        return { ...prev, [questionKey]: [value] };
      });
    },
    []
  );

  const unansweredKeys = QUESTIONS.filter(
    (q) => (draft[q.key]?.length || 0) < 1
  ).map((q) => q.key);
  const allAnswered = unansweredKeys.length === 0;

  const handleSubmit = () => {
    const answers: { questionKey: string; answerValue: string }[] = [];
    for (const q of QUESTIONS) {
      for (const val of draft[q.key] || []) {
        answers.push({ questionKey: q.key, answerValue: val });
      }
    }
    submitAnswers.mutate(answers, {
      onSuccess: () => {
        toast({ title: "Your vibe is in! 🎉" });
      },
    });
  };

  // Inactive state
  if (!isActive) {
    if (!canManage) return null;
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center space-y-3">
        <Sparkles className="h-8 w-8 mx-auto text-primary" />
        <p className="text-sm text-muted-foreground">
          Get everyone aligned on trip vibes before planning
        </p>
        <Button
          onClick={() => activateBoard.mutate()}
          disabled={activateBoard.isPending}
        >
          Activate Vibe Board
        </Button>
      </div>
    );
  }

  // Locked + never answered
  if (isLocked && !hasSubmitted) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground italic">
          You didn't submit answers before the board was locked.
        </p>
        <VibeSummary
          aggregates={aggregates}
          respondentCount={respondentCount}
          memberCount={memberCount}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Lock action for managers */}
      {!isLocked && canManage && (
        <div className="flex justify-end md:justify-start">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => lockBoard.mutate()}
            disabled={lockBoard.isPending}
          >
            <Lock className="h-3.5 w-3.5 mr-1" />
            Lock
          </Button>
        </div>
      )}

      {isLocked && canManage && (
        <div className="flex justify-end md:justify-start">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => unlockBoard.mutate()}
            disabled={unlockBoard.isPending}
          >
            <Unlock className="h-3.5 w-3.5 mr-1" />
            Unlock
          </Button>
        </div>
      )}

      {/* Response counter */}
      {!isLocked && (
        <p className="text-xs text-muted-foreground">
          {respondentCount} of {memberCount} members have responded
        </p>
      )}

      {/* Questions */}
      {!isLoading && (
        <div className="space-y-4">
          {QUESTIONS.map((q) => (
            <VibeQuestion
              key={q.key}
              label={q.label}
              options={q.options}
              selected={draft[q.key] || []}
              multiSelect={q.multiSelect}
              disabled={isLocked}
              onSelect={(val) => handleSelect(q.key, val, q.multiSelect)}
              missing={!isLocked && unansweredKeys.includes(q.key) && unansweredKeys.length < 5}
            />
          ))}
        </div>
      )}

      {/* Submit button */}
      {!isLocked && (
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={!allAnswered || submitAnswers.isPending}
        >
          {submitAnswers.isPending
            ? "Submitting…"
            : hasSubmitted
            ? "Update my vibe"
            : "Submit my vibe"}
        </Button>
      )}

      {/* Summary */}
      <VibeSummary
        aggregates={aggregates}
        respondentCount={respondentCount}
        memberCount={memberCount}
      />
    </div>
  );
}

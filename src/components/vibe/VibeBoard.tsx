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
    label: "What's the vibe?",
    emoji: "⚡",
    options: [
      { label: "Full send", sub: "no brakes" },
      { label: "Go with the flow", sub: "spontaneous" },
      { label: "Balanced", sub: "bit of both" },
      { label: "Slow & easy", sub: "recharge mode" },
    ],
  },
  {
    key: "budget",
    label: "Budget style",
    emoji: "💰",
    options: [
      { label: "Treat ourselves", sub: "we deserve it" },
      { label: "Mid-range", sub: "smart spending" },
      { label: "Budget-friendly", sub: "save where we can" },
      { label: "As cheap as possible", sub: "backpacker mode" },
    ],
  },
  {
    key: "accommodation",
    label: "Where do we sleep?",
    emoji: "🛏️",
    options: [
      { label: "All together", sub: "one big place" },
      { label: "Own rooms", sub: "personal space" },
      { label: "Hostel life", sub: "social & cheap" },
      { label: "Don't mind", sub: "flexible" },
    ],
  },
  {
    key: "length",
    label: "How long?",
    emoji: "📅",
    options: [
      { label: "Long weekend", sub: "3 days" },
      { label: "4–5 days", sub: "sweet spot" },
      { label: "A full week", sub: "7 days" },
      { label: "Week+", sub: "go big" },
    ],
  },
  {
    key: "musthave",
    label: "Must-haves",
    emoji: "✨",
    multiSelect: true,
    options: [
      { label: "Food & drinks", sub: null },
      { label: "Nightlife", sub: null },
      { label: "Culture & history", sub: null },
      { label: "Beach & sun", sub: null },
      { label: "Nature & hiking", sub: null },
      { label: "Wellness & spa", sub: null },
      { label: "Shopping", sub: null },
      { label: "Adventure & sports", sub: null },
      { label: "Art & design", sub: null },
      { label: "Local hidden gems", sub: null },
      { label: "Photography spots", sub: null },
      { label: "Live music", sub: null },
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
  myAttendanceStatus?: string;
};

export function VibeBoard({
  tripId,
  myRole,
  isActive,
  isLocked,
  memberCount,
  myAttendanceStatus,
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

  // Gate: pending or not_going users can't participate
  if (myAttendanceStatus === "pending" || myAttendanceStatus === "not_going") {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center space-y-3">
        <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Confirm your attendance first to share your travel vibe.
        </p>
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          Go to trip to confirm →
        </Button>
      </div>
    );
  }

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
        {canManage && (
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
              emoji={q.emoji}
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

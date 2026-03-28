import { useVibeBoard } from "@/hooks/useVibeBoard";
import { VibeQuestion } from "./VibeQuestion";
import { VibeSummary } from "./VibeSummary";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock } from "lucide-react";

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
    upsertAnswer,
    activateBoard,
    lockBoard,
  } = useVibeBoard(tripId);

  const canManage = myRole === "owner" || myRole === "admin";
  const hasAnswered = myResponses.length > 0;

  // Inactive state
  if (!isActive) {
    if (!canManage) return null;
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center space-y-3">
        <Sparkles className="h-8 w-8 mx-auto text-primary" />
        <div>
          <p className="font-semibold text-foreground">Vibe Board</p>
          <p className="text-sm text-muted-foreground">
            Get everyone aligned on trip vibes before planning
          </p>
        </div>
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
  if (isLocked && !hasAnswered) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Vibe Board</h2>
          <Lock className="h-4 w-4 text-muted-foreground ml-auto" />
          <span className="text-xs text-muted-foreground">Locked</span>
        </div>
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

  const selectedFor = (key: string) =>
    myResponses
      .filter((r) => r.question_key === key)
      .map((r) => r.answer_value);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">Vibe Board</h2>
        {isLocked && (
          <>
            <Lock className="h-4 w-4 text-muted-foreground ml-auto" />
            <span className="text-xs text-muted-foreground">Locked</span>
          </>
        )}
        {!isLocked && canManage && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs"
            onClick={() => lockBoard.mutate()}
            disabled={lockBoard.isPending}
          >
            <Lock className="h-3.5 w-3.5 mr-1" />
            Lock
          </Button>
        )}
      </div>

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
              selected={selectedFor(q.key)}
              multiSelect={q.multiSelect}
              disabled={isLocked || upsertAnswer.isPending}
              onSelect={(val) =>
                upsertAnswer.mutate({
                  questionKey: q.key,
                  answerValue: val,
                })
              }
            />
          ))}
        </div>
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

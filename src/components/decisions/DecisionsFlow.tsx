import { useState, useEffect, useRef } from "react";
import { StepSection } from "./StepSection";
import { VibeBoard } from "@/components/vibe/VibeBoard";
import { WhereWhenSection } from "./WhereWhenSection";
import { useVibeBoard } from "@/hooks/useVibeBoard";
import { useProposals } from "@/hooks/useProposals";
import { useDecisionPolls } from "@/hooks/useDecisionPolls";
import { format } from "date-fns";

// Map question keys to friendly emoji labels for collapsed summary
const VIBE_LABELS: Record<string, string> = {
  energy: "",
  budget: "",
  accommodation: "",
  length: "",
  musthave: "",
};

type Props = {
  tripId: string;
  myRole: string | undefined;
  isActive: boolean;
  isLocked: boolean;
  memberCount: number;
};

export function DecisionsFlow({
  tripId,
  myRole,
  isActive,
  isLocked: vibeLocked,
  memberCount,
}: Props) {
  const canManage = myRole === "owner" || myRole === "admin";

  // Vibe data
  const { myResponses, respondentCount } = useVibeBoard(tripId);
  const hasSubmittedVibe = myResponses.length > 0;

  // Proposal data (for confirmed status)
  const { hasConfirmed, leadingCombo } = useProposals(tripId);

  // Preference polls
  const { prefPolls } = useDecisionPolls(tripId);

  // Expand/collapse state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    vibe: true,
    where: false,
    prefs: false,
  });

  // Manual skip for Where & When unlock
  const [manuallySkipped, setManuallySkipped] = useState(false);

  // Track previous hasSubmittedVibe to auto-collapse on submit
  const prevSubmitted = useRef(hasSubmittedVibe);
  useEffect(() => {
    if (!prevSubmitted.current && hasSubmittedVibe) {
      setExpanded((prev) => ({ ...prev, vibe: false }));
    }
    prevSubmitted.current = hasSubmittedVibe;
  }, [hasSubmittedVibe]);

  // Where & When unlock logic
  const vibeRatio = memberCount > 0 ? respondentCount / memberCount : 0;
  const whereUnlocked = vibeRatio >= 0.5 || manuallySkipped || !isActive;
  const membersNeeded = Math.max(0, Math.ceil(memberCount * 0.5) - respondentCount);

  // Auto-expand Where & When when it unlocks
  const prevUnlocked = useRef(whereUnlocked);
  useEffect(() => {
    if (!prevUnlocked.current && whereUnlocked) {
      setExpanded((prev) => ({ ...prev, where: true }));
    }
    prevUnlocked.current = whereUnlocked;
  }, [whereUnlocked]);

  // Auto-collapse Where & When when confirmed
  const prevConfirmed = useRef(hasConfirmed);
  useEffect(() => {
    if (!prevConfirmed.current && hasConfirmed) {
      setExpanded((prev) => ({ ...prev, where: false }));
    }
    prevConfirmed.current = hasConfirmed;
  }, [hasConfirmed]);

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // Build vibe collapsed summary
  const vibeSummary = hasSubmittedVibe
    ? myResponses
        .filter((r) => r.question_key !== "musthave")
        .slice(0, 3)
        .map((r) => r.answer_value)
        .join(" · ")
    : undefined;

  // Build where confirmed summary
  const whereSummary =
    hasConfirmed && leadingCombo
      ? `${leadingCombo.destination}${
          leadingCombo.dateOption
            ? ` · ${format(new Date(leadingCombo.dateOption.start_date), "MMM d")}–${format(new Date(leadingCombo.dateOption.end_date), "MMM d")}`
            : ""
        }`
      : undefined;

  // Vibe status
  const vibeStatus = !isActive
    ? { text: "Not started", variant: "muted" as const }
    : hasSubmittedVibe
    ? { text: "✅ Done", variant: "done" as const }
    : { text: "In progress", variant: "active" as const };

  // Where status
  const whereStatus = !whereUnlocked
    ? { text: "Locked", variant: "waiting" as const }
    : hasConfirmed
    ? { text: "✅ Confirmed", variant: "done" as const }
    : { text: "In progress", variant: "active" as const };

  // Prefs status
  const prefsStatus =
    prefPolls.length > 0
      ? { text: `${prefPolls.length} question${prefPolls.length > 1 ? "s" : ""}`, variant: "muted" as const }
      : { text: "Add one", variant: "muted" as const };

  return (
    <div className="space-y-3">
      {/* Step 1: Vibe Board */}
      <StepSection
        stepNumber={1}
        title="Vibe Board"
        statusText={vibeStatus.text}
        statusVariant={vibeStatus.variant}
        isExpanded={expanded.vibe}
        onToggle={() => toggle("vibe")}
        activeBorder={isActive && !hasSubmittedVibe}
        collapsedSummary={vibeSummary}
      >
        <VibeBoard
          tripId={tripId}
          myRole={myRole}
          isActive={isActive}
          isLocked={vibeLocked}
          memberCount={memberCount}
        />
      </StepSection>

      {/* Step 2: Where & When */}
      <StepSection
        stepNumber={2}
        title="Where & When"
        statusText={whereStatus.text}
        statusVariant={whereStatus.variant}
        isExpanded={expanded.where}
        onToggle={() => toggle("where")}
        isLocked={!whereUnlocked}
        lockMessage={`Waiting for ${membersNeeded} more member${membersNeeded !== 1 ? "s" : ""} to share their vibe`}
        onSkip={canManage ? () => setManuallySkipped(true) : undefined}
        activeBorder={whereUnlocked && !hasConfirmed}
        collapsedSummary={whereSummary}
      >
        <WhereWhenSection tripId={tripId} myRole={myRole} />
      </StepSection>

      {/* Step 3: Preferences */}
      <StepSection
        stepNumber={3}
        title="Preferences"
        subtitle="Optional"
        statusText={prefsStatus.text}
        statusVariant={prefsStatus.variant}
        isExpanded={expanded.prefs}
        onToggle={() => toggle("prefs")}
        collapsedSummary={undefined}
      >
        {/* Preferences content is inside WhereWhenSection already — extract just the polls portion */}
        <PreferencesContent tripId={tripId} myRole={myRole} />
      </StepSection>
    </div>
  );
}

// Extracted preferences section (polls only, no destination stuff)
import { StructuredPoll } from "./StructuredPoll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";

function PreferencesContent({ tripId, myRole }: { tripId: string; myRole: string | undefined }) {
  const canManage = myRole === "owner" || myRole === "admin";
  const isMobile = useIsMobile();
  const { prefPolls, voteCounts, myVotes, createPoll, addOption, vote, lockPoll } =
    useDecisionPolls(tripId);

  const [prefOpen, setPrefOpen] = useState(false);
  const [prefTitle, setPrefTitle] = useState("");

  const handleCreatePref = () => {
    if (!prefTitle.trim()) return;
    createPoll.mutate(
      { type: "preference", title: prefTitle.trim() },
      {
        onSuccess: () => {
          setPrefTitle("");
          setPrefOpen(false);
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {prefPolls.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No preference polls yet. {canManage ? "Ask the group something!" : "The organizer can add polls here."}
        </p>
      )}

      {prefPolls.map((poll) => (
        <StructuredPoll
          key={poll.id}
          poll={poll}
          stepLabel="Preferences"
          voteTally={voteCounts[poll.id] || {}}
          myVotes={myVotes}
          canManage={canManage}
          onAddOption={(input) =>
            addOption.mutate({ pollId: poll.id, label: input.label })
          }
          onVote={(optionId, value) => vote.mutate({ optionId, value })}
          onLock={() => lockPoll.mutate(poll.id)}
          isAddingOption={addOption.isPending}
          isLocking={lockPoll.isPending}
        />
      ))}

      {canManage &&
        (() => {
          const trigger = (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <Plus className="h-4 w-4" />
              Ask the group something
            </Button>
          );
          const content = (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Question</Label>
                <Input
                  placeholder="e.g. Airbnb or hotel?"
                  value={prefTitle}
                  onChange={(e) => setPrefTitle(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreatePref}
                disabled={!prefTitle.trim() || createPoll.isPending}
              >
                Create poll
              </Button>
            </div>
          );
          if (isMobile) {
            return (
              <Drawer open={prefOpen} onOpenChange={setPrefOpen}>
                <DrawerTrigger asChild>{trigger}</DrawerTrigger>
                <DrawerContent className="px-4 pb-6">
                  <DrawerHeader className="text-left px-0">
                    <DrawerTitle>New preference poll</DrawerTitle>
                  </DrawerHeader>
                  {content}
                </DrawerContent>
              </Drawer>
            );
          }
          return (
            <Dialog open={prefOpen} onOpenChange={setPrefOpen}>
              <DialogTrigger asChild>{trigger}</DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>New preference poll</DialogTitle>
                </DialogHeader>
                {content}
              </DialogContent>
            </Dialog>
          );
        })()}
    </div>
  );
}

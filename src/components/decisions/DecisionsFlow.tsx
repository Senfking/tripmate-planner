import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { StepSection } from "./StepSection";
import { VibeBoard } from "@/components/vibe/VibeBoard";
import { WhereWhenSection } from "./WhereWhenSection";
import { useVibeBoard } from "@/hooks/useVibeBoard";
import { useRouteStops } from "@/hooks/useRouteStops";
import { useDecisionPolls } from "@/hooks/useDecisionPolls";
import { format, parseISO } from "date-fns";

type Props = {
  tripId: string;
  myRole: string | undefined;
  isActive: boolean;
  isLocked: boolean;
  memberCount: number;
  routeLocked: boolean;
};

export function DecisionsFlow({
  tripId,
  myRole,
  isActive,
  isLocked: vibeLocked,
  memberCount,
  routeLocked,
}: Props) {
  const canManage = myRole === "owner" || myRole === "admin";

  // Vibe data
  const { myResponses, respondentCount } = useVibeBoard(tripId);
  const hasSubmittedVibe = myResponses.length > 0;

  // Route stops data
  const { stops, tripStart, tripEnd, totalDays } = useRouteStops(tripId);
  const hasRouteStops = stops.length > 0;

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

  // Auto-collapse Where & When when route is locked
  const prevRouteLocked = useRef(routeLocked);
  useEffect(() => {
    if (!prevRouteLocked.current && routeLocked) {
      setExpanded((prev) => ({ ...prev, where: false }));
    }
    // Auto-expand when route is unlocked
    if (prevRouteLocked.current && !routeLocked) {
      setExpanded((prev) => ({ ...prev, where: true }));
    }
    prevRouteLocked.current = routeLocked;
  }, [routeLocked]);

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

  // Build where collapsed summary
  const fmt = (d: string) => format(parseISO(d), "MMM d");
  const whereSummary = routeLocked && hasRouteStops && tripStart && tripEnd
    ? `${stops.length}-stop route · ${fmt(tripStart)} – ${fmt(tripEnd)}`
    : hasRouteStops
    ? `${stops.length} stop${stops.length > 1 ? "s" : ""} added`
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
    : routeLocked
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
        activeBorder={whereUnlocked && !routeLocked}
        collapsedSummary={whereSummary}
      >
        <WhereWhenSection tripId={tripId} myRole={myRole} isRouteLocked={routeLocked} />
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
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";

function PreferencesContent({ tripId, myRole }: { tripId: string; myRole: string | undefined }) {
  const canManage = myRole === "owner" || myRole === "admin";
  const isMobile = useIsMobile();
  const { prefPolls, voteCounts, myVotes, createPoll, addOption, vote, lockPoll, deletePoll, updatePollTitle } =
    useDecisionPolls(tripId);

  const [prefOpen, setPrefOpen] = useState(false);
  const [prefTitle, setPrefTitle] = useState("");
  const [prefOptions, setPrefOptions] = useState<string[]>(["", ""]);
  const [newOptionText, setNewOptionText] = useState("");

  const resetForm = () => {
    setPrefTitle("");
    setPrefOptions(["", ""]);
    setNewOptionText("");
  };

  const handleCreatePref = () => {
    if (!prefTitle.trim()) return;
    const validOptions = prefOptions.filter((o) => o.trim());
    createPoll.mutate(
      { type: "preference", title: prefTitle.trim(), options: validOptions },
      {
        onSuccess: () => {
          resetForm();
          setPrefOpen(false);
        },
      }
    );
  };

  const updateOption = (index: number, value: string) => {
    setPrefOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const removeOption = (index: number) => {
    setPrefOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const addNewOption = () => {
    if (newOptionText.trim()) {
      setPrefOptions((prev) => [...prev, newOptionText.trim()]);
      setNewOptionText("");
    }
  };

  const content = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Question</Label>
        <Input
          placeholder="e.g. Airbnb or hotel?"
          value={prefTitle}
          onChange={(e) => setPrefTitle(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Answer options</Label>
        {prefOptions.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder={`Option ${i + 1}`}
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
            />
            {prefOptions.length > 2 && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive"
                onClick={() => removeOption(i)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Add another option…"
            value={newOptionText}
            onChange={(e) => setNewOptionText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNewOption();
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={addNewOption}
            disabled={!newOptionText.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Button
        className="w-full"
        onClick={handleCreatePref}
        disabled={
          !prefTitle.trim() ||
          prefOptions.filter((o) => o.trim()).length < 2 ||
          createPoll.isPending
        }
      >
        {createPoll.isPending ? "Creating…" : "Create poll"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {prefPolls.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No polls yet. Ask the group anything!
        </p>
      )}

      {prefPolls.map((poll) => (
        <StructuredPoll
          key={poll.id}
          poll={poll}
          stepLabel="Poll"
          voteTally={voteCounts[poll.id] || {}}
          myVotes={myVotes}
          canManage={canManage}
          onAddOption={(input) =>
            addOption.mutate({ pollId: poll.id, label: input.label })
          }
          onVote={(optionId, value) => vote.mutate({ optionId, value })}
          onLock={() => lockPoll.mutate(poll.id)}
          onDelete={() => deletePoll.mutate(poll.id)}
          onUpdateTitle={(title) => updatePollTitle.mutate({ pollId: poll.id, title })}
          isAddingOption={addOption.isPending}
          isLocking={lockPoll.isPending}
        />
      ))}

      {(() => {
        const trigger = (
          <div className="flex justify-end md:justify-start">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <Plus className="h-4 w-4" />
              Ask the group something
            </Button>
          </div>
        );
        if (isMobile) {
          return (
            <Drawer open={prefOpen} onOpenChange={setPrefOpen}>
              <DrawerTrigger asChild>{trigger}</DrawerTrigger>
              <DrawerContent className="px-4 pb-6">
                <DrawerHeader className="text-left px-0">
                  <DrawerTitle>New poll</DrawerTitle>
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
                <DialogTitle>New poll</DialogTitle>
              </DialogHeader>
              {content}
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

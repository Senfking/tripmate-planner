import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { StepSection } from "./StepSection";
import { WhereWhenSection } from "./WhereWhenSection";
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
  myAttendanceStatus?: string;
};

export function DecisionsFlow({
  tripId,
  myRole,
  routeLocked,
}: Props) {
  const [searchParams] = useSearchParams();

  // Route stops data
  const { stops, tripStart, tripEnd } = useRouteStops(tripId);
  const hasRouteStops = stops.length > 0;

  // Preference polls
  const { prefPolls } = useDecisionPolls(tripId);

  // Expand/collapse state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    where: true,
    prefs: false,
  });

  // Auto-collapse Where & When when route is locked
  const prevRouteLocked = useRef(routeLocked);
  useEffect(() => {
    if (!prevRouteLocked.current && routeLocked) {
      setExpanded((prev) => ({ ...prev, where: false }));
    }
    if (prevRouteLocked.current && !routeLocked) {
      setExpanded((prev) => ({ ...prev, where: true }));
    }
    prevRouteLocked.current = routeLocked;
  }, [routeLocked]);

  // Deep-link scroll + highlight from global Decisions tab
  const didScroll = useRef(false);
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
  useEffect(() => {
    if (didScroll.current) return;
    const scrollTo = searchParams.get("scrollTo");
    if (!scrollTo) return;
    didScroll.current = true;
    const pollId = searchParams.get("pollId");

    if (scrollTo === "where") {
      setExpanded((prev) => ({ ...prev, where: true }));
      setHighlightTarget("decisions-step-1");
    } else if (scrollTo === "polls") {
      setExpanded((prev) => ({ ...prev, prefs: true }));
      setHighlightTarget(pollId ? `poll-${pollId}` : "decisions-step-2");
    }

    const targetId = scrollTo === "polls" && pollId
      ? `poll-${pollId}`
      : scrollTo === "where" ? "decisions-step-1"
      : scrollTo === "polls" ? "decisions-step-2" : null;

    if (targetId) {
      let attempts = 0;
      const tryScroll = () => {
        const el = document.getElementById(targetId);
        if (el) {
          const rect = el.getBoundingClientRect();
          const scrollContainer = document.documentElement;
          const targetY = rect.top + scrollContainer.scrollTop - window.innerHeight * 0.2;
          window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
        } else if (attempts < 5) {
          attempts++;
          setTimeout(tryScroll, 150);
        }
      };
      setTimeout(tryScroll, 350);
    }

    setTimeout(() => setHighlightTarget(null), 2500);
  }, [searchParams]);

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // Build where collapsed summary
  const fmt = (d: string) => format(parseISO(d), "MMM d");
  const whereSummary = routeLocked && hasRouteStops && tripStart && tripEnd
    ? `${stops.length}-stop route · ${fmt(tripStart)} – ${fmt(tripEnd)}`
    : hasRouteStops
    ? `${stops.length} stop${stops.length > 1 ? "s" : ""} added`
    : undefined;

  // Where status
  const whereStatus = routeLocked
    ? { text: "✅ Confirmed", variant: "done" as const }
    : { text: "In progress", variant: "active" as const };

  // Prefs status
  const prefsStatus =
    prefPolls.length > 0
      ? { text: `${prefPolls.length} question${prefPolls.length > 1 ? "s" : ""}`, variant: "muted" as const }
      : { text: "Add one", variant: "muted" as const };

  return (
    <div className="space-y-3">
      {/* Step 1: Where & When */}
      <div id="decisions-step-1">
        <StepSection
          stepNumber={1}
          title="Where & When"
          statusText={whereStatus.text}
          statusVariant={whereStatus.variant}
          isExpanded={expanded.where}
          onToggle={() => toggle("where")}
          activeBorder={!routeLocked}
          collapsedSummary={whereSummary}
          isHighlighted={highlightTarget === "decisions-step-1"}
        >
          <WhereWhenSection tripId={tripId} myRole={myRole} isRouteLocked={routeLocked} />
        </StepSection>
      </div>

      {/* Step 2: Group Polls */}
      <div id="decisions-step-2">
        <StepSection
          stepNumber={2}
          title="Group Polls"
          subtitle="Optional"
          statusText={prefsStatus.text}
          statusVariant={prefsStatus.variant}
          isExpanded={expanded.prefs}
          onToggle={() => toggle("prefs")}
          collapsedSummary={undefined}
          isHighlighted={highlightTarget === "decisions-step-2"}
        >
          <PreferencesContent tripId={tripId} myRole={myRole} highlightedPollId={highlightTarget?.startsWith("poll-") ? highlightTarget.replace("poll-", "") : undefined} />
        </StepSection>
      </div>
    </div>
  );
}

// Extracted preferences section (polls only, no destination stuff)
import { StructuredPoll } from "./StructuredPoll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, ListChecks } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

function PreferencesContent({ tripId, myRole, highlightedPollId }: { tripId: string; myRole: string | undefined; highlightedPollId?: string }) {
  const canManage = myRole === "owner" || myRole === "admin";
  const isMobile = useIsMobile();
  const { prefPolls, voteCounts, myVotes, createPoll, addOption, deleteOption, vote, lockPoll, deletePoll, updatePollTitle, toggleMultiSelect } =
    useDecisionPolls(tripId);

  const [prefOpen, setPrefOpen] = useState(false);
  const [prefTitle, setPrefTitle] = useState("");
  const [prefOptions, setPrefOptions] = useState<string[]>(["", ""]);
  const [prefMultiSelect, setPrefMultiSelect] = useState(false);

  const resetForm = () => {
    setPrefTitle("");
    setPrefOptions(["", ""]);
    setPrefMultiSelect(false);
  };

  const handleCreatePref = () => {
    if (!prefTitle.trim()) return;
    const validOptions = prefOptions.filter((o) => o.trim());
    createPoll.mutate(
      { type: "preference", title: prefTitle.trim(), options: validOptions, multiSelect: prefMultiSelect },
      {
        onSuccess: () => {
          resetForm();
          setPrefOpen(false);
        },
      }
    );
  };

  const updateOption = (index: number, value: string) => {
    setPrefOptions((prev) => {
      const updated = prev.map((o, i) => (i === index ? value : o));
      // Auto-add a new empty field when the last field gets content
      if (index === prev.length - 1 && value.trim()) {
        updated.push("");
      }
      return updated;
    });
  };

  const removeOption = (index: number) => {
    setPrefOptions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Always keep at least one empty field at the end
      if (next.length === 0 || next[next.length - 1].trim()) {
        next.push("");
      }
      return next.length < 2 ? [...next, ""] : next;
    });
  };

  const formBody = (
    <div className="space-y-4" data-vaul-no-drag>
      <div className="space-y-1.5">
        <Label>Question</Label>
        <Input
          placeholder="e.g. Airbnb or hotel?"
          value={prefTitle}
          onChange={(e) => setPrefTitle(e.target.value)}
          enterKeyHint="next"
        />
      </div>

      <div className="space-y-2">
        <Label>Answer options</Label>
        {prefOptions.map((opt, i) => {
          const isLastEmpty = i === prefOptions.length - 1 && !opt.trim();
          const filledCount = prefOptions.filter((o) => o.trim()).length;
          return (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder={isLastEmpty ? "Add another option…" : `Option ${i + 1}`}
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                enterKeyHint={isLastEmpty ? "done" : "next"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
              />
              {!isLastEmpty && filledCount > 2 && (
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
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setPrefMultiSelect((v) => !v)}
        className={`flex items-center gap-2 w-full rounded-lg px-3 py-2.5 text-sm border transition-colors ${
          prefMultiSelect
            ? "bg-primary/10 border-primary text-primary"
            : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
        }`}
      >
        <ListChecks className="h-4 w-4" />
        <span className="font-medium">Allow multiple answers</span>
      </button>
    </div>
  );

  const submitButton = (
    <Button
      className="w-full"
      onClick={() => {
        if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        handleCreatePref();
      }}
      disabled={
        !prefTitle.trim() ||
        prefOptions.filter((o) => o.trim()).length < 2 ||
        createPoll.isPending
      }
    >
      {createPoll.isPending ? "Creating…" : "Create poll"}
    </Button>
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
          onDeleteOption={(optionId) => deleteOption.mutate(optionId)}
          onVote={(optionId, value) => vote.mutate({ optionId, value })}
          onLock={() => lockPoll.mutate(poll.id)}
          onDelete={() => deletePoll.mutate(poll.id)}
          onUpdateTitle={(title) => updatePollTitle.mutate({ pollId: poll.id, title })}
          onToggleMultiSelect={(ms) => toggleMultiSelect.mutate({ pollId: poll.id, multiSelect: ms })}
          isAddingOption={addOption.isPending}
          isLocking={lockPoll.isPending}
          isHighlighted={poll.id === highlightedPollId}
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
            <Drawer open={prefOpen} onOpenChange={setPrefOpen} shouldScaleBackground={false}>
              <DrawerTrigger asChild>{trigger}</DrawerTrigger>
              <DrawerContent className="px-4 pb-6 max-h-[85dvh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
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

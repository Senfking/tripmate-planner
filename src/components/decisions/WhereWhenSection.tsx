import { useState } from "react";
import { useProposals } from "@/hooks/useProposals";
import { useDecisionPolls } from "@/hooks/useDecisionPolls";
import { ProposalCard } from "./ProposalCard";
import { ProposalForm } from "./ProposalForm";
import { StructuredPoll } from "./StructuredPoll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

type Props = {
  tripId: string;
  myRole: string | undefined;
};

export function WhereWhenSection({ tripId, myRole }: Props) {
  const canManage = myRole === "owner" || myRole === "admin";
  const isMobile = useIsMobile();

  const {
    proposals,
    reactionCounts,
    myReactions,
    createProposal,
    react,
    adoptProposal,
  } = useProposals(tripId);

  const {
    destPoll,
    datePoll,
    prefPolls,
    voteCounts,
    myVotes,
    createPoll,
    addOption,
    vote,
    lockPoll,
  } = useDecisionPolls(tripId);

  const hasAdopted = proposals.some((p) => p.adopted);
  const destIsLocked = destPoll?.status === "locked";

  // Preference poll creation
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
    <div className="space-y-6 mt-6">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">Where & When</h2>
      </div>

      {/* Proposals */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground font-medium">Suggestions</p>
          <ProposalForm
            onSubmit={(data) => {
              createProposal.mutate(data, {
                onSuccess: () => toast({ title: "Suggestion posted! 🎉" }),
              });
            }}
            isPending={createProposal.isPending}
          />
        </div>

        {proposals.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No suggestions yet — be the first!</p>
        )}

        {proposals.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            reactions={reactionCounts[p.id] || { in: 0, maybe: 0, no: 0 }}
            myReaction={myReactions[p.id]}
            hasAdopted={hasAdopted}
            canAdopt={canManage && !hasAdopted}
            onReact={(value) => react.mutate({ proposalId: p.id, value })}
            onAdopt={() => {
              adoptProposal.mutate(p, {
                onSuccess: () =>
                  toast({ title: "Plan adopted — destination and dates are locked ✅" }),
              });
            }}
            isAdopting={adoptProposal.isPending}
          />
        ))}
      </div>

      {/* Structured Polls — hidden when a proposal is adopted */}
      {!hasAdopted && (
        <div className="space-y-4">
          {/* Step 1: Destination */}
          {destPoll ? (
            <StructuredPoll
              poll={destPoll}
              stepLabel="Step 1"
              voteTally={voteCounts[destPoll.id] || {}}
              myVotes={myVotes}
              canManage={canManage}
              onAddOption={(input) =>
                addOption.mutate({ pollId: destPoll.id, label: input.label })
              }
              onVote={(optionId, value) => vote.mutate({ optionId, value })}
              onLock={() => lockPoll.mutate(destPoll.id)}
              isAddingOption={addOption.isPending}
              isLocking={lockPoll.isPending}
            />
          ) : (
            canManage && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  createPoll.mutate({ type: "destination", title: "Where are we going?" })
                }
                disabled={createPoll.isPending}
              >
                <Plus className="h-4 w-4" />
                Create destination poll
              </Button>
            )
          )}

          {/* Step 2: Date */}
          {datePoll ? (
            <StructuredPoll
              poll={datePoll}
              stepLabel="Step 2"
              disabled={!destIsLocked}
              disabledMessage="Decide where you're going first, then align on dates"
              voteTally={voteCounts[datePoll.id] || {}}
              myVotes={myVotes}
              canManage={canManage}
              onAddOption={(input) =>
                addOption.mutate({
                  pollId: datePoll.id,
                  label: input.label,
                  startDate: input.startDate,
                  endDate: input.endDate,
                })
              }
              onVote={(optionId, value) => vote.mutate({ optionId, value })}
              onLock={() => lockPoll.mutate(datePoll.id)}
              isAddingOption={addOption.isPending}
              isLocking={lockPoll.isPending}
            />
          ) : (
            canManage &&
            destPoll && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!destIsLocked || createPoll.isPending}
                onClick={() =>
                  createPoll.mutate({ type: "date", title: "When are we going?" })
                }
              >
                <Plus className="h-4 w-4" />
                Create date poll
              </Button>
            )
          )}
        </div>
      )}

      {/* Step 3: Preference polls */}
      <div className="space-y-4">
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

        {canManage && (
          <Dialog open={prefOpen} onOpenChange={setPrefOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                <Plus className="h-4 w-4" />
                Ask the group something
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>New preference poll</DialogTitle>
              </DialogHeader>
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
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

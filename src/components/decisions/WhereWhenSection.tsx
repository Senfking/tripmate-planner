import { useState } from "react";
import { useProposals } from "@/hooks/useProposals";
import { ProposalCard } from "./ProposalCard";
import { ProposalForm } from "./ProposalForm";
import { LeadingComboBanner } from "./LeadingComboBanner";
import { MapPin } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Props = {
  tripId: string;
  myRole: string | undefined;
};

export function WhereWhenSection({ tripId, myRole }: Props) {
  const canManage = myRole === "owner" || myRole === "admin";
  const {
    proposals,
    hasConfirmed,
    destVotes,
    myDestVotes,
    dateOptionsByProposal,
    dateVotes,
    myDateVotes,
    leadingCombo,
    createProposal,
    reactDest,
    addDateOption,
    voteDateOption,
    confirmProposal,
  } = useProposals(tripId);

  return (
    <div className="space-y-6 mt-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Where & When</h2>
        </div>
        {proposals.length > 0 && !hasConfirmed && (
          <ProposalForm
            onSubmit={(data) => {
              createProposal.mutate(data, {
                onSuccess: () => toast({ title: "Destination suggested! 🎉" }),
              });
            }}
            isPending={createProposal.isPending}
          />
        )}
      </div>

      {/* Leading combo banner */}
      <LeadingComboBanner leadingCombo={leadingCombo} />

      {/* Destination cards */}
      {proposals.length === 0 ? (
        <div className="text-center py-8 space-y-4">
          <p className="text-muted-foreground">
            No plans suggested yet. Be the first to suggest a destination! 🌍
          </p>
          <div className="flex justify-center">
            <ProposalForm
              onSubmit={(data) => {
                createProposal.mutate(data, {
                  onSuccess: () => toast({ title: "Destination suggested! 🎉" }),
                });
              }}
              isPending={createProposal.isPending}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => {
            const pDateOptions = dateOptionsByProposal(p.id);
            return (
              <ProposalCard
                key={p.id}
                proposal={p}
                destVotes={destVotes[p.id] || { up: 0, down: 0 }}
                myDestVote={myDestVotes[p.id]}
                dateOptions={pDateOptions}
                dateVotes={dateVotes}
                myDateVotes={myDateVotes}
                hasConfirmed={hasConfirmed}
                canManage={canManage}
                onReactDest={(value) => reactDest.mutate({ proposalId: p.id, value })}
                onAddDateOption={(input) =>
                  addDateOption.mutate({ proposalId: p.id, ...input })
                }
                onVoteDateOption={(dateOptionId, value) =>
                  voteDateOption.mutate({ dateOptionId, value })
                }
                onConfirm={(dateOptionId) => {
                  const dateOpt = pDateOptions.find((d) => d.id === dateOptionId);
                  confirmProposal.mutate(
                    { proposalId: p.id, dateOptionId },
                    {
                      onSuccess: () => {
                        const dateStr = dateOpt
                          ? `${dateOpt.start_date} → ${dateOpt.end_date}`
                          : "";
                        toast({
                          title: `Plan confirmed! ✅ ${p.destination}${dateStr ? ` · ${dateStr}` : ""}`,
                        });
                      },
                    }
                  );
                }}
                isConfirming={confirmProposal.isPending}
                isAddingDate={addDateOption.isPending}
              />
            );
          })}
        </div>
      )}

      {/* Preference polls */}
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
    </div>
  );
}

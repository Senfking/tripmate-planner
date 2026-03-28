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
    </div>
  );
}

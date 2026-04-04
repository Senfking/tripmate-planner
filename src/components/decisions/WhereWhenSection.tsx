import { useState, useMemo } from "react";
import { useProposals } from "@/hooks/useProposals";
import { useRouteStops } from "@/hooks/useRouteStops";
import { useAuth } from "@/contexts/AuthContext";
import { ProposalCard } from "./ProposalCard";
import { ProposalForm } from "./ProposalForm";
import { LeadingComboBanner } from "./LeadingComboBanner";
import { TripRoute } from "./TripRoute";
import { MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type Props = {
  tripId: string;
  myRole: string | undefined;
  isRouteLocked: boolean;
};

export function WhereWhenSection({ tripId, myRole, isRouteLocked }: Props) {
  const { user } = useAuth();
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  const {
    proposals,
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
    deleteProposal,
  } = useProposals(tripId);

  const {
    stops,
    addStop,
    removeStop,
    updateStopDates,
    lockRoute,
    unlockRoute,
    isProposalInRoute,
  } = useRouteStops(tripId);

  const [showVoting, setShowVoting] = useState(false);

  // Build proposalReactions map: proposal_id → { up, down }
  const proposalReactions = useMemo(() => {
    const map: Record<string, { up: number; down: number }> = {};
    for (const p of proposals) {
      const votes = destVotes[p.id];
      if (votes) {
        map[p.id] = { up: votes.up || 0, down: votes.down || 0 };
      }
    }
    return map;
  }, [proposals, destVotes]);

  const hasProposals = proposals.length > 0;
  const votingSectionVisible = hasProposals || showVoting;

  return (
    <div className="space-y-6 mt-6">
      {/* Trip Route section */}
      <TripRoute
        stops={stops}
        canManage={canManage}
        isOwner={isOwner}
        isRouteLocked={isRouteLocked}
        onAddStop={(input) => {
          addStop.mutate(input, {
            onSuccess: () => toast({ title: "Stop added to route! 📍" }),
          });
        }}
        isAddingStop={addStop.isPending}
        onRemoveStop={(input) => {
          removeStop.mutate(input, {
            onSuccess: () => toast({ title: "Stop removed from route" }),
          });
        }}
        onUpdateStopDates={(input) => {
          updateStopDates.mutate(input, {
            onSuccess: () => toast({ title: "Dates updated! 📅" }),
          });
        }}
        isUpdatingDates={updateStopDates.isPending}
        onLockRoute={() => lockRoute.mutate()}
        onUnlockRoute={() => unlockRoute.mutate()}
        isLocking={lockRoute.isPending || unlockRoute.isPending}
        proposalReactions={proposalReactions}
      />

      {/* Voting section — conditional */}
      {votingSectionVisible ? (
        <>
          {/* Section header */}
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-foreground">Vote on destinations</h2>
              </div>
              {hasProposals && !isRouteLocked && (
                <ProposalForm
                  onSubmit={async (data) => {
                    try {
                      await createProposal.mutateAsync(data);
                      toast({ title: data.startDate ? "Destination & dates suggested! 🎉" : "Destination suggested! 🎉" });
                    } catch {
                      toast({ title: "Failed to add destination", variant: "destructive" });
                      throw new Error("failed");
                    }
                  }}
                  isPending={createProposal.isPending}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-7">
              Suggest a place — the group votes, the admin adds it to the route.
            </p>
          </div>

          {/* Leading combo banner */}
          <LeadingComboBanner
            leadingCombo={leadingCombo}
            routeStops={stops}
            isRouteLocked={isRouteLocked}
          />

          {/* Destination cards */}
          {!hasProposals ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-muted-foreground">
                No plans suggested yet. Be the first to suggest a destination! 🌍
              </p>
              <div className="flex justify-center">
                <ProposalForm
                  onSubmit={async (data) => {
                    try {
                      await createProposal.mutateAsync(data);
                      toast({ title: data.startDate ? "Destination & dates suggested! 🎉" : "Destination suggested! 🎉" });
                    } catch {
                      toast({ title: "Failed to add destination", variant: "destructive" });
                      throw new Error("failed");
                    }
                  }}
                  isPending={createProposal.isPending}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {proposals.map((p) => {
                const pDateOptions = dateOptionsByProposal(p.id);
                const isCreator = user?.id === p.created_by;
                const hasOtherVotes = (destVotes[p.id]?.up || 0) + (destVotes[p.id]?.down || 0) > (myDestVotes[p.id] ? 1 : 0);
                const canDeleteThis = canManage || (isCreator && !hasOtherVotes);
                return (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    destVotes={destVotes[p.id] || { up: 0, down: 0 }}
                    myDestVote={myDestVotes[p.id]}
                    dateOptions={pDateOptions}
                    dateVotes={dateVotes}
                    myDateVotes={myDateVotes}
                    canManage={canManage}
                    isRouteLocked={isRouteLocked}
                    isInRoute={isProposalInRoute(p.id)}
                    existingStops={stops}
                    onReactDest={(value) => reactDest.mutate({ proposalId: p.id, value })}
                    onAddDateOption={(input) =>
                      addDateOption.mutate({ proposalId: p.id, ...input })
                    }
                    onVoteDateOption={(dateOptionId, value) =>
                      voteDateOption.mutate({ dateOptionId, value })
                    }
                    onAddToRoute={(input) => {
                      addStop.mutate(input, {
                        onSuccess: () => toast({ title: `${p.destination} added to route! 📍` }),
                      });
                    }}
                    isAddingToRoute={addStop.isPending}
                    isAddingDate={addDateOption.isPending}
                    currentUserId={user?.id}
                    canDelete={canDeleteThis}
                    onDeleteProposal={(proposalId) => {
                      deleteProposal.mutate({ proposalId }, {
                        onSuccess: () => toast({ title: `${p.destination} removed` }),
                        onError: (err) => {
                          if (err.message === "IN_ROUTE") {
                            toast({
                              title: "Can't remove",
                              description: "This destination is already in your route. Remove it from the route first.",
                              variant: "destructive",
                            });
                          } else {
                            toast({ title: "Failed to remove suggestion", variant: "destructive" });
                          }
                        },
                      });
                    }}
                    isDeleting={deleteProposal.isPending}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* No proposals and voting not activated — show subtle suggest button */
        !isRouteLocked && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => setShowVoting(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Suggest a destination
            </Button>
          </div>
        )
      )}
    </div>
  );
}

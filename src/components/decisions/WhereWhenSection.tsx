import { useProposals } from "@/hooks/useProposals";
import { useRouteStops } from "@/hooks/useRouteStops";
import { useAuth } from "@/contexts/AuthContext";
import { ProposalCard } from "./ProposalCard";
import { ProposalForm } from "./ProposalForm";
import { LeadingComboBanner } from "./LeadingComboBanner";
import { TripRoute } from "./TripRoute";
import { MapPin } from "lucide-react";
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
      />

      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Destinations</h2>
        </div>
        {proposals.length > 0 && !isRouteLocked && (
          <ProposalForm
            onSubmit={(data) => {
              createProposal.mutate(data, {
                onSuccess: () => toast({ title: data.startDate ? "Destination & dates suggested! 🎉" : "Destination suggested! 🎉" }),
              });
            }}
            isPending={createProposal.isPending}
          />
        )}
      </div>

      {/* Leading combo banner */}
      <LeadingComboBanner
        leadingCombo={leadingCombo}
        routeStops={stops}
        isRouteLocked={isRouteLocked}
      />

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
                  onSuccess: () => toast({ title: data.startDate ? "Destination & dates suggested! 🎉" : "Destination suggested! 🎉" }),
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
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

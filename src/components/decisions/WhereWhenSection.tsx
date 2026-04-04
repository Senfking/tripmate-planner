import { useState, useMemo } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProposals } from "@/hooks/useProposals";
import { useRouteStops } from "@/hooks/useRouteStops";
import { useAuth } from "@/contexts/AuthContext";
import { ProposalCard } from "./ProposalCard";
import { ProposalForm } from "./ProposalForm";
import { LeadingComboBanner } from "./LeadingComboBanner";
import { TripRoute } from "./TripRoute";
import {
  MapPin,
  Trash2,
  CalendarDays,
  Lock,
  ChevronDown,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

  // Get member count for "n of m members in"
  const { data: memberCount = 0 } = useQuery({
    queryKey: ["trip-member-count", tripId],
    queryFn: async () => {
      const { count } = await supabase
        .from("trip_members")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", tripId);
      return count ?? 0;
    },
  });

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const fmt = (d: string) => format(parseISO(d), "MMM d");

  const sortedStops = useMemo(
    () => [...stops].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [stops]
  );

  const tripStart = sortedStops[0]?.start_date || null;
  const tripEnd = sortedStops.length > 0
    ? [...sortedStops].sort((a, b) => b.end_date.localeCompare(a.end_date))[0]?.end_date
    : null;
  const totalDays =
    tripStart && tripEnd
      ? differenceInDays(parseISO(tripEnd), parseISO(tripStart))
      : 0;

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

  const proposalMap = useMemo(() => {
    const map: Record<string, typeof proposals[0]> = {};
    for (const p of proposals) map[p.id] = p;
    return map;
  }, [proposals]);

  const votingProposals = useMemo(
    () => proposals.filter((p) => !isProposalInRoute(p.id)),
    [proposals, isProposalInRoute]
  );

  const hasVotingProposals = votingProposals.length > 0;
  const hasStops = sortedStops.length > 0;

  return (
    <div className="space-y-3 mt-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Where & When</h2>
        </div>
        {!isRouteLocked && (
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

      {/* Route summary */}
      {hasStops && tripStart && tripEnd && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {totalDays} days · {fmt(tripStart)} – {fmt(tripEnd)}
          </span>
          {isRouteLocked && (
            <Badge className="bg-muted text-muted-foreground text-[10px]">
              <Lock className="h-3 w-3 mr-1" /> Locked
            </Badge>
          )}
        </div>
      )}

      {/* IN ROUTE expandable cards */}
      {sortedStops.map((stop, index) => {
        const reactions = stop.proposal_id ? proposalReactions[stop.proposal_id] : undefined;
        const inCount = reactions?.up || 0;
        const isExpanded = expandedIds.has(`route-${stop.id}`);
        const linkedProposal = stop.proposal_id ? proposalMap[stop.proposal_id] : undefined;

        return (
          <div
            key={stop.id}
            className="rounded-lg border-l-[3px] border-l-primary border border-border bg-card overflow-hidden transition-all"
          >
            {/* Collapsed row */}
            <button
              onClick={() => toggle(`route-${stop.id}`)}
              className="flex items-center gap-3 p-3 w-full text-left"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold shrink-0">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {stop.destination}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {fmt(stop.start_date)} – {fmt(stop.end_date)}
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {/* Expanded content — informational only */}
            {isExpanded && (
              <div className="px-3 pb-3 pt-0 space-y-3 border-t border-border/50">
                {inCount > 0 && (
                  <p className="text-xs text-muted-foreground pt-2">
                    {inCount} {inCount === 1 ? "member was" : "members were"} in
                  </p>
                )}

                {linkedProposal?.note && (
                  <p className="text-xs text-foreground/70 italic">"{linkedProposal.note}"</p>
                )}

                {linkedProposal?.creator_name && (
                  <p className="text-[11px] text-muted-foreground">
                    Originally suggested by {linkedProposal.creator_name}
                  </p>
                )}

                {canManage && !isRouteLocked && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeStop.mutate(
                        { id: stop.id },
                        { onSuccess: () => toast({ title: "Stop removed from route" }) }
                      );
                    }}
                    className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove from route
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Leading combo banner */}
      <LeadingComboBanner
        leadingCombo={leadingCombo}
        routeStops={stops}
        isRouteLocked={isRouteLocked}
      />

      {/* Divider */}
      {hasVotingProposals && hasStops && (
        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 border-t border-border/50" />
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            Still deciding
          </span>
          <div className="flex-1 border-t border-border/50" />
        </div>
      )}

      {/* VOTING expandable cards */}
      {votingProposals.length > 0 && (
        <div className="space-y-3">
          {votingProposals.map((p) => {
            const pDestVotes = destVotes[p.id] || { up: 0, down: 0 };
            const inCount = pDestVotes.up || 0;
            const imIn = myDestVotes[p.id] === "up";
            const isExpanded = expandedIds.has(`vote-${p.id}`);
            const pDateOptions = dateOptionsByProposal(p.id);
            const isCreator = user?.id === p.created_by;
            const hasOtherVotes = inCount > (imIn ? 1 : 0);
            const canDeleteThis = canManage || (isCreator && !hasOtherVotes);

            return (
              <div
                key={p.id}
                className="rounded-lg border-l-[3px] border-l-border border border-border bg-card overflow-hidden transition-all"
              >
                {/* Collapsed summary row */}
                <button
                  onClick={() => toggle(`vote-${p.id}`)}
                  className="flex items-center gap-3 p-3 w-full text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.destination}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      suggested by {p.creator_name || "someone"}
                    </p>
                  </div>
                  {inCount > 0 && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {inCount} in
                    </span>
                  )}
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Expanded content — voting UI */}
                {isExpanded && (
                  <div className="border-t border-border/50">
                    <div className="p-4 space-y-3">
                      {/* "I'm in" button */}
                      <div className="flex items-center gap-3">
                        <Button
                          variant={imIn ? "default" : "outline"}
                          size="sm"
                          className={`gap-1.5 ${imIn ? "" : "text-muted-foreground"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            reactDest.mutate({ proposalId: p.id, value: "up" });
                          }}
                          disabled={isRouteLocked}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          {imIn ? "I'm in!" : "I'm in"}
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {inCount} of {memberCount} members in
                        </span>
                      </div>

                      {p.note && (
                        <p className="text-sm text-foreground/80 italic">"{p.note}"</p>
                      )}

                      {/* Date options — reuse ProposalCard for this */}
                      <ProposalCard
                        proposal={p}
                        destVotes={pDestVotes}
                        myDestVote={myDestVotes[p.id]}
                        dateOptions={pDateOptions}
                        dateVotes={dateVotes}
                        myDateVotes={myDateVotes}
                        canManage={canManage}
                        isRouteLocked={isRouteLocked}
                        isInRoute={false}
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
                        hideDestVoting
                        hideHeader
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!hasStops && !hasVotingProposals && (
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
      )}

      {/* Admin controls footer */}
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
    </div>
  );
}

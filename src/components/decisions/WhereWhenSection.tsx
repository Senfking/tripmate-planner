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
  Trash2,
  CalendarDays,
  Lock,
  ChevronDown,
  UserCheck,
  MapPin,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type Props = {
  tripId: string;
  myRole: string | undefined;
  isRouteLocked: boolean;
};

type TimelineItem =
  | { kind: "confirmed"; stop: ReturnType<typeof useRouteStops>["stops"][0]; sortDate: string }
  | { kind: "voting"; proposal: ReturnType<typeof useProposals>["proposals"][0]; sortDate: string };

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
    const map: Record<string, (typeof proposals)[0]> = {};
    for (const p of proposals) map[p.id] = p;
    return map;
  }, [proposals]);

  const votingProposals = useMemo(
    () => proposals.filter((p) => !isProposalInRoute(p.id)),
    [proposals, isProposalInRoute]
  );

  // Build unified chronological timeline
  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    // Add confirmed stops
    for (const stop of sortedStops) {
      items.push({ kind: "confirmed", stop, sortDate: stop.start_date });
    }

    // Add voting proposals — use their start_date if available, otherwise sort to the end
    for (const p of votingProposals) {
      const sortDate = p.start_date || "9999-12-31";
      items.push({ kind: "voting", proposal: p, sortDate });
    }

    items.sort((a, b) => a.sortDate.localeCompare(b.sortDate));
    return items;
  }, [sortedStops, votingProposals]);

  // Numbering for confirmed stops
  const confirmedStopOrder = useMemo(() => {
    const map = new Map<string, number>();
    let n = 1;
    for (const item of timeline) {
      if (item.kind === "confirmed") {
        map.set(item.stop.id, n++);
      }
    }
    return map;
  }, [timeline]);

  const hasStops = sortedStops.length > 0;
  const hasVotingProposals = votingProposals.length > 0;
  const totalItems = sortedStops.length + votingProposals.length;

  return (
    <div className="space-y-3">
      {/* Route summary header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15">
            <MapPin className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">
            {hasStops
              ? `${sortedStops.length} stop${sortedStops.length !== 1 ? "s" : ""} confirmed`
              : "No stops confirmed yet"}
            {hasVotingProposals &&
              ` · ${votingProposals.length} suggested`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRouteLocked && (
            <Badge className="bg-muted text-muted-foreground text-[10px]">
              <Lock className="h-3 w-3 mr-1" /> Locked
            </Badge>
          )}
          {!isRouteLocked && (
            <ProposalForm
              onSubmit={async (data) => {
                try {
                  await createProposal.mutateAsync(data);
                  toast({
                    title: data.startDate
                      ? "Destination & dates suggested! 🎉"
                      : "Destination suggested! 🎉",
                  });
                } catch {
                  toast({
                    title: "Failed to add destination",
                    variant: "destructive",
                  });
                  throw new Error("failed");
                }
              }}
              isPending={createProposal.isPending}
            />
          )}
        </div>
      </div>

      {/* Unified timeline */}
      {timeline.length > 0 && (
        <div className="space-y-2">
          {timeline.map((item) => {
            if (item.kind === "confirmed") {
              const stop = item.stop;
              const stopNum = confirmedStopOrder.get(stop.id) ?? 1;
              const reactions = stop.proposal_id
                ? proposalReactions[stop.proposal_id]
                : undefined;
              const inCount = reactions?.up || 0;
              const isExpanded = expandedIds.has(`route-${stop.id}`);
              const linkedProposal = stop.proposal_id
                ? proposalMap[stop.proposal_id]
                : undefined;

              return (
                <div
                  key={`route-${stop.id}`}
                  className="rounded-xl border border-primary/20 bg-primary/[0.03] shadow-sm overflow-hidden transition-all"
                >
                  <button
                    onClick={() => toggle(`route-${stop.id}`)}
                    className="flex items-center gap-3 p-3 w-full text-left"
                  >
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                      {stopNum}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {stop.destination}
                        </p>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/5 shrink-0"
                        >
                          <Check className="h-2.5 w-2.5 mr-0.5" />
                          Confirmed
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <CalendarDays className="h-3 w-3" />
                        {fmt(stop.start_date)} – {fmt(stop.end_date)}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0 space-y-3 border-t border-primary/10">
                      {inCount > 0 && (
                        <p className="text-xs text-muted-foreground pt-2">
                          {inCount}{" "}
                          {inCount === 1 ? "member was" : "members were"} in
                        </p>
                      )}
                      {linkedProposal?.note && (
                        <p className="text-xs text-foreground/70 italic">
                          "{linkedProposal.note}"
                        </p>
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
                              {
                                onSuccess: () =>
                                  toast({ title: "Stop removed from route" }),
                              }
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
            }

            // Voting proposal card
            const p = item.proposal;
            const pDestVotes = destVotes[p.id] || { up: 0, down: 0 };
            const inCount = pDestVotes.up || 0;
            const imIn = myDestVotes[p.id] === "up";
            const isExpanded = expandedIds.has(`vote-${p.id}`);
            const pDateOptions = dateOptionsByProposal(p.id);

            return (
              <div
                key={`vote-${p.id}`}
                className="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-all"
              >
                <button
                  onClick={() => toggle(`vote-${p.id}`)}
                  className="flex items-center gap-3 p-3 w-full text-left"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs shrink-0">
                    ?
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.destination}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      suggested by {p.creator_name || "someone"}
                      {p.start_date && ` · ${fmt(p.start_date)}`}
                      {p.start_date && p.end_date && ` – ${fmt(p.end_date)}`}
                    </p>
                  </div>
                  {inCount > 0 && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {inCount} in
                    </span>
                  )}
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isExpanded && (
                  <div className="border-t border-border/50">
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <Button
                          variant={imIn ? "default" : "outline"}
                          size="sm"
                          className={`gap-1.5 ${imIn ? "" : "text-muted-foreground"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            reactDest.mutate({
                              proposalId: p.id,
                              value: "up",
                            });
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
                        onReactDest={(value) =>
                          reactDest.mutate({ proposalId: p.id, value })
                        }
                        onAddDateOption={(input) =>
                          addDateOption.mutate({ proposalId: p.id, ...input })
                        }
                        onVoteDateOption={(dateOptionId, value) =>
                          voteDateOption.mutate({ dateOptionId, value })
                        }
                        onAddToRoute={(input) => {
                          addStop.mutate(input, {
                            onSuccess: () =>
                              toast({
                                title: `${p.destination} added to route! 📍`,
                              }),
                          });
                        }}
                        isAddingToRoute={addStop.isPending}
                        isAddingDate={addDateOption.isPending}
                        currentUserId={user?.id}
                        hideDestVoting
                        hideHeader
                        memberCount={memberCount}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Leading combo banner */}
      <LeadingComboBanner
        leadingCombo={leadingCombo}
        routeStops={stops}
        isRouteLocked={isRouteLocked}
      />

      {/* Empty state */}
      {totalItems === 0 && (
        <div className="text-center py-8 space-y-4">
          <p className="text-muted-foreground">
            No plans suggested yet. Be the first to suggest a destination! 🌍
          </p>
          <div className="flex justify-center">
            <ProposalForm
              onSubmit={async (data) => {
                try {
                  await createProposal.mutateAsync(data);
                  toast({
                    title: data.startDate
                      ? "Destination & dates suggested! 🎉"
                      : "Destination suggested! 🎉",
                  });
                } catch {
                  toast({
                    title: "Failed to add destination",
                    variant: "destructive",
                  });
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

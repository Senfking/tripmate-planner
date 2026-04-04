import { useState, useMemo } from "react";
import { format, parseISO, eachDayOfInterval } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProposals } from "@/hooks/useProposals";
import { useRouteStops } from "@/hooks/useRouteStops";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProposalCard } from "./ProposalCard";
import { ProposalForm } from "./ProposalForm";
import { LeadingComboBanner } from "./LeadingComboBanner";
import { DateRangePicker } from "./DateRangePicker";
import { validateRouteDate } from "./routeValidation";
import {
  Trash2,
  CalendarDays,
  Lock,
  Unlock,
  ChevronDown,
  UserCheck,
  Check,
  Pencil,
  RotateCcw,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
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
  const isMobile = useIsMobile();
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
    updateProposal,
    reactDest,
    addDateOption,
    deleteDateOption,
    voteDateOption,
    deleteProposal,
  } = useProposals(tripId);

  const {
    stops,
    addStop,
    removeStop,
    updateStop,
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

  // Fetch all trip members with profiles for avatar display
  const { data: tripMemberProfiles = [] } = useQuery({
    queryKey: ["trip-member-profiles", tripId],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("trip_members")
        .select("user_id")
        .eq("trip_id", tripId);
      const userIds = (members || []).map((m) => m.user_id);
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase.rpc("get_public_profiles", { _user_ids: userIds });
      return (profiles || []).map((p: any) => ({
        id: p.id,
        display_name: p.display_name || null,
        avatar_url: p.avatar_url || null,
      }));
    },
    enabled: !!tripId && !!user,
  });

  // Fetch which users voted "up" per proposal
  const { data: reactionVoterIds = {} } = useQuery({
    queryKey: ["proposal-reaction-voter-ids", tripId],
    queryFn: async () => {
      const { data: props } = await supabase
        .from("trip_proposals")
        .select("id")
        .eq("trip_id", tripId);
      const propIds = (props || []).map((p: any) => p.id);
      if (propIds.length === 0) return {} as Record<string, Set<string>>;

      const { data: reactions } = await supabase
        .from("proposal_reactions")
        .select("proposal_id, user_id")
        .in("proposal_id", propIds)
        .eq("value", "up");

      const result: Record<string, Set<string>> = {};
      for (const r of reactions || []) {
        if (!result[r.proposal_id]) result[r.proposal_id] = new Set();
        result[r.proposal_id].add(r.user_id);
      }
      return result;
    },
    enabled: !!tripId && !!user,
  });

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editDest, setEditDest] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDateRange, setEditDateRange] = useState<DateRange | undefined>();
  const [unconfirmId, setUnconfirmId] = useState<string | null>(null);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [unlockConfirm, setUnlockConfirm] = useState(false);

  // Proposal (suggestion) editing state
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [editProposalDest, setEditProposalDest] = useState("");
  const [editProposalNote, setEditProposalNote] = useState("");
  const [newDateRange, setNewDateRange] = useState<DateRange | undefined>();
  const [showAddDate, setShowAddDate] = useState(false);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editDateRange, setEditDateRangeForDate] = useState<DateRange | undefined>();

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
      if (votes) map[p.id] = { up: votes.up || 0, down: votes.down || 0 };
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

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];
    for (const stop of sortedStops) {
      items.push({ kind: "confirmed", stop, sortDate: stop.start_date });
    }
    for (const p of votingProposals) {
      items.push({ kind: "voting", proposal: p, sortDate: p.start_date || "9999-12-31" });
    }
    items.sort((a, b) => a.sortDate.localeCompare(b.sortDate));
    return items;
  }, [sortedStops, votingProposals]);

  const confirmedStopOrder = useMemo(() => {
    const map = new Map<string, number>();
    let n = 1;
    for (const item of timeline) {
      if (item.kind === "confirmed") map.set(item.stop.id, n++);
    }
    return map;
  }, [timeline]);

  const totalItems = sortedStops.length + votingProposals.length;

  // Edit helpers
  const startEditing = (stop: typeof stops[0]) => {
    setEditingStopId(stop.id);
    setEditDest(stop.destination);
    setEditNotes(stop.notes || "");
    setEditDateRange({
      from: parseISO(stop.start_date),
      to: parseISO(stop.end_date),
    });
    if (!expandedIds.has(`route-${stop.id}`)) toggle(`route-${stop.id}`);
  };

  const cancelEditing = () => {
    setEditingStopId(null);
    setEditDest("");
    setEditNotes("");
    setEditDateRange(undefined);
  };

  const editValidation = useMemo(() => {
    if (!editingStopId || !editDateRange?.from || !editDateRange?.to)
      return { hardError: null, softWarning: null, info: null };
    const startDate = format(editDateRange.from, "yyyy-MM-dd");
    const endDate = format(editDateRange.to, "yyyy-MM-dd");
    return validateRouteDate(startDate, endDate, stops, editingStopId);
  }, [editingStopId, editDateRange, stops]);

  const saveEdit = (stopId: string) => {
    if (!editDateRange?.from || !editDateRange?.to || !editDest.trim()) return;
    updateStop.mutate(
      {
        id: stopId,
        destination: editDest.trim(),
        notes: editNotes.trim() || null,
        start_date: format(editDateRange.from, "yyyy-MM-dd"),
        end_date: format(editDateRange.to, "yyyy-MM-dd"),
      },
      { onSuccess: () => { toast({ title: "Stop updated! ✏️" }); cancelEditing(); } }
    );
  };

  const handleUnconfirm = () => {
    if (!unconfirmId) return;
    const stop = stops.find((s) => s.id === unconfirmId);
    if (!stop) return;
    const days = eachDayOfInterval({
      start: parseISO(stop.start_date),
      end: parseISO(stop.end_date),
    });
    removeStop.mutate(
      { id: unconfirmId, cleanupDates: days.map((d) => format(d, "yyyy-MM-dd")) },
      { onSuccess: () => { toast({ title: "Stop unconfirmed — back to voting" }); setUnconfirmId(null); } }
    );
  };

  const createProposalHandler = async (data: any) => {
    try {
      await createProposal.mutateAsync(data);
      toast({ title: data.startDate ? "Destination & dates suggested! 🎉" : "Destination suggested! 🎉" });
    } catch {
      toast({ title: "Failed to add destination", variant: "destructive" });
      throw new Error("failed");
    }
  };

  // Confirm wrapper for lock/unlock/unconfirm dialogs
  const ConfirmWrapper = ({
    open, onClose, title, children, actions,
  }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; actions: React.ReactNode }) => {
    if (isMobile) {
      return (
        <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
          <DrawerContent className="px-4 pb-6">
            <DrawerHeader className="text-left px-0"><DrawerTitle>{title}</DrawerTitle></DrawerHeader>
            {children}
            <DrawerFooter className="flex-row justify-end px-0">{actions}</DrawerFooter>
          </DrawerContent>
        </Drawer>
      );
    }
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          {children}
          <DialogFooter>{actions}</DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="space-y-3">
      {/* Lock / unlock controls */}
      {isRouteLocked && isOwner && (
        <button onClick={() => setUnlockConfirm(true)} className="text-xs text-primary underline">
          Unlock to make changes
        </button>
      )}
      {canManage && !isRouteLocked && sortedStops.length > 0 && (
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setLockConfirm(true)}>
            <Lock className="h-3.5 w-3.5" />
            Lock route
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px] text-xs">
              Prevents new destination suggestions. You can unlock anytime.
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Route summary banner */}
      <LeadingComboBanner
        leadingCombo={leadingCombo}
        routeStops={stops}
        isRouteLocked={isRouteLocked}
      />

      {/* Unified timeline */}
      {timeline.length > 0 && (
        <div className="space-y-2">
          {timeline.map((item) => {
            if (item.kind === "confirmed") {
              const stop = item.stop;
              const stopNum = confirmedStopOrder.get(stop.id) ?? 1;
              const reactions = stop.proposal_id ? proposalReactions[stop.proposal_id] : undefined;
              const inCount = reactions?.up || 0;
              const isExpanded = expandedIds.has(`route-${stop.id}`);
              const linkedProposal = stop.proposal_id ? proposalMap[stop.proposal_id] : undefined;
              const isEditing = editingStopId === stop.id;

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
                      className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0 space-y-3 border-t border-primary/10">
                      {!isEditing && (
                        <>
                          {inCount > 0 && (
                            <p className="text-xs text-muted-foreground pt-2">
                              {inCount} {inCount === 1 ? "member was" : "members were"} in
                            </p>
                          )}
                          {stop.notes && (
                            <p className="text-xs text-foreground/70 italic pt-1">"{stop.notes}"</p>
                          )}
                          {linkedProposal?.creator_name && (
                            <p className="text-[11px] text-muted-foreground">
                              Originally suggested by {linkedProposal.creator_name}
                            </p>
                          )}

                          {canManage && !isRouteLocked && (
                            <div className="flex items-center gap-3 pt-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); startEditing(stop); }}
                                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setUnconfirmId(stop.id); }}
                                className="flex items-center gap-1.5 text-xs text-amber-600 hover:underline"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Unconfirm
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const days = eachDayOfInterval({ start: parseISO(stop.start_date), end: parseISO(stop.end_date) });
                                  removeStop.mutate(
                                    { id: stop.id, cleanupDates: days.map((d) => format(d, "yyyy-MM-dd")) },
                                    { onSuccess: () => toast({ title: "Stop removed from route" }) }
                                  );
                                }}
                                className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
                              >
                                <Trash2 className="h-3 w-3" />
                                Remove
                              </button>
                            </div>
                          )}
                        </>
                      )}

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="space-y-3 pt-2">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">Destination</label>
                            <Input
                              value={editDest}
                              onChange={(e) => setEditDest(e.target.value)}
                              className="h-8 text-sm"
                              placeholder="Destination name"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">Dates</label>
                            <DateRangePicker
                              value={editDateRange}
                              onChange={setEditDateRange}
                              className="w-full"
                              placeholder="Select dates"
                            />
                            {editValidation.hardError && (
                              <p className="text-xs text-destructive mt-1">{editValidation.hardError}</p>
                            )}
                            {editValidation.softWarning && !editValidation.hardError && (
                              <p className="text-xs text-amber-600 mt-1">{editValidation.softWarning}</p>
                            )}
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
                            <Textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              className="text-sm min-h-[60px]"
                              placeholder="Optional notes"
                            />
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={cancelEditing}>Cancel</Button>
                            <Button
                              size="sm"
                              onClick={() => saveEdit(stop.id)}
                              disabled={!editDest.trim() || !editDateRange?.from || !editDateRange?.to || !!editValidation.hardError || updateStop.isPending}
                            >
                              {updateStop.isPending ? "Saving…" : "Save"}
                            </Button>
                          </div>
                        </div>
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
            const isEditingThis = editingProposalId === p.id;
            const canEditProposal = !isRouteLocked && (p.created_by === user?.id || canManage);

            return (
              <div
                key={`vote-${p.id}`}
                className="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-all"
              >
                <div className="flex items-center gap-3 p-3 w-full text-left">
                  <button
                    onClick={() => toggle(`vote-${p.id}`)}
                    className="flex items-center gap-3 flex-1 min-w-0"
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
                      </p>
                      {p.note && (
                        <p className="text-[11px] text-foreground/60 italic truncate mt-0.5">
                          "{p.note}"
                        </p>
                      )}
                      {pDateOptions.length > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {pDateOptions.length} date {pDateOptions.length === 1 ? "option" : "options"}
                        </p>
                      )}
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
                  {canEditProposal && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isExpanded) toggle(`vote-${p.id}`);
                        setEditingProposalId(p.id);
                        setEditProposalDest(p.destination);
                        setEditProposalNote(p.note || "");
                      }}
                      className="text-muted-foreground hover:text-primary p-1 shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-border/50">
                    <div className="p-4 space-y-3">
                      {/* Avatars + I'm in */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <div className="flex -space-x-1.5">
                            {tripMemberProfiles.map((member) => {
                              const isIn = reactionVoterIds[p.id]?.has(member.id);
                              return (
                                <Avatar
                                  key={member.id}
                                  className={`h-6 w-6 border-2 border-background transition-opacity ${isIn ? "" : "opacity-30"}`}
                                >
                                  <AvatarImage src={member.avatar_url || undefined} />
                                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                                    {(member.display_name || "?")[0].toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              );
                            })}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {inCount}/{memberCount} in
                          </span>
                        </div>
                        <Button
                          variant={imIn ? "default" : "outline"}
                          size="sm"
                          className={`gap-1.5 shrink-0 ${imIn ? "" : "text-muted-foreground"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            reactDest.mutate({ proposalId: p.id, value: "up" });
                          }}
                          disabled={isRouteLocked}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          {imIn ? "I'm in!" : "I'm in"}
                        </Button>
                      </div>

                      {/* Destination name — inline editable */}
                      {isEditingThis ? (
                        <div className="space-y-2">
                          <Input
                            value={editProposalDest}
                            onChange={(e) => setEditProposalDest(e.target.value)}
                            className="h-8 text-sm font-semibold"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setEditingProposalId(null);
                            }}
                          />
                          <Textarea
                            value={editProposalNote}
                            onChange={(e) => setEditProposalNote(e.target.value)}
                            className="text-sm min-h-[40px]"
                            placeholder="Add a note (optional)"
                            rows={2}
                          />
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditingProposalId(null)}>Cancel</Button>
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={!editProposalDest.trim() || updateProposal.isPending}
                              onClick={() => {
                                updateProposal.mutate(
                                  { proposalId: p.id, destination: editProposalDest.trim(), note: editProposalNote.trim() || null },
                                  { onSuccess: () => { toast({ title: "Updated" }); setEditingProposalId(null); } }
                                );
                              }}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {p.note && (
                            <p className="text-sm text-foreground/70 italic">"{p.note}"</p>
                          )}
                          {!p.note && canEditProposal && (
                            <button
                              onClick={() => {
                                setEditingProposalId(p.id);
                                setEditProposalDest(p.destination);
                                setEditProposalNote("");
                              }}
                              className="text-xs text-muted-foreground hover:text-primary"
                            >
                              + Add a note
                            </button>
                          )}
                        </>
                      )}

                      {/* Date options with delete */}
                      {pDateOptions.length > 0 && (
                        <div className="space-y-2">
                          {pDateOptions.map((d) => {
                            const votes = dateVotes[d.id] || { yes: 0, maybe: 0, no: 0 };
                            const myVote = myDateVotes[d.id];
                            const worksForMe = myVote === "yes";
                            const canDeleteDate = !isRouteLocked && (d.created_by === user?.id || canManage);
                            return (
                              <div key={d.id} className="flex items-center gap-2 rounded-lg bg-muted/30 p-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground">
                                    {fmt(d.start_date)} – {fmt(d.end_date)}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {votes.yes} of {memberCount} available
                                  </p>
                                </div>
                                <Button
                                  variant={worksForMe ? "default" : "outline"}
                                  size="sm"
                                  className={`gap-1.5 shrink-0 ${worksForMe ? "" : "text-muted-foreground"}`}
                                  onClick={() => voteDateOption.mutate({ dateOptionId: d.id, value: "yes" })}
                                  disabled={isRouteLocked}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  {worksForMe ? "Works!" : "Works for me"}
                                </Button>
                                {canDeleteDate && (
                                  <button
                                    onClick={() => deleteDateOption.mutate({ dateOptionId: d.id })}
                                    className="text-muted-foreground hover:text-destructive p-1"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add date suggestion */}
                      {!isRouteLocked && (
                        showAddDate ? (
                          <div className="space-y-2">
                            <DateRangePicker
                              value={newDateRange}
                              onChange={setNewDateRange}
                              className="w-full"
                              placeholder="Pick date range"
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <Button variant="ghost" size="sm" onClick={() => { setShowAddDate(false); setNewDateRange(undefined); }}>Cancel</Button>
                              <Button
                                size="sm"
                                disabled={!newDateRange?.from || !newDateRange?.to || addDateOption.isPending}
                                onClick={() => {
                                  if (!newDateRange?.from || !newDateRange?.to) return;
                                  addDateOption.mutate(
                                    { proposalId: p.id, startDate: format(newDateRange.from, "yyyy-MM-dd"), endDate: format(newDateRange.to, "yyyy-MM-dd") },
                                    { onSuccess: () => { setShowAddDate(false); setNewDateRange(undefined); toast({ title: "Date option added" }); } }
                                  );
                                }}
                              >
                                {addDateOption.isPending ? "Adding..." : "Add dates"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs text-muted-foreground"
                            onClick={() => setShowAddDate(true)}
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            Suggest dates
                          </Button>
                        )
                      )}

                      {/* Confirm destination & dates — only for admins */}
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
                        onAddDateOption={(input) => addDateOption.mutate({ proposalId: p.id, ...input })}
                        onVoteDateOption={(dateOptionId, value) => voteDateOption.mutate({ dateOptionId, value })}
                        onAddToRoute={(input) => {
                          addStop.mutate(input, {
                            onSuccess: () => toast({ title: `${p.destination} added to route` }),
                          });
                        }}
                        isAddingToRoute={addStop.isPending}
                        isAddingDate={addDateOption.isPending}
                        currentUserId={user?.id}
                        hideDestVoting
                        hideHeader
                        memberCount={memberCount}
                      />

                      {/* Delete suggestion */}
                      {canEditProposal && (
                        <button
                          onClick={() => {
                            deleteProposal.mutate({ proposalId: p.id });
                            toast({ title: "Suggestion removed" });
                          }}
                          className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove suggestion
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}




      {/* Suggest a destination — full width at the bottom */}
      {!isRouteLocked && totalItems > 0 && (
        <ProposalForm
          onSubmit={createProposalHandler}
          isPending={createProposal.isPending}
          fullWidth
        />
      )}

      {/* Empty state */}
      {totalItems === 0 && (
        <div className="text-center py-8 space-y-4">
          <p className="text-muted-foreground">
            No plans suggested yet. Be the first to suggest a destination! 🌍
          </p>
          <ProposalForm
            onSubmit={createProposalHandler}
            isPending={createProposal.isPending}
            fullWidth
          />
        </div>
      )}

      {/* Unconfirm dialog */}
      <ConfirmWrapper
        open={!!unconfirmId}
        onClose={() => setUnconfirmId(null)}
        title="Unconfirm stop"
        actions={
          <>
            <Button variant="ghost" onClick={() => setUnconfirmId(null)}>Cancel</Button>
            <Button variant="default" onClick={handleUnconfirm} disabled={removeStop.isPending}>
              {removeStop.isPending ? "Unconfirming…" : "Unconfirm"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          This will move the destination back to suggestions for voting.
          {unconfirmId && stops.find((s) => s.id === unconfirmId)?.proposal_id
            ? " The original proposal will reappear."
            : " A new suggestion will be created."}
        </p>
      </ConfirmWrapper>

      {/* Lock confirm */}
      <ConfirmWrapper
        open={lockConfirm}
        onClose={() => setLockConfirm(false)}
        title="Lock route"
        actions={
          <>
            <Button variant="ghost" onClick={() => setLockConfirm(false)}>Cancel</Button>
            <Button onClick={() => { lockRoute.mutate(); setLockConfirm(false); toast({ title: "Route locked 🔒" }); }} disabled={lockRoute.isPending}>
              {lockRoute.isPending ? "Locking…" : "Lock route"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Lock the trip route? Members won't be able to suggest new destinations. You can unlock it again later.
        </p>
      </ConfirmWrapper>

      {/* Unlock confirm */}
      <ConfirmWrapper
        open={unlockConfirm}
        onClose={() => setUnlockConfirm(false)}
        title="Unlock route"
        actions={
          <>
            <Button variant="ghost" onClick={() => setUnlockConfirm(false)}>Cancel</Button>
            <Button onClick={() => { unlockRoute.mutate(); setUnlockConfirm(false); toast({ title: "Route unlocked — you can now make changes" }); }} disabled={unlockRoute.isPending}>
              Unlock route
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Unlock the route? This will allow changes to stops and new destination suggestions.
        </p>
      </ConfirmWrapper>
    </div>
  );
}

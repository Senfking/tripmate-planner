import { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ThumbsUp,
  ThumbsDown,
  Check,
  HelpCircle,
  X,
  Route,
  ChevronDown,
  ChevronUp,
  Plus,
  CalendarDays,
} from "lucide-react";
import { AddToRouteDrawer } from "./AddToRouteDrawer";
import type { Proposal, DateOption, DateVotes } from "@/hooks/useProposals";
import type { RouteStop } from "@/hooks/useRouteStops";

type Props = {
  proposal: Proposal;
  destVotes: { up: number; down: number };
  myDestVote: string | undefined;
  dateOptions: DateOption[];
  dateVotes: DateVotes;
  myDateVotes: Record<string, string>;
  canManage: boolean;
  isRouteLocked: boolean;
  isInRoute: boolean;
  existingStops: RouteStop[];
  onReactDest: (value: string) => void;
  onAddDateOption: (input: { startDate: string; endDate: string }) => void;
  onVoteDateOption: (dateOptionId: string, value: string) => void;
  onAddToRoute: (input: {
    destination: string;
    start_date: string;
    end_date: string;
    position: number;
    notes?: string;
    proposal_id?: string;
  }) => void;
  isAddingToRoute: boolean;
  isAddingDate: boolean;
};

const DATE_VOTE_BUTTONS = [
  { value: "yes", icon: Check, label: "Yes", activeClass: "bg-green-600/10 border-green-600 text-green-700" },
  { value: "maybe", icon: HelpCircle, label: "Maybe", activeClass: "bg-amber-500/10 border-amber-500 text-amber-600" },
  { value: "no", icon: X, label: "No", activeClass: "bg-destructive/10 border-destructive text-destructive" },
] as const;

export function ProposalCard({
  proposal,
  destVotes,
  myDestVote,
  dateOptions,
  dateVotes,
  myDateVotes,
  canManage,
  isRouteLocked,
  isInRoute,
  existingStops,
  onReactDest,
  onAddDateOption,
  onVoteDateOption,
  onAddToRoute,
  isAddingToRoute,
  isAddingDate,
}: Props) {
  const fmt = (d: string) => format(new Date(d + "T00:00:00"), "MMM d");
  const isFrozen = isRouteLocked;

  const [datesExpanded, setDatesExpanded] = useState(false);
  const [showDateForm, setShowDateForm] = useState(false);
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [addToRouteOpen, setAddToRouteOpen] = useState(false);

  const handleAddDate = () => {
    if (!newStartDate || !newEndDate) return;
    onAddDateOption({ startDate: newStartDate, endDate: newEndDate });
    setNewStartDate("");
    setNewEndDate("");
    setShowDateForm(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 relative transition-opacity">
      {/* In route badge */}
      {isInRoute && (
        <Badge className="absolute top-3 right-3 bg-emerald-100 text-emerald-700 border-emerald-200">
          <Check className="h-3 w-3 mr-1" /> In route
        </Badge>
      )}

      {/* Destination + creator */}
      <div>
        <h4 className="font-semibold text-foreground text-base">{proposal.destination}</h4>
        <p className="text-xs text-muted-foreground">Suggested by {proposal.creator_name}</p>
      </div>

      {proposal.note && (
        <p className="text-sm text-foreground/80 italic">"{proposal.note}"</p>
      )}

      {/* Destination voting */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onReactDest("up")}
          disabled={isFrozen}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm border transition-colors ${
            myDestVote === "up"
              ? "bg-primary/10 border-primary text-primary font-medium"
              : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
          } ${isFrozen ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          <span>{destVotes.up || 0}</span>
        </button>
        <button
          onClick={() => onReactDest("down")}
          disabled={isFrozen}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm border transition-colors ${
            myDestVote === "down"
              ? "bg-destructive/10 border-destructive text-destructive font-medium"
              : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
          } ${isFrozen ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          <span>{destVotes.down || 0}</span>
        </button>
      </div>

      {/* Date options section */}
      <div className="border-t border-border pt-3">
        <button
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
          onClick={() => setDatesExpanded(!datesExpanded)}
        >
          <CalendarDays className="h-4 w-4" />
          Date options ({dateOptions.length})
          {datesExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 ml-auto" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 ml-auto" />
          )}
        </button>

        {datesExpanded && (
          <div className="mt-3 space-y-2">
            {dateOptions.length === 0 && !showDateForm && (
              <p className="text-xs text-muted-foreground italic">No date options yet</p>
            )}

            {dateOptions.map((d) => {
              const votes = dateVotes[d.id] || { yes: 0, maybe: 0, no: 0 };
              const myVote = myDateVotes[d.id];
              return (
                <div key={d.id} className="flex flex-col gap-2 rounded-lg bg-muted/30 p-3">
                  <p className="text-sm font-medium text-foreground">
                    {fmt(d.start_date)} – {fmt(d.end_date)}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {DATE_VOTE_BUTTONS.map(({ value, icon: Icon, label, activeClass }) => {
                      const isSelected = myVote === value;
                      const count = votes[value as keyof typeof votes] || 0;
                      return (
                        <button
                          key={value}
                          onClick={() => onVoteDateOption(d.id, value)}
                          disabled={isFrozen}
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border transition-colors ${
                            isSelected
                              ? activeClass
                              : "bg-background border-border text-muted-foreground hover:bg-muted"
                          } ${isFrozen ? "opacity-60 cursor-not-allowed" : ""}`}
                        >
                          <Icon className="h-3 w-3" />
                          <span>{label}</span>
                          {count > 0 && <span className="font-semibold">{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Add date option inline form */}
            {!isFrozen && (
              <>
                {showDateForm ? (
                  <div className="space-y-2 rounded-lg bg-muted/20 p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Start</Label>
                        <Input
                          type="date"
                          value={newStartDate}
                          onChange={(e) => setNewStartDate(e.target.value)}
                          className="text-base min-h-[44px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">End</Label>
                        <Input
                          type="date"
                          value={newEndDate}
                          onChange={(e) => setNewEndDate(e.target.value)}
                          className="text-base min-h-[44px]"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleAddDate}
                        disabled={!newStartDate || !newEndDate || isAddingDate}
                        className="text-xs"
                      >
                        {isAddingDate ? "Adding…" : "Add dates"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowDateForm(false)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setShowDateForm(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Suggest dates
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Add to route button — owner/admin only */}
      {canManage && !isRouteLocked && !isInRoute && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          onClick={() => setAddToRouteOpen(true)}
        >
          <Route className="h-3.5 w-3.5" />
          Add to route
        </Button>
      )}

      {/* Add to route drawer */}
      <AddToRouteDrawer
        open={addToRouteOpen}
        onOpenChange={setAddToRouteOpen}
        existingStops={existingStops}
        defaultDestination={proposal.destination}
        proposalId={proposal.id}
        onSubmit={(input) => {
          onAddToRoute(input);
          setAddToRouteOpen(false);
        }}
        isPending={isAddingToRoute}
      />
    </div>
  );
}

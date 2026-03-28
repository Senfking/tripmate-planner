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
  Crown,
  ChevronDown,
  ChevronUp,
  Plus,
  CalendarDays,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Proposal, DateOption, DateVotes } from "@/hooks/useProposals";

type Props = {
  proposal: Proposal;
  destVotes: { up: number; down: number };
  myDestVote: string | undefined;
  dateOptions: DateOption[];
  dateVotes: DateVotes;
  myDateVotes: Record<string, string>;
  hasConfirmed: boolean;
  canManage: boolean;
  onReactDest: (value: string) => void;
  onAddDateOption: (input: { startDate: string; endDate: string }) => void;
  onVoteDateOption: (dateOptionId: string, value: string) => void;
  onConfirm: (dateOptionId: string) => void;
  isConfirming: boolean;
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
  hasConfirmed,
  canManage,
  onReactDest,
  onAddDateOption,
  onVoteDateOption,
  onConfirm,
  isConfirming,
  isAddingDate,
}: Props) {
  const fmt = (d: string) => format(new Date(d + "T00:00:00"), "MMM d");
  const isGreyedOut = hasConfirmed && !proposal.adopted;
  const isFrozen = hasConfirmed;

  const [datesExpanded, setDatesExpanded] = useState(false);
  const [showDateForm, setShowDateForm] = useState(false);
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedDateId, setSelectedDateId] = useState<string>("");

  const handleAddDate = () => {
    if (!newStartDate || !newEndDate) return;
    onAddDateOption({ startDate: newStartDate, endDate: newEndDate });
    setNewStartDate("");
    setNewEndDate("");
    setShowDateForm(false);
  };

  const handleOpenConfirm = () => {
    // Pre-select top-voted date
    const topDate = dateOptions[0]; // already sorted by yes count
    setSelectedDateId(topDate?.id || "");
    setConfirmOpen(true);
  };

  return (
    <div
      className={`rounded-xl border border-border bg-card p-4 space-y-3 relative transition-opacity ${
        isGreyedOut ? "opacity-50" : ""
      }`}
    >
      {/* Confirmed badge */}
      {proposal.adopted && (
        <Badge className="absolute top-3 right-3 bg-green-600 text-white">
          <Check className="h-3 w-3 mr-1" /> Confirmed
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

      {isGreyedOut && (
        <p className="text-xs text-muted-foreground font-medium">Another plan was confirmed</p>
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

      {/* Confirm button — owner/admin only, needs at least one date option */}
      {canManage && !hasConfirmed && dateOptions.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          onClick={handleOpenConfirm}
        >
          <Crown className="h-3.5 w-3.5" />
          Confirm this plan
        </Button>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm plan</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confirm <span className="font-semibold text-foreground">{proposal.destination}</span>?
            This will lock the destination and dates for everyone.
          </p>
          {dateOptions.length > 1 ? (
            <div className="space-y-1.5">
              <Label>Select dates</Label>
              <Select value={selectedDateId} onValueChange={setSelectedDateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose date range" />
                </SelectTrigger>
                <SelectContent>
                  {dateOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {fmt(d.start_date)} – {fmt(d.end_date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            dateOptions.length === 1 && (
              <p className="text-sm font-medium">
                {fmt(dateOptions[0].start_date)} – {fmt(dateOptions[0].end_date)}
              </p>
            )
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const dateId = selectedDateId || dateOptions[0]?.id;
                if (dateId) {
                  onConfirm(dateId);
                  setConfirmOpen(false);
                }
              }}
              disabled={isConfirming || (!selectedDateId && dateOptions.length > 1)}
            >
              {isConfirming ? "Confirming…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import {
  Check,
  Route,
  Trophy,
} from "lucide-react";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { DateRangePicker } from "./DateRangePicker";
import { validateRouteDate } from "./routeValidation";
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
    notes?: string;
    proposal_id?: string;
  }) => void;
  isAddingToRoute: boolean;
  isAddingDate: boolean;
  currentUserId?: string;
  canDelete?: boolean;
  onDeleteProposal?: (proposalId: string) => void;
  isDeleting?: boolean;
  hideDestVoting?: boolean;
  hideHeader?: boolean;
  memberCount?: number;
};

// Kept for reference — date voting now uses a single "Works for me" toggle

function getTopPickIndex(dateOptions: DateOption[], dateVotes: DateVotes): number {
  if (dateOptions.length === 0) return -1;

  let bestIdx = 0;
  let bestYes = -1;
  let bestNo = Infinity;

  dateOptions.forEach((d, i) => {
    const votes = dateVotes[d.id] || { yes: 0, maybe: 0, no: 0 };
    const yes = votes.yes;
    const no = votes.no;
    if (yes > bestYes || (yes === bestYes && no < bestNo)) {
      bestYes = yes;
      bestNo = no;
      bestIdx = i;
    }
  });

  return bestIdx;
}

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
  currentUserId,
  canDelete,
  onDeleteProposal,
  isDeleting,
  hideDestVoting,
  hideHeader,
  memberCount = 0,
}: Props) {
  const fmt = (d: string) => format(new Date(d + "T00:00:00"), "MMM d");
  const isFrozen = isRouteLocked;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [datesExpanded, setDatesExpanded] = useState(false);
  const [showDateForm, setShowDateForm] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Inline confirm panel state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedDateOptionId, setSelectedDateOptionId] = useState<string | null>(null);
  const [manualDateRange, setManualDateRange] = useState<DateRange | undefined>();

  // Pre-populate top pick when confirm panel opens
  const topPickIdx = useMemo(() => getTopPickIndex(dateOptions, dateVotes), [dateOptions, dateVotes]);

  const handleOpenConfirm = () => {
    if (dateOptions.length > 0) {
      setSelectedDateOptionId(dateOptions[topPickIdx]?.id || null);
      setManualDateRange(undefined);
    } else {
      setSelectedDateOptionId(null);
      // Pre-fill start date from last route stop
      if (existingStops.length > 0) {
        const sorted = [...existingStops].sort((a, b) => b.end_date.localeCompare(a.end_date));
        const lastEnd = sorted[0]?.end_date;
        if (lastEnd) {
          setManualDateRange({ from: parseISO(lastEnd), to: undefined });
        } else {
          setManualDateRange(undefined);
        }
      } else {
        setManualDateRange(undefined);
      }
    }
    setConfirmOpen(true);
  };

  // Determine dates for validation
  const confirmStartDate = selectedDateOptionId
    ? dateOptions.find((d) => d.id === selectedDateOptionId)?.start_date
    : manualDateRange?.from
    ? format(manualDateRange.from, "yyyy-MM-dd")
    : undefined;
  const confirmEndDate = selectedDateOptionId
    ? dateOptions.find((d) => d.id === selectedDateOptionId)?.end_date
    : manualDateRange?.to
    ? format(manualDateRange.to, "yyyy-MM-dd")
    : undefined;

  const validation =
    confirmStartDate && confirmEndDate
      ? validateRouteDate(confirmStartDate, confirmEndDate, existingStops)
      : { hardError: null, softWarning: null, info: null };

  const canConfirm = !!(confirmStartDate && confirmEndDate && !validation.hardError);

  const handleConfirmRoute = () => {
    if (!canConfirm || !confirmStartDate || !confirmEndDate) return;
    onAddToRoute({
      destination: proposal.destination,
      start_date: confirmStartDate,
      end_date: confirmEndDate,
      proposal_id: proposal.id,
    });
    setConfirmOpen(false);
  };

  const handleAddDate = () => {
    if (!dateRange?.from || !dateRange?.to) return;
    onAddDateOption({
      startDate: format(dateRange.from, "yyyy-MM-dd"),
      endDate: format(dateRange.to, "yyyy-MM-dd"),
    });
    setDateRange(undefined);
    setShowDateForm(false);
  };

  return (
    <div className="space-y-3 relative transition-opacity">

      {/* Destination + creator */}
      {!hideHeader && (
        <div className="pr-20">
          <h4 className="font-semibold text-foreground text-base">{proposal.destination}</h4>
          <p className="text-xs text-muted-foreground">Suggested by {proposal.creator_name}</p>
        </div>
      )}

      {!hideHeader && proposal.note && (
        <p className="text-sm text-foreground/80 italic">"{proposal.note}"</p>
      )}

      {/* Destination voting — hidden when parent provides its own "I'm in" button */}
      {!hideDestVoting && (
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
      )}

      {/* Date options — "Works for me" toggles */}
      {dateOptions.length > 0 && (
        <div className="space-y-2">
          {dateOptions.map((d) => {
            const votes = dateVotes[d.id] || { yes: 0, maybe: 0, no: 0 };
            const myVote = myDateVotes[d.id];
            const worksForMe = myVote === "yes";
            const availableCount = votes.yes || 0;
            const votingDisabled = isFrozen || isInRoute;
            return (
              <div key={d.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {fmt(d.start_date)} – {fmt(d.end_date)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {availableCount} of {memberCount} available
                  </p>
                </div>
                <Button
                  variant={worksForMe ? "default" : "outline"}
                  size="sm"
                  className={`gap-1.5 shrink-0 ${worksForMe ? "" : "text-muted-foreground"}`}
                  onClick={() => onVoteDateOption(d.id, "yes")}
                  disabled={votingDisabled}
                >
                  <Check className="h-3.5 w-3.5" />
                  {worksForMe ? "Works for me!" : "Works for me"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add to route button — owner/admin only */}
      {canManage && !isRouteLocked && !isInRoute && !confirmOpen && (
        <div className="flex justify-end md:justify-start">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={handleOpenConfirm}
          >
            <Route className="h-3.5 w-3.5" />
            Add to route 🗺️
          </Button>
        </div>
      )}

      {/* Inline confirm panel */}
      {confirmOpen && canManage && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <h5 className="font-semibold text-sm text-foreground">
            Add "{proposal.destination}" to route
          </h5>

          {dateOptions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                Select the dates for this stop:
              </p>
              {dateOptions.map((d, i) => {
                const votes = dateVotes[d.id] || { yes: 0, maybe: 0, no: 0 };
                const isTopPick = i === topPickIdx;
                const isSelected = selectedDateOptionId === d.id;
                return (
                  <label
                    key={d.id}
                    className={`flex items-center gap-3 rounded-lg p-3 cursor-pointer border transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`route-date-${proposal.id}`}
                      checked={isSelected}
                      onChange={() => setSelectedDateOptionId(d.id)}
                      className="accent-[hsl(var(--primary))]"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        {fmt(d.start_date)} – {fmt(d.end_date)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        (✅ Yes {votes.yes} · 🤔 Maybe {votes.maybe})
                      </span>
                    </div>
                    {isTopPick && (
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <Trophy className="h-3 w-3" />
                        Top pick
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                No date options yet — pick dates manually:
              </p>
              <DateRangePicker
                value={manualDateRange}
                onChange={setManualDateRange}
                className="w-full"
                placeholder="Select date range"
              />
            </div>
          )}

          {/* Validation messages */}
          {validation.hardError && (
            <p className="text-sm text-destructive">{validation.hardError}</p>
          )}
          {validation.info && !validation.hardError && (
            <p className="text-sm text-muted-foreground">{validation.info}</p>
          )}
          {validation.softWarning && !validation.hardError && (
            <p className="text-sm text-amber-600">{validation.softWarning}</p>
          )}

          <div className="flex items-center gap-3 justify-end md:justify-start">
            <button
              onClick={() => setConfirmOpen(false)}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Cancel
            </button>
            <Button
              size="sm"
              onClick={handleConfirmRoute}
              disabled={!canConfirm || isAddingToRoute}
            >
              {isAddingToRoute
                ? "Adding…"
                : validation.softWarning
                ? "Confirm anyway"
                : "Confirm and add to route"}
            </Button>
          </div>
        </div>
      )}
      {/* Delete confirmation modal/drawer */}
      {canDelete && onDeleteProposal && (
        <ResponsiveModal
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Remove ${proposal.destination} suggestion?`}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will also remove any date options and votes on this card.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  onDeleteProposal(proposal.id);
                  setDeleteOpen(false);
                }}
                disabled={isDeleting}
                className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Removing…" : "Remove"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </ResponsiveModal>
      )}
    </div>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Plus, ThumbsUp, ThumbsDown, Check, HelpCircle, X, Trash2, Pencil, MoreVertical } from "lucide-react";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PollWithOptions, VoteTally } from "@/hooks/useDecisionPolls";

type Props = {
  poll: PollWithOptions;
  stepLabel?: string;
  disabled?: boolean;
  disabledMessage?: string;
  voteTally: VoteTally;
  myVotes: Record<string, string>;
  canManage: boolean;
  onAddOption: (input: { label: string; startDate?: string; endDate?: string }) => void;
  onVote: (optionId: string, value: string) => void;
  onLock: () => void;
  onDelete?: () => void;
  onUpdateTitle?: (title: string) => void;
  isAddingOption: boolean;
  isLocking: boolean;
  isHighlighted?: boolean;
};

const DEST_BUTTONS = [
  { value: "up", icon: ThumbsUp, label: "👍" },
  { value: "down", icon: ThumbsDown, label: "👎" },
];

const DATE_BUTTONS = [
  { value: "yes", icon: Check, label: "Yes", color: "text-green-600" },
  { value: "maybe", icon: HelpCircle, label: "Maybe", color: "text-amber-500" },
  { value: "no", icon: X, label: "No", color: "text-destructive" },
];

export function StructuredPoll({
  poll,
  stepLabel,
  disabled,
  disabledMessage,
  voteTally,
  myVotes,
  canManage,
  onAddOption,
  onVote,
  onLock,
  onDelete,
  onUpdateTitle,
  isAddingOption,
  isLocking,
  isHighlighted,
}: Props) {
  const isLocked = poll.status === "locked";
  const isDate = poll.type === "date";
  const isPref = poll.type === "preference";
  const voteButtons = isDate || isPref ? DATE_BUTTONS : DEST_BUTTONS;

  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(poll.title);

  const handleAdd = () => {
    if (!newLabel.trim() && !isDate) return;
    const label = isDate ? `${newStart} → ${newEnd}` : newLabel.trim();
    onAddOption({
      label,
      startDate: isDate ? newStart : undefined,
      endDate: isDate ? newEnd : undefined,
    });
    setNewLabel("");
    setNewStart("");
    setNewEnd("");
    setShowAddForm(false);
  };

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle.trim() !== poll.title) {
      onUpdateTitle?.(editTitle.trim());
    }
    setIsEditing(false);
  };

  return (
    <div id={`poll-${poll.id}`} className={`rounded-xl border border-border bg-card p-4 space-y-3 ${disabled ? "opacity-50 pointer-events-none" : ""} ${isHighlighted ? "animate-highlight-pulse" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        {stepLabel && (
          <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {stepLabel}
          </span>
        )}
        {isEditing ? (
          <div className="flex-1 flex items-center gap-2">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTitle();
                if (e.key === "Escape") setIsEditing(false);
              }}
            />
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={handleSaveTitle}>
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <h4 className="font-semibold text-foreground text-sm flex-1">{poll.title}</h4>
        )}
        {isLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
        {canManage && !isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setEditTitle(poll.title); setIsEditing(true); }}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Edit title
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete?.()}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete poll
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {disabled && disabledMessage && (
        <p className="text-sm text-muted-foreground italic">{disabledMessage}</p>
      )}

      {/* Options */}
      {poll.options.map((opt) => {
        const tally = voteTally[opt.id] || {};
        const myVote = myVotes[opt.id];
        const displayLabel = isDate && opt.start_date && opt.end_date
          ? `${format(new Date(opt.start_date + "T00:00:00"), "MMM d")} – ${format(new Date(opt.end_date + "T00:00:00"), "MMM d")}`
          : opt.label;

        if (isPref) {
          const pickCount = tally["yes"] || 0;
          const isPicked = myVote === "yes";
          return (
            <button
              key={opt.id}
              onClick={() => onVote(opt.id, "yes")}
              disabled={isLocked}
              className={`flex items-center justify-between w-full rounded-lg px-3 py-2.5 text-sm border transition-colors ${
                isPicked
                  ? "bg-primary/10 border-primary text-primary font-medium"
                  : "bg-muted/30 border-border text-foreground hover:bg-muted/50"
              } ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <span>{displayLabel}</span>
              {pickCount > 0 && (
                <span className="text-xs text-muted-foreground font-medium">
                  {pickCount} vote{pickCount !== 1 ? "s" : ""}
                </span>
              )}
            </button>
          );
        }

        return (
          <div key={opt.id} className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-foreground font-medium min-w-0 flex-1 truncate">
              {displayLabel}
            </span>
            <div className="flex items-center gap-1.5">
              {voteButtons.map(({ value, label }) => {
                const isSelected = myVote === value;
                const count = tally[value] || 0;
                return (
                  <button
                    key={value}
                    onClick={() => onVote(opt.id, value)}
                    disabled={isLocked}
                    className={`flex items-center gap-0.5 rounded-full px-2 py-1 text-xs border transition-colors ${
                      isSelected
                        ? "bg-primary/10 border-primary text-primary font-medium"
                        : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                    } ${isLocked ? "cursor-not-allowed" : ""}`}
                  >
                    <span>{label}</span>
                    {count > 0 && <span className="font-semibold">{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Add option form */}
      {!isLocked && !disabled && (
        <>
          {showAddForm ? (
            <div className="space-y-2 pt-1">
              {isDate ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Start</Label>
                    <Input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End</Label>
                    <Input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
                  </div>
                </div>
              ) : (
                <Input
                  placeholder={isPref ? "Answer option" : "e.g. Barcelona"}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              )}
              <div className="flex gap-2 justify-end md:justify-start">
                <Button size="sm" onClick={handleAdd} disabled={isAddingOption || (isDate ? !newStart || !newEnd : !newLabel.trim())}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end md:justify-start">
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setShowAddForm(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add option
              </Button>
            </div>
          )}
        </>
      )}

      {/* Lock button */}
      {canManage && !isLocked && !disabled && poll.options.length > 0 && (
        <div className="flex justify-end md:justify-start">
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={onLock} disabled={isLocking}>
            <Lock className="h-3.5 w-3.5" />
            {isLocking ? "Locking…" : "Lock poll"}
          </Button>
        </div>
      )}
    </div>
  );
}

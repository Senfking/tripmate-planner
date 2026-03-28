import { useState, useEffect } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { AlertTriangle } from "lucide-react";
import type { RouteStop } from "@/hooks/useRouteStops";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingStops: RouteStop[];
  defaultDestination?: string;
  proposalId?: string;
  onSubmit: (input: {
    destination: string;
    start_date: string;
    end_date: string;
    position: number;
    notes?: string;
    proposal_id?: string;
  }) => void;
  isPending: boolean;
};

export function AddToRouteDrawer({
  open,
  onOpenChange,
  existingStops,
  defaultDestination,
  proposalId,
  onSubmit,
  isPending,
}: Props) {
  const isMobile = useIsMobile();
  const [destination, setDestination] = useState(defaultDestination || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [gapWarning, setGapWarning] = useState<string | null>(null);
  const [gapDismissed, setGapDismissed] = useState(false);

  const nextPosition = existingStops.length + 1;

  useEffect(() => {
    if (open) {
      setDestination(defaultDestination || "");
      setNotes("");
      setGapDismissed(false);
      if (existingStops.length > 0) {
        const lastStop = [...existingStops].sort(
          (a, b) => b.position - a.position
        )[0];
        setStartDate(lastStop.end_date);
        setEndDate("");
      } else {
        setStartDate("");
        setEndDate("");
      }
    }
  }, [open, defaultDestination, existingStops]);

  const endBeforeStart = !!(startDate && endDate && endDate <= startDate);
  const overlap = existingStops.find(
    (s) =>
      startDate && endDate && startDate < s.end_date && endDate > s.start_date
  );

  useEffect(() => {
    if (!startDate || existingStops.length === 0) {
      setGapWarning(null);
      return;
    }
    const sorted = [...existingStops].sort((a, b) =>
      b.end_date.localeCompare(a.end_date)
    );
    const lastEnd = sorted[0]?.end_date;
    if (lastEnd && startDate > lastEnd) {
      const gapDays = differenceInDays(
        parseISO(startDate),
        parseISO(lastEnd)
      );
      if (gapDays > 0) {
        setGapWarning(
          `${gapDays}-day gap between previous stop and this one. Intentional? (e.g. travel day)`
        );
      } else {
        setGapWarning(null);
      }
    } else {
      setGapWarning(null);
    }
  }, [startDate, existingStops]);

  const canSubmit =
    destination.trim() && startDate && endDate && !endBeforeStart && !overlap;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      destination: destination.trim(),
      start_date: startDate,
      end_date: endDate,
      position: nextPosition,
      notes: notes.trim() || undefined,
      proposal_id: proposalId,
    });
  };

  const formContent = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Destination</Label>
        <Input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="e.g. Barcelona"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-base min-h-[44px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label>End date</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-base min-h-[44px]"
          />
        </div>
      </div>

      {endBeforeStart && (
        <p className="text-sm text-destructive">
          End date must be after start date
        </p>
      )}
      {overlap && (
        <p className="text-sm text-destructive">
          These dates overlap with Stop {overlap.position} (
          {overlap.destination}). Please choose different dates.
        </p>
      )}
      {gapWarning && !gapDismissed && (
        <div className="flex items-start gap-2 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p>⚠️ {gapWarning}</p>
            <button
              onClick={() => setGapDismissed(true)}
              className="text-xs underline mt-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Day trip from main base"
          rows={2}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Adding as Stop {nextPosition}
      </p>

      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending}
      >
        {isPending ? "Adding…" : "Add to route"}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="text-left px-0">
            <DrawerTitle>Add to route</DrawerTitle>
          </DrawerHeader>
          {formContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to route</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

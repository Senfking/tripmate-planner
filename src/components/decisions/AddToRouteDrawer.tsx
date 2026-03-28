import { useState, useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
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
import { DateRangePicker } from "./DateRangePicker";
import { validateRouteDate } from "./routeValidation";
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [notes, setNotes] = useState("");

  const nextPosition = existingStops.length + 1;

  useEffect(() => {
    if (open) {
      setDestination(defaultDestination || "");
      setNotes("");
      // Pre-fill start date from last stop
      if (existingStops.length > 0) {
        const lastStop = [...existingStops].sort(
          (a, b) => b.position - a.position
        )[0];
        setDateRange({ from: parseISO(lastStop.end_date), to: undefined });
      } else {
        setDateRange(undefined);
      }
    }
  }, [open, defaultDestination, existingStops]);

  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "";

  const validation = useMemo(
    () =>
      startDate && endDate
        ? validateRouteDate(startDate, endDate, existingStops)
        : { hardError: null, softWarning: null },
    [startDate, endDate, existingStops]
  );

  const canSubmit =
    destination.trim() && startDate && endDate && !validation.hardError;

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
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="e.g. Barcelona"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Dates</Label>
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          className="w-full"
          placeholder="Select date range"
        />
      </div>

      {/* Validation messages */}
      {validation.hardError && (
        <p className="text-sm text-destructive">{validation.hardError}</p>
      )}
      {validation.softWarning && !validation.hardError && (
        <p className="text-sm text-amber-600">{validation.softWarning}</p>
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
        {isPending
          ? "Adding…"
          : validation.softWarning
          ? "Confirm anyway"
          : "Add to route"}
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

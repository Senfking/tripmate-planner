import { useState, useMemo } from "react";
import { format, parseISO, differenceInDays, eachDayOfInterval } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Plus,
  Lock,
  CalendarDays,
  Settings,
  ChevronDown,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AddToRouteDrawer } from "./AddToRouteDrawer";
import { DateRangePicker } from "./DateRangePicker";
import { validateRouteDate } from "./routeValidation";
import type { RouteStop } from "@/hooks/useRouteStops";
import { toast } from "@/hooks/use-toast";

type Props = {
  stops: RouteStop[];
  canManage: boolean;
  isOwner: boolean;
  isRouteLocked: boolean;
  onAddStop: (input: any) => void;
  isAddingStop: boolean;
  onRemoveStop: (input: { id: string; cleanupDates?: string[] }) => void;
  onUpdateStopDates: (input: { id: string; start_date: string; end_date: string }) => void;
  isUpdatingDates: boolean;
  onLockRoute: () => void;
  onUnlockRoute: () => void;
  isLocking: boolean;
  proposalReactions?: Record<string, { up: number; down: number }>;
};

export function TripRoute({
  stops,
  canManage,
  isOwner,
  isRouteLocked,
  onAddStop,
  isAddingStop,
  onRemoveStop,
  onUpdateStopDates,
  isUpdatingDates,
  onLockRoute,
  onUnlockRoute,
  isLocking,
  proposalReactions = {},
}: Props) {
  const isMobile = useIsMobile();
  const [addOpen, setAddOpen] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<RouteStop | null>(null);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [unlockConfirm, setUnlockConfirm] = useState(false);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editDateRange, setEditDateRange] = useState<DateRange | undefined>();
  const [adminOpen, setAdminOpen] = useState(false);

  const fmt = (d: string) => format(parseISO(d), "MMM d");

  // Sort stops by start_date and assign display numbers
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

  const confirmRemove = () => {
    if (!removeConfirm) return;
    const days = eachDayOfInterval({
      start: parseISO(removeConfirm.start_date),
      end: parseISO(removeConfirm.end_date),
    });
    const dateStrs = days.map((d) => format(d, "yyyy-MM-dd"));
    onRemoveStop({ id: removeConfirm.id, cleanupDates: dateStrs });
    setRemoveConfirm(null);
  };

  const confirmLock = () => {
    onLockRoute();
    setLockConfirm(false);
    toast({ title: "Route locked 🔒" });
  };

  const confirmUnlock = () => {
    onUnlockRoute();
    setUnlockConfirm(false);
    toast({ title: "Route unlocked — you can now make changes" });
  };

  const handleStartEdit = (stop: RouteStop) => {
    setEditingStopId(stop.id);
    setEditDateRange({
      from: parseISO(stop.start_date),
      to: parseISO(stop.end_date),
    });
  };

  const handleSaveEdit = (stopId: string) => {
    if (!editDateRange?.from || !editDateRange?.to) return;
    const startDate = format(editDateRange.from, "yyyy-MM-dd");
    const endDate = format(editDateRange.to, "yyyy-MM-dd");
    onUpdateStopDates({ id: stopId, start_date: startDate, end_date: endDate });
    setEditingStopId(null);
    setEditDateRange(undefined);
  };

  // Validation for the currently editing stop
  const editValidation = useMemo(() => {
    if (!editingStopId || !editDateRange?.from || !editDateRange?.to) {
      return { hardError: null, softWarning: null, info: null };
    }
    const startDate = format(editDateRange.from, "yyyy-MM-dd");
    const endDate = format(editDateRange.to, "yyyy-MM-dd");
    return validateRouteDate(startDate, endDate, stops, editingStopId);
  }, [editingStopId, editDateRange, stops]);

  const canSaveEdit = !!(
    editDateRange?.from &&
    editDateRange?.to &&
    !editValidation.hardError
  );

  const ConfirmWrapper = ({
    open,
    onClose,
    title,
    children,
    actions,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    actions: React.ReactNode;
  }) => {
    if (isMobile) {
      return (
        <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
          <DrawerContent className="px-4 pb-6">
            <DrawerHeader className="text-left px-0">
              <DrawerTitle>{title}</DrawerTitle>
            </DrawerHeader>
            {children}
            <DrawerFooter className="flex-row justify-end px-0">
              {actions}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      );
    }
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children}
          <DialogFooter>{actions}</DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="space-y-3">
      {/* Route summary */}
      {sortedStops.length > 0 && tripStart && tripEnd && (
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

      {/* Unlock link for owner */}
      {isRouteLocked && isOwner && (
        <button
          onClick={() => setUnlockConfirm(true)}
          className="text-xs text-primary underline"
        >
          Unlock to make changes
        </button>
      )}

      {/* Empty state */}
      {sortedStops.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No stops confirmed yet — add destinations below and confirm them to
          build your route
        </p>
      )}

      {/* Stops list */}
      {sortedStops.map((stop, index) => {
        const isEditing = editingStopId === stop.id;
        const displayNumber = index + 1;
        const reactions = stop.proposal_id ? proposalReactions[stop.proposal_id] : undefined;

        return (
          <div key={stop.id} className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                {displayNumber}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {stop.destination}
                  </p>
                  {reactions && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      👍 {reactions.up} 👎 {reactions.down}
                    </span>
                  )}
                </div>
                {canManage && !isRouteLocked ? (
                  <button
                    onClick={() => isEditing ? setEditingStopId(null) : handleStartEdit(stop)}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <CalendarDays className="h-3 w-3" />
                    {fmt(stop.start_date)} – {fmt(stop.end_date)}
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {fmt(stop.start_date)} – {fmt(stop.end_date)}
                  </p>
                )}
              </div>
              {canManage && !isRouteLocked && (
                <button
                  onClick={() => setRemoveConfirm(stop)}
                  className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Inline date editor */}
            {isEditing && (
              <div className="ml-9 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <DateRangePicker
                  value={editDateRange}
                  onChange={setEditDateRange}
                  className="w-full"
                  placeholder="Select new dates"
                />

                {editValidation.hardError && (
                  <p className="text-sm text-destructive">{editValidation.hardError}</p>
                )}
                {editValidation.info && !editValidation.hardError && (
                  <p className="text-sm text-muted-foreground">{editValidation.info}</p>
                )}
                {editValidation.softWarning && !editValidation.hardError && (
                  <p className="text-sm text-amber-600">{editValidation.softWarning}</p>
                )}

                <div className="flex items-center gap-2 justify-end md:justify-start">
                  <button
                    onClick={() => { setEditingStopId(null); setEditDateRange(undefined); }}
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                  >
                    Cancel
                  </button>
                  <Button
                    size="sm"
                    onClick={() => handleSaveEdit(stop.id)}
                    disabled={!canSaveEdit || isUpdatingDates}
                  >
                    {isUpdatingDates
                      ? "Saving…"
                      : editValidation.softWarning
                      ? "Save anyway"
                      : "Save dates"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Lock / unlock actions */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap justify-end md:justify-start">
          {canManage && !isRouteLocked && sortedStops.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setLockConfirm(true)}
            >
              <Lock className="h-3.5 w-3.5" />
              Lock route
            </Button>
          )}
        </div>
        {canManage && !isRouteLocked && sortedStops.length > 0 && (
          <p className="text-[11px] text-muted-foreground text-right md:text-left">
            Prevents new destination suggestions. You can unlock anytime.
          </p>
        )}
      </div>

      {/* Collapsible admin controls */}
      {canManage && !isRouteLocked && (
        <Collapsible open={adminOpen} onOpenChange={setAdminOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-end md:justify-start">
            <Settings className="h-3.5 w-3.5" />
            Manage route directly
            <ChevronDown className={`h-3 w-3 transition-transform ${adminOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add stop
            </Button>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Add stop drawer */}
      <AddToRouteDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        existingStops={stops}
        onSubmit={(input) => {
          onAddStop(input);
          setAddOpen(false);
        }}
        isPending={isAddingStop}
      />

      {/* Remove confirm */}
      <ConfirmWrapper
        open={!!removeConfirm}
        onClose={() => setRemoveConfirm(null)}
        title="Remove stop"
        actions={
          <>
            <Button variant="ghost" onClick={() => setRemoveConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              Remove
            </Button>
          </>
        }
      >
        {removeConfirm && (
          <p className="text-sm text-muted-foreground">
            Remove{" "}
            <span className="font-semibold text-foreground">
              {removeConfirm.destination}
            </span>{" "}
            ({fmt(removeConfirm.start_date)} – {fmt(removeConfirm.end_date)})
            from the route? Empty itinerary days will be cleaned up.
          </p>
        )}
      </ConfirmWrapper>

      {/* Lock confirm */}
      <ConfirmWrapper
        open={lockConfirm}
        onClose={() => setLockConfirm(false)}
        title="Lock route"
        actions={
          <>
            <Button variant="ghost" onClick={() => setLockConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={confirmLock} disabled={isLocking}>
              {isLocking ? "Locking…" : "Lock route"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Lock the trip route? Members will be notified that the plan is
          finalised. You can unlock it again later if plans change.
        </p>
      </ConfirmWrapper>

      {/* Unlock confirm */}
      <ConfirmWrapper
        open={unlockConfirm}
        onClose={() => setUnlockConfirm(false)}
        title="Unlock route"
        actions={
          <>
            <Button variant="ghost" onClick={() => setUnlockConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={confirmUnlock} disabled={isLocking}>
              Unlock route
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Unlock the route? This will allow changes to stops and dates. The trip
          dates and itinerary will update automatically with any changes you
          make.
        </p>
      </ConfirmWrapper>
    </div>
  );
}

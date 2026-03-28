import { useState } from "react";
import { format, parseISO, differenceInDays, eachDayOfInterval } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Lock,
  MapPin,
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
import { AddToRouteDrawer } from "./AddToRouteDrawer";
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
  onReorderStop: (input: { id: string; newPosition: number }) => void;
  onLockRoute: () => void;
  onUnlockRoute: () => void;
  isLocking: boolean;
};

export function TripRoute({
  stops,
  canManage,
  isOwner,
  isRouteLocked,
  onAddStop,
  isAddingStop,
  onRemoveStop,
  onReorderStop,
  onLockRoute,
  onUnlockRoute,
  isLocking,
}: Props) {
  const isMobile = useIsMobile();
  const [addOpen, setAddOpen] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<RouteStop | null>(null);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [unlockConfirm, setUnlockConfirm] = useState(false);

  const fmt = (d: string) => format(parseISO(d), "MMM d");

  const tripStart =
    stops.length > 0
      ? [...stops].sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
          ?.start_date
      : null;
  const tripEnd =
    stops.length > 0
      ? [...stops].sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
          ?.end_date
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Trip Route</h3>
          {isRouteLocked && (
            <Badge className="bg-muted text-muted-foreground text-[10px]">
              <Lock className="h-3 w-3 mr-1" /> Locked
            </Badge>
          )}
        </div>
        {stops.length > 0 && tripStart && tripEnd && (
          <span className="text-xs text-muted-foreground">
            {totalDays} days · {fmt(tripStart)} – {fmt(tripEnd)}
          </span>
        )}
      </div>

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
      {stops.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No stops confirmed yet — add destinations below and confirm them to
          build your route
        </p>
      )}

      {/* Stops list */}
      {stops.map((stop, index) => (
        <div
          key={stop.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
        >
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
            {stop.position}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {stop.destination}
            </p>
            <p className="text-xs text-muted-foreground">
              {fmt(stop.start_date)} – {fmt(stop.end_date)}
            </p>
          </div>
          {canManage && !isRouteLocked && (
            <div className="flex items-center gap-1 shrink-0">
              {index > 0 && (
                <button
                  onClick={() =>
                    onReorderStop({
                      id: stop.id,
                      newPosition: stops[index - 1].position,
                    })
                  }
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              )}
              {index < stops.length - 1 && (
                <button
                  onClick={() =>
                    onReorderStop({
                      id: stop.id,
                      newPosition: stops[index + 1].position,
                    })
                  }
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setRemoveConfirm(stop)}
                className="p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {canManage && !isRouteLocked && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add stop
          </Button>
        )}
        {canManage && !isRouteLocked && stops.length > 0 && (
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

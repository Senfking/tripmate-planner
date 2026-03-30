import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, GripVertical, MapPin, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ItemComments } from "./ItemComments";
import { AttendanceRow } from "./AttendanceRow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import type { ItineraryItem } from "@/hooks/useItinerary";
import type { AttendanceRecord, TripMember } from "@/hooks/useItineraryAttendance";
import { useAuth } from "@/contexts/AuthContext";

const statusConfig: Record<string, { label: string; className: string }> = {
  idea: { label: "Idea", className: "bg-muted text-muted-foreground" },
  planned: { label: "Planned", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  booked: { label: "Booked", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
};

interface Props {
  item: ItineraryItem;
  tripId: string;
  myRole?: string;
  members: TripMember[];
  attendance: AttendanceRecord[];
  activeId: string | null;
  overlapTitles?: string[];
  isNew?: boolean;
  isNewSinceLastVisit?: boolean;
  onCycleAttendance: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ItineraryItemCard({ item, tripId, myRole, members, attendance, activeId, overlapTitles, isNew, isNewSinceLastVisit, onCycleAttendance, onEdit, onDelete }: Props) {
  const { user } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isMobile = useIsMobile();
  const status = statusConfig[item.status] || statusConfig.idea;
  const canDelete = item.created_by === user?.id || myRole === "owner" || myRole === "admin";
  const timeStr = item.start_time ? item.start_time.slice(0, 5) : null;
  const endStr = item.end_time ? item.end_time.slice(0, 5) : null;
  const timeDisplay = timeStr ? (endStr ? `${timeStr}–${endStr}` : timeStr) : null;

  // Skeleton animation state machine: "skeleton" → "crossfade" → "glow" → "done"
  const [animPhase, setAnimPhase] = useState<"skeleton" | "crossfade" | "glow" | "done">(
    isNew ? "skeleton" : "done"
  );
  const animStarted = useRef(false);

  useEffect(() => {
    if (!isNew || animStarted.current) return;
    animStarted.current = true;

    // skeleton → crossfade after 600ms
    const t1 = setTimeout(() => setAnimPhase("crossfade"), 600);
    // crossfade → glow after 800ms (600 + 200)
    const t2 = setTimeout(() => setAnimPhase("glow"), 800);
    // glow → done after 2300ms (800 + 1500)
    const t3 = setTimeout(() => setAnimPhase("done"), 2300);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isNew]);

  const isDraggable = !item.start_time;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const showSkeleton = isNew && (animPhase === "skeleton" || animPhase === "crossfade");
  const showGlowStripe = animPhase === "glow" || Boolean(isNewSinceLastVisit);

  const skeletonStyle = {
    background: "linear-gradient(120deg, hsl(var(--primary-foreground) / 0.06) 0%, hsl(var(--primary) / 0.18) 40%, hsl(var(--primary-foreground) / 0.12) 55%, hsl(var(--primary) / 0.08) 100%)",
    backgroundSize: "300% 300%",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "1px solid hsl(var(--primary) / 0.25)",
  };

  const cardContent = (
    <>
      <div className="flex items-start gap-2">
        {isDraggable ? (
          <button
            className="touch-none cursor-grab active:cursor-grabbing mt-0.5 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <div className="w-4 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              {timeDisplay || "tbc"}
            </span>
            <span className="font-medium text-sm truncate">{item.title}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.location_text || "tbc"}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {overlapTitles?.length ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs">
                  Overlaps with {overlapTitles.join(", ")} — different people can join different activities
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <Badge className={`text-[10px] px-1.5 py-0 border-0 ${status.className}`}>
            {status.label}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end md:justify-start">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {canDelete && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {user && members.length > 0 && (
        <AttendanceRow
          members={members}
          attendance={attendance}
          itemId={item.id}
          currentUserId={user.id}
          onCycle={onCycleAttendance}
        />
      )}

      <ItemComments tripId={tripId} itemId={item.id} />

      {isMobile ? (
        <Drawer open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Delete "{item.title}"?</DrawerTitle>
              <DrawerDescription>
                This will permanently remove this activity and its comments.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button
                variant="destructive"
                onClick={() => { setConfirmOpen(false); onDelete(); }}
              >
                Delete
              </Button>
              <DrawerClose asChild>
                <Button variant="outline">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{item.title}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this activity and its comments.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        isDragging && "z-10",
      )}
    >
      {showGlowStripe ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-20 w-[3px] rounded-l-lg bg-primary",
            animPhase === "glow" && "animate-glow-stripe"
          )}
        />
      ) : null}

      <div
        className={cn(
          "relative z-10 rounded-lg border bg-card p-3 space-y-2 transition-[opacity,box-shadow] duration-200",
          isDragging && "opacity-50 ring-2 ring-primary/30",
          overlapTitles?.length && "border-l-[3px] border-l-amber-400",
          animPhase === "skeleton" && "opacity-0",
          animPhase === "crossfade" && "animate-crossfade-in",
          animPhase === "glow" && "animate-realtime-flash",
        )}
      >
        {cardContent}
      </div>

      {showSkeleton ? (
        <div
          aria-hidden
          style={skeletonStyle}
          className={cn(
            "pointer-events-none absolute inset-0 z-20 rounded-lg animate-shimmer-diag transition-opacity duration-200",
            animPhase === "crossfade" ? "opacity-0" : "opacity-100"
          )}
        />
      ) : null}
    </div>
  );
}

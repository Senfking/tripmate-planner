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

  // Animation phases: "skeleton" → "fadein" → "pill" → "done"
  const [animPhase, setAnimPhase] = useState<"skeleton" | "fadein" | "pill" | "done">(
    isNew ? "skeleton" : "done"
  );
  const [pillVisible, setPillVisible] = useState(false);
  const [newBorderVisible, setNewBorderVisible] = useState(Boolean(isNewSinceLastVisit));
  const animStarted = useRef(false);

  useEffect(() => {
    if (!isNew || animStarted.current) return;
    animStarted.current = true;

    const t1 = setTimeout(() => setAnimPhase("fadein"), 600);
    const t2 = setTimeout(() => {
      setAnimPhase("pill");
      setPillVisible(true);
    }, 900);
    const t3 = setTimeout(() => setPillVisible(false), 8900);
    const t4 = setTimeout(() => setAnimPhase("done"), 9400);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [isNew]);

  // Fade out "new since last visit" border after 8s
  useEffect(() => {
    if (!isNewSinceLastVisit) return;
    const t = setTimeout(() => setNewBorderVisible(false), 8000);
    return () => clearTimeout(t);
  }, [isNewSinceLastVisit]);

  const showNewPill = pillVisible || Boolean(isNewSinceLastVisit);
  const showNewBorder = newBorderVisible;

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

  const showSkeleton = isNew && animPhase === "skeleton";

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
      {/* "New" pill badge */}
      {showNewPill && (
        <span
          className={cn(
            "absolute top-2 right-2 z-30 text-[10px] font-semibold text-white px-[7px] py-[2px] rounded-[10px]",
            !pillVisible && isNewSinceLastVisit && "opacity-100",
            pillVisible && animPhase === "done" && !isNewSinceLastVisit && "animate-pill-fade-out",
          )}
          style={{ backgroundColor: "#0D9488" }}
        >
          New
        </span>
      )}

      {/* Skeleton placeholder */}
      {showSkeleton && (
        <div
          aria-hidden
          className="rounded-xl animate-calm-pulse"
          style={{
            height: "100px",
            background: "rgba(13, 148, 136, 0.06)",
            border: "1px solid rgba(13, 148, 136, 0.15)",
            borderRadius: "12px",
          }}
        />
      )}

      {/* Real card — hidden during skeleton, fades in after */}
      {!showSkeleton && (
        <div
          className={cn(
            "rounded-lg bg-white dark:bg-card p-3 space-y-2",
            isDragging && "opacity-50 ring-2 ring-primary/30",
            !showNewBorder && overlapTitles?.length && "border-l-[3px] border-l-amber-400",
            animPhase === "fadein" && "animate-fade-in-card",
          )}
          style={{
            borderRadius: "12px",
            ...(showNewBorder
              ? {
                  borderLeft: "3px solid #0D9488",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0px 1px rgba(0,0,0,0.05)",
                  transition: "border-color 1s ease-out, box-shadow 1s ease-out",
                }
              : !newBorderVisible && isNewSinceLastVisit
              ? {
                  border: "1px solid transparent",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0px 1px rgba(0,0,0,0.05)",
                  transition: "border-color 1s ease-out, box-shadow 1s ease-out",
                }
              : {
                  border: "none",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0px 1px rgba(0,0,0,0.05)",
                }),
          }}
        >
          {cardContent}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, GripVertical, MapPin, AlertTriangle, Clock, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ItemComments } from "./ItemComments";
import { AttendanceRow } from "./AttendanceRow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
  DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import type { ItineraryItem } from "@/hooks/useItinerary";
import type { AttendanceRecord, TripMember } from "@/hooks/useItineraryAttendance";
import { useAuth } from "@/contexts/AuthContext";

/* ── status colour map ── */
const STATUS: Record<string, { label: string; color: string }> = {
  idea:      { label: "Idea",      color: "#94a3b8" },
  planned:   { label: "Planned",   color: "#3b82f6" },
  booked:    { label: "Booked",    color: "#10b981" },
  confirmed: { label: "Confirmed", color: "#0d9488" },
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

export function ItineraryItemCard({
  item, tripId, myRole, members, attendance, activeId,
  overlapTitles, isNew, isNewSinceLastVisit,
  onCycleAttendance, onEdit, onDelete,
}: Props) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const s = STATUS[item.status] || STATUS.idea;
  const canDelete = item.created_by === user?.id || myRole === "owner" || myRole === "admin";
  const timeStr = item.start_time?.slice(0, 5) ?? null;
  const endStr = item.end_time?.slice(0, 5) ?? null;
  const timeDisplay = timeStr ? (endStr ? `${timeStr} – ${endStr}` : timeStr) : null;

  /* ── new-item animation ── */
  const [animPhase, setAnimPhase] = useState<"skeleton" | "fadein" | "done">(isNew ? "skeleton" : "done");
  const [showNewPill, setShowNewPill] = useState(Boolean(isNewSinceLastVisit));
  const started = useRef(false);

  useEffect(() => {
    if (!isNew || started.current) return;
    started.current = true;
    const t1 = setTimeout(() => setAnimPhase("fadein"), 500);
    const t2 = setTimeout(() => { setAnimPhase("done"); setShowNewPill(true); }, 800);
    const t3 = setTimeout(() => setShowNewPill(false), 6000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isNew]);

  useEffect(() => {
    if (!isNewSinceLastVisit) return;
    const t = setTimeout(() => setShowNewPill(false), 6000);
    return () => clearTimeout(t);
  }, [isNewSinceLastVisit]);

  /* ── drag-and-drop ── */
  const isDraggable = !item.start_time;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !isDraggable,
  });
  const dndStyle = { transform: CSS.Transform.toString(transform), transition };

  if (isNew && animPhase === "skeleton") {
    return (
      <div ref={setNodeRef} style={dndStyle} className="relative">
        <div
          aria-hidden
          className="rounded-xl animate-calm-pulse"
          style={{ height: 72, background: "rgba(13,148,136,0.05)", border: "1px solid rgba(13,148,136,0.12)", borderRadius: 12 }}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={dndStyle} className={cn("relative", isDragging && "z-10")}>
      <div
        className={cn(
          "w-full overflow-hidden rounded-xl transition-all duration-200",
          "bg-white dark:bg-card",
          "border border-border/60",
          isDragging && "opacity-50 ring-2 ring-primary/30",
          animPhase === "fadein" && "animate-fade-in-card",
          "md:hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]",
        )}
      >
        {/* ━━ ROW 1: Title bar ━━ */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
          {isDraggable && (
            <button
              className="shrink-0 touch-none text-muted-foreground/20 hover:text-muted-foreground/50 cursor-grab active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}

          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-snug text-foreground">
            {item.title}
          </p>

          {overlapTitles?.length ? (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  Overlaps with {overlapTitles.join(", ")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}

          {showNewPill && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
              style={{ color: "#0d9488", backgroundColor: "rgba(13,148,136,0.1)" }}
            >
              New
            </span>
          )}

          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: s.color, backgroundColor: `${s.color}12` }}
          >
            {s.label}
          </span>
        </div>

        {/* ━━ ROW 2: Meta ━━ */}
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0 opacity-50" />
            <span>{timeDisplay || "tbc"}</span>
            {item.location_text && (
              <>
                <span className="opacity-30">·</span>
                <MapPin className="h-3 w-3 shrink-0 opacity-50" />
                <span className="truncate">{item.location_text}</span>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5 ml-2">
            <button onClick={onEdit} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground/70 hover:bg-muted/40 transition-colors">
              <Pencil className="h-3 w-3" />
            </button>
            {canDelete && (
              <button onClick={() => setConfirmOpen(true)} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground/40 hover:text-destructive/70 hover:bg-muted/40 transition-colors">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* ━━ ROW 3: Attendance + Comments (side by side) ━━ */}
        {user && (members.length > 0) && (
          <div className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-2">
            <AttendanceRow
              members={members}
              attendance={attendance}
              itemId={item.id}
              currentUserId={user.id}
              onCycle={onCycleAttendance}
            />
            <ItemComments tripId={tripId} itemId={item.id} />
          </div>
        )}

        {/* No members but still show comments */}
        {user && members.length === 0 && (
          <div className="border-t border-border/40 px-3 py-2 flex justify-end">
            <ItemComments tripId={tripId} itemId={item.id} />
          </div>
        )}
      </div>

      {/* ── Delete confirmation ── */}
      {isMobile ? (
        <Drawer open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Delete "{item.title}"?</DrawerTitle>
              <DrawerDescription>This will permanently remove this activity and its comments.</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button variant="destructive" onClick={() => { setConfirmOpen(false); onDelete(); }}>Delete</Button>
              <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{item.title}"?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently remove this activity and its comments.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
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

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
  idea:      { label: "Idea",      bg: "bg-slate-50 dark:bg-slate-800/40",    text: "text-slate-500 dark:text-slate-400", border: "#94a3b8" },
  planned:   { label: "Planned",   bg: "bg-blue-50 dark:bg-blue-900/30",      text: "text-blue-600 dark:text-blue-300",   border: "#3b82f6" },
  booked:    { label: "Booked",    bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-300", border: "#10b981" },
  confirmed: { label: "Confirmed", bg: "bg-teal-50 dark:bg-teal-900/30",      text: "text-teal-600 dark:text-teal-300",  border: "#0d9488" },
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

  // Animation phases
  const [animPhase, setAnimPhase] = useState<"skeleton" | "fadein" | "pill" | "done">(isNew ? "skeleton" : "done");
  const [pillVisible, setPillVisible] = useState(false);
  const [newBorderVisible, setNewBorderVisible] = useState(Boolean(isNewSinceLastVisit));
  const animStarted = useRef(false);

  useEffect(() => {
    if (!isNew || animStarted.current) return;
    animStarted.current = true;
    const t1 = setTimeout(() => setAnimPhase("fadein"), 600);
    const t2 = setTimeout(() => { setAnimPhase("pill"); setPillVisible(true); }, 900);
    const t3 = setTimeout(() => setPillVisible(false), 8900);
    const t4 = setTimeout(() => setAnimPhase("done"), 9400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [isNew]);

  useEffect(() => {
    if (!isNewSinceLastVisit) return;
    const t = setTimeout(() => setNewBorderVisible(false), 8000);
    return () => clearTimeout(t);
  }, [isNewSinceLastVisit]);

  const showNewPill = pillVisible || Boolean(isNewSinceLastVisit);
  const showNewBorder = newBorderVisible;

  const isDraggable = !item.start_time;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !isDraggable,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const showSkeleton = isNew && animPhase === "skeleton";

  const cardContent = (
    <div className="w-full overflow-hidden">
      {/* Row 1: Title + Status */}
      <div className="flex items-start gap-1.5">
        {isDraggable && (
          <button
            className="touch-none cursor-grab active:cursor-grabbing mt-0.5 shrink-0 text-muted-foreground/20 hover:text-muted-foreground/60 transition-colors"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          {/* Title line */}
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground leading-tight truncate flex-1 min-w-0">
              {item.title}
            </p>
            {overlapTitles?.length ? (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="shrink-0"><AlertTriangle className="h-3 w-3 text-amber-500" /></span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    Overlaps with {overlapTitles.join(", ")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            <span className={cn(
              "shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-[1px] rounded-md",
              status.bg, status.text
            )}>
              {status.label}
            </span>
          </div>

          {/* Row 2: Meta + Actions */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              <span className="shrink-0">{timeDisplay || "tbc"}</span>
              {item.location_text && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                  <span className="truncate">{item.location_text}</span>
                </>
              )}
            </div>
            <div className="flex items-center shrink-0 ml-2">
              <button
                onClick={onEdit}
                className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/30 hover:text-foreground/70 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {canDelete && (
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/30 hover:text-destructive/70 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              <ItemComments tripId={tripId} itemId={item.id} />
            </div>
          </div>
        </div>
      </div>

      {/* Attendance */}
      {user && members.length > 0 && (
        <div className="mt-1.5">
          <AttendanceRow
            members={members}
            attendance={attendance}
            itemId={item.id}
            currentUserId={user.id}
            onCycle={onCycleAttendance}
          />
        </div>
      )}

      {/* Delete confirmation */}
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

  return (
    <div ref={setNodeRef} style={style} className={cn("relative", isDragging && "z-10")}>
      {/* "New" pill */}
      {showNewPill && (
        <span
          className={cn(
            "absolute -top-2 left-3 z-30 text-[9px] font-bold uppercase tracking-wider text-white px-2 py-[2px] rounded-full shadow-sm",
            pillVisible && animPhase === "done" && !isNewSinceLastVisit && "animate-pill-fade-out",
          )}
          style={{ backgroundColor: "#0D9488" }}
        >
          New
        </span>
      )}

      {/* Skeleton */}
      {showSkeleton && (
        <div
          aria-hidden
          className="rounded-xl animate-calm-pulse"
          style={{ height: "80px", background: "rgba(13,148,136,0.06)", border: "1px solid rgba(13,148,136,0.15)", borderRadius: "12px" }}
        />
      )}

      {/* Card */}
      {!showSkeleton && (
        <div
          className={cn(
            "rounded-xl bg-white dark:bg-card px-3 py-2.5 overflow-hidden w-full max-w-full transition-all duration-200",
            isDragging && "opacity-50 ring-2 ring-primary/30",
            !showNewBorder && overlapTitles?.length && "border-l-[3px] border-l-amber-400/60",
            animPhase === "fadein" && "animate-fade-in-card",
            "md:hover:shadow-md",
          )}
          style={{
            borderLeft: `3px solid ${status.border}`,
            border: showNewBorder
              ? `1px solid rgba(13,148,136,0.25)`
              : `1px solid rgba(241,245,249,0.8)`,
            borderLeftWidth: "3px",
            borderLeftColor: status.border,
            boxShadow: showNewBorder
              ? "0 1px 4px rgba(13,148,136,0.08)"
              : "0 1px 3px rgba(0,0,0,0.03)",
            transition: "border-color 0.8s ease, box-shadow 0.2s ease",
          }}
        >
          {cardContent}
        </div>
      )}
    </div>
  );
}

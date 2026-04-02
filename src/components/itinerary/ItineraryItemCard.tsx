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
      <div className="flex items-start gap-1.5">
        {isDraggable && (
          <button
            className="mt-[3px] shrink-0 touch-none text-muted-foreground/20 transition-colors hover:text-muted-foreground/60 cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3" />
          </button>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Title + status */}
          <div className="flex items-center justify-between gap-1.5">
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug text-foreground">
              {item.title}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {overlapTitles?.length ? (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-xs">
                      Overlaps with {overlapTitles.join(", ")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              {showNewPill && (
                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-primary">
                  New
                </span>
              )}
              <span className={cn(
                "shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
                status.bg,
                status.text,
              )}>
                {status.label}
              </span>
            </div>
          </div>

          {/* Meta + actions */}
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex items-center gap-1 text-[11px] text-muted-foreground/70">
              <Clock className="h-2.5 w-2.5 shrink-0" />
              <span className="shrink-0">{timeDisplay || "tbc"}</span>
              {item.location_text && (
                <>
                  <span className="text-muted-foreground/25">·</span>
                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{item.location_text}</span>
                </>
              )}
            </div>
            <div className="ml-1 flex shrink-0 items-center">
              <button
                onClick={onEdit}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:text-foreground/70"
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
              {canDelete && (
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:text-destructive/70"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              )}
              <ItemComments tripId={tripId} itemId={item.id} />
            </div>
          </div>
        </div>
      </div>

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
      {showSkeleton && (
        <div
          aria-hidden
          className="rounded-xl animate-calm-pulse"
          style={{ height: "80px", background: "rgba(13,148,136,0.06)", border: "1px solid rgba(13,148,136,0.15)", borderRadius: "12px" }}
        />
      )}

      {!showSkeleton && (
        <div
          className={cn(
            "w-full max-w-full overflow-hidden rounded-xl bg-white dark:bg-card px-3 py-2 transition-all duration-200",
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

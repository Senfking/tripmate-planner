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
      <div className="flex items-start gap-2">
        {isDraggable && (
          <button
            className="mt-0.5 shrink-0 touch-none text-muted-foreground/25 transition-colors hover:text-muted-foreground/70 cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate pr-1 text-[14px] font-semibold leading-tight text-foreground">
              {item.title}
            </p>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              {overlapTitles?.length ? (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-background/80 text-amber-500 shadow-sm">
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-xs">
                      Overlaps with {overlapTitles.join(", ")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              {showNewPill && (
                <span className="inline-flex shrink-0 rounded-full border border-primary/15 bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-primary">
                  New
                </span>
              )}
              <span className={cn(
                "inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                status.bg,
                status.text,
              )}>
                {status.label}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <span className="shrink-0 font-medium">{timeDisplay || "tbc"}</span>
              {item.location_text && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  <span className="truncate">{item.location_text}</span>
                </>
              )}
            </div>
            <div className="ml-2 flex shrink-0 items-center gap-0.5">
              <button
                onClick={onEdit}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-muted-foreground/45 transition-colors hover:border-border/60 hover:bg-muted/50 hover:text-foreground/75"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {canDelete && (
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-muted-foreground/45 transition-colors hover:border-border/60 hover:bg-muted/50 hover:text-destructive/70"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <ItemComments tripId={tripId} itemId={item.id} />
        </div>
      </div>

      {user && members.length > 0 && (
        <div className="mt-2 border-t border-border/50 pt-2">
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
            "w-full max-w-full overflow-hidden rounded-2xl bg-white/95 px-3.5 py-3 transition-all duration-200 dark:bg-card/95",
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

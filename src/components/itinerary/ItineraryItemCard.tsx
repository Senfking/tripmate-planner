import { useState, useEffect, useRef } from "react";
import { Pencil, Trash2, GripVertical, MapPin, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
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

/* ── status config ── */
const STATUS: Record<string, { label: string; fg: string; bg: string; tint: string }> = {
  idea:      { label: "Idea",      fg: "hsl(220 9% 46%)",  bg: "hsl(220 9% 46% / 0.08)",  tint: "hsl(220 9% 46% / 0.03)" },
  planned:   { label: "Planned",   fg: "hsl(221 83% 53%)", bg: "hsl(221 83% 53% / 0.08)",  tint: "hsl(221 83% 53% / 0.03)" },
  booked:    { label: "Booked",    fg: "hsl(160 84% 39%)", bg: "hsl(160 84% 39% / 0.08)",  tint: "hsl(160 84% 39% / 0.03)" },
  confirmed: { label: "Confirmed", fg: "hsl(175 84% 32%)", bg: "hsl(175 84% 32% / 0.10)",  tint: "hsl(175 84% 32% / 0.04)" },
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
          className="rounded-2xl animate-calm-pulse"
          style={{ height: 100, background: "hsl(175 84% 32% / 0.05)", border: "1px solid hsl(175 84% 32% / 0.12)", borderRadius: 16 }}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={dndStyle} className={cn("relative", isDragging && "z-10")}>
      <div
        className={cn(
          "w-full overflow-hidden rounded-2xl transition-all duration-200",
          "bg-card dark:bg-card",
          "border border-border/60",
          "shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
          isDragging && "opacity-50 ring-2 ring-primary/30",
          animPhase === "fadein" && "animate-fade-in-card",
          "md:hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]",
        )}
        style={{ background: `linear-gradient(180deg, ${s.tint} 0%, transparent 60%)` }}
      >
        {/* ━━ HEADER ZONE ━━ */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                {isDraggable && (
                  <button
                    className="shrink-0 touch-none text-muted-foreground/25 hover:text-muted-foreground/50 cursor-grab active:cursor-grabbing -ml-1"
                    {...attributes}
                    {...listeners}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                )}
                <h3 className="text-[15px] font-bold leading-tight text-foreground truncate">
                  {item.title}
                </h3>
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
                    style={{ color: "hsl(175 84% 32%)", backgroundColor: "hsl(175 84% 32% / 0.10)" }}
                  >
                    New
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[12px] text-muted-foreground/70">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3 opacity-60" />
                  {timeDisplay || "TBC"}
                </span>
                {item.location_text && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 opacity-60" />
                    <span className="truncate">{item.location_text}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: s.fg, backgroundColor: s.bg }}
              >
                {s.label}
              </span>
              <div className="flex items-center gap-0.5">
                <button onClick={onEdit} className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-foreground/70 hover:bg-muted/40 transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {canDelete && (
                  <button onClick={() => setConfirmOpen(true)} className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-destructive/70 hover:bg-muted/40 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ━━ BODY ZONE — Attendance ━━ */}
        {user && members.length > 0 && (
          <div className="px-4 pb-3">
            <AttendanceRow
              members={members}
              attendance={attendance}
              itemId={item.id}
              currentUserId={user.id}
              onCycle={onCycleAttendance}
            />
          </div>
        )}

        {/* ━━ COMMENT ZONE ━━ */}
        {user && (
          <div className="border-t border-border/40 px-4 py-3">
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

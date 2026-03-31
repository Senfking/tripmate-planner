import { useState, useCallback, useMemo } from "react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { ItineraryItemCard } from "./ItineraryItemCard";
import { ItemFormModal } from "./ItemFormModal";
import type { ItineraryItem } from "@/hooks/useItinerary";
import type { AttendanceRecord, TripMember } from "@/hooks/useItineraryAttendance";

/** Convert "HH:MM" or "HH:MM:SS" to minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function getSortValue(item: ItineraryItem): number {
  return item.start_time ? timeToMinutes(item.start_time) : (item.sort_order ?? 0);
}

function computeOverlaps(items: ItineraryItem[]): Map<string, string[]> {
  const timed = items.filter(i => i.start_time && i.end_time);
  const map = new Map<string, string[]>();
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j];
      const aStart = timeToMinutes(a.start_time!);
      const aEnd = timeToMinutes(a.end_time!);
      const bStart = timeToMinutes(b.start_time!);
      const bEnd = timeToMinutes(b.end_time!);
      if (aStart < bEnd && bStart < aEnd) {
        map.set(a.id, [...(map.get(a.id) || []), b.title]);
        map.set(b.id, [...(map.get(b.id) || []), a.title]);
      }
    }
  }
  return map;
}

interface Props {
  dayDate: string;
  dayNumber: number;
  items: ItineraryItem[];
  tripId: string;
  myRole?: string;
  destination?: string;
  members: TripMember[];
  attendance: AttendanceRecord[];
  newItemIds?: Set<string>;
  lastVisitItemIds?: Set<string>;
  onCycleAttendance: (itemId: string) => void;
  onAddItem: (data: any) => void;
  onUpdateItem: (data: any) => void;
  onDeleteItem: (id: string) => void;
  onReorder: (reordered: { id: string; sort_order: number }[]) => void;
  saving?: boolean;
}

export function DaySection({ dayDate, dayNumber, items, tripId, myRole, destination, members, attendance, newItemIds, lastVisitItemIds, onCycleAttendance, onAddItem, onUpdateItem, onDeleteItem, onReorder, saving, isLast }: Props & { isLast?: boolean }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<ItineraryItem | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const dateObj = new Date(dayDate + "T00:00:00");
  const isActiveDay = isToday(dateObj);
  const isTmrw = isTomorrow(dateObj);
  const hasItems = items.length > 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const handleSave = (data: any) => {
    if (data.id) {
      onUpdateItem(data);
    } else {
      onAddItem(data);
    }
    setFormOpen(false);
    setEditItem(null);
  };

  const handleEdit = (item: ItineraryItem) => {
    setEditItem(item);
    setFormOpen(true);
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggedItem = items.find(i => i.id === active.id);
    if (!draggedItem || draggedItem.start_time) return;

    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = arrayMove(items, oldIndex, newIndex);

    const prev = reordered[newIndex - 1];
    const next = reordered[newIndex + 1];
    const prevVal = prev ? getSortValue(prev) : 0;
    const nextVal = next ? getSortValue(next) : prevVal + 2000;
    const newSortOrder = Math.round((prevVal + nextVal) / 2);

    onReorder([{ id: active.id as string, sort_order: newSortOrder }]);
  }, [items, onReorder]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const itemIds = items.map(i => i.id);
  const overlapMap = useMemo(() => computeOverlaps(items), [items]);

  return (
    <section className="flex gap-3">
      {/* Date column */}
      <div className="flex flex-col items-center w-[52px] shrink-0 pt-1">
        <span className={cn(
          "text-[10px] font-bold uppercase tracking-wider",
          isActiveDay ? "text-[#0D9488]" : "text-muted-foreground"
        )}>
          {isActiveDay ? "Today" : isTmrw ? "Tmrw" : format(dateObj, "EEE")}
        </span>
        <span className={cn(
          "text-[22px] font-bold leading-none mt-0.5",
          isActiveDay ? "text-[#0D9488]" : hasItems ? "text-foreground" : "text-muted-foreground/40"
        )}>
          {format(dateObj, "d")}
        </span>
        <span className={cn(
          "text-[10px] font-medium",
          isActiveDay ? "text-[#0D9488]/60" : "text-muted-foreground/60"
        )}>
          {format(dateObj, "MMM")}
        </span>
        {!isLast && (
          <div className="flex-1 w-px mt-2" style={{ background: "rgba(0,0,0,0.08)" }} />
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 pb-4 space-y-2">
        {/* Destination label */}
        {destination && (
          <div className="flex items-center gap-1 mb-1">
            <MapPin className="h-3 w-3 text-[#0D9488]/60 shrink-0" />
            <span className="text-[11px] font-medium text-[#0D9488]/70 truncate">{destination}</span>
          </div>
        )}

        {items.length === 0 ? (
          <button
            onClick={() => { setEditItem(null); setFormOpen(true); }}
            className="w-full rounded-[14px] border border-dashed border-muted-foreground/20 p-4 text-center text-[13px] text-muted-foreground/50 hover:border-primary/40 hover:text-foreground transition-colors"
          >
            Tap to add activity +
          </button>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map((item) => (
                  <ItineraryItemCard
                    key={item.id}
                    item={item}
                    tripId={tripId}
                    myRole={myRole}
                    members={members}
                    attendance={attendance}
                    activeId={activeId}
                    overlapTitles={overlapMap.get(item.id)}
                    isNew={newItemIds?.has(item.id)}
                    isNewSinceLastVisit={lastVisitItemIds?.has(item.id)}
                    onCycleAttendance={() => onCycleAttendance(item.id)}
                    onEdit={() => handleEdit(item)}
                    onDelete={() => onDeleteItem(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Inline add button */}
        {items.length > 0 && (
          <button
            onClick={() => { setEditItem(null); setFormOpen(true); }}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground/50 hover:text-[#0D9488] transition-colors pl-1 pt-0.5"
          >
            <Plus className="h-3 w-3" /> Add activity
          </button>
        )}
      </div>

      <ItemFormModal
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditItem(null); }}
        onSave={handleSave}
        saving={saving}
        dayDate={dayDate}
        item={editItem}
      />
    </section>
  );
}

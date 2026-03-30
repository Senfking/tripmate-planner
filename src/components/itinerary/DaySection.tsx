import { useState, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
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
  onCycleAttendance: (itemId: string) => void;
  onAddItem: (data: any) => void;
  onUpdateItem: (data: any) => void;
  onDeleteItem: (id: string) => void;
  onReorder: (reordered: { id: string; sort_order: number }[]) => void;
  saving?: boolean;
}

export function DaySection({ dayDate, dayNumber, items, tripId, myRole, destination, members, attendance, newItemIds, onCycleAttendance, onAddItem, onUpdateItem, onDeleteItem, onReorder, saving }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<ItineraryItem | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const dateObj = new Date(dayDate + "T00:00:00");
  const dateLabel = format(dateObj, "EEE d MMM yyyy");

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
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Day {dayNumber} — {dateLabel}{destination ? ` · ${destination}` : ""}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => { setEditItem(null); setFormOpen(true); }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      {items.length === 0 ? (
        <button
          onClick={() => { setEditItem(null); setFormOpen(true); }}
          className="w-full rounded-lg border border-dashed border-muted-foreground/30 p-6 text-center text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          Nothing planned for this day yet — add the first activity ＋
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
                  onCycleAttendance={() => onCycleAttendance(item.id)}
                  onEdit={() => handleEdit(item)}
                  onDelete={() => onDeleteItem(item.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

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

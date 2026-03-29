import { useState, useRef } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ItineraryItemCard } from "./ItineraryItemCard";
import { ItemFormModal } from "./ItemFormModal";
import type { ItineraryItem } from "@/hooks/useItinerary";
import type { AttendanceRecord, TripMember } from "@/hooks/useItineraryAttendance";

/** Convert "HH:MM" or "HH:MM:SS" to minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
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
  onCycleAttendance: (itemId: string) => void;
  onAddItem: (data: any) => void;
  onUpdateItem: (data: any) => void;
  onDeleteItem: (id: string) => void;
  onReorder: (reordered: { id: string; sort_order: number }[]) => void;
  saving?: boolean;
}

export function DaySection({ dayDate, dayNumber, items, tripId, myRole, destination, members, attendance, onCycleAttendance, onAddItem, onUpdateItem, onDeleteItem, onReorder, saving }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<ItineraryItem | null>(null);
  const dragItemRef = useRef<string | null>(null);

  const dateObj = new Date(dayDate + "T00:00:00");
  const dateLabel = format(dateObj, "EEE d MMM yyyy");

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

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    const item = items.find((i) => i.id === id);
    if (item?.start_time) {
      e.preventDefault();
      return;
    }
    dragItemRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    dragItemRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = dragItemRef.current;
    dragItemRef.current = null;
    if (!draggedId || draggedId === targetId) return;

    const draggedItem = items.find((i) => i.id === draggedId);
    if (!draggedItem || draggedItem.start_time) return;

    const targetIdx = items.findIndex((i) => i.id === targetId);
    if (targetIdx === -1) return;

    const getSortValue = (item: ItineraryItem) =>
      item.start_time ? timeToMinutes(item.start_time) : (item.sort_order ?? 0);

    const targetVal = getSortValue(items[targetIdx]);
    const prevIdx = targetIdx - 1;
    const prevVal = prevIdx >= 0 ? getSortValue(items[prevIdx]) : targetVal - 100;

    const newSortOrder = Math.round((prevVal + targetVal) / 2);
    onReorder([{ id: draggedItem.id, sort_order: newSortOrder }]);
  };

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
        <div className="space-y-2">
          {items.map((item) => {
            const isDraggable = !item.start_time;
            return (
              <ItineraryItemCard
                key={item.id}
                item={item}
                tripId={tripId}
                myRole={myRole}
                members={members}
                attendance={attendance}
                draggable={isDraggable}
                onCycleAttendance={() => onCycleAttendance(item.id)}
                onDragOver={handleDragOver}
                onDrop={handleDrop(item.id)}
                onEdit={() => handleEdit(item)}
                onDelete={() => onDeleteItem(item.id)}
                onDragStart={handleDragStart(item.id)}
                onDragEnd={handleDragEnd}
              />
            );
          })}
        </div>
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

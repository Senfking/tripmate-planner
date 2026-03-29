import { useState, useRef } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ItineraryItemCard } from "./ItineraryItemCard";
import { ItemFormModal } from "./ItemFormModal";
import type { ItineraryItem } from "@/hooks/useItinerary";

interface Props {
  dayDate: string;
  dayNumber: number;
  items: ItineraryItem[];
  tripId: string;
  myRole?: string;
  onAddItem: (data: any) => void;
  onUpdateItem: (data: any) => void;
  onDeleteItem: (id: string) => void;
  onReorder: (reordered: { id: string; sort_order: number }[]) => void;
  saving?: boolean;
}

export function DaySection({ dayDate, dayNumber, items, tripId, myRole, onAddItem, onUpdateItem, onDeleteItem, onReorder, saving }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<ItineraryItem | null>(null);
  const dragItem = useRef<string | null>(null);

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
    dragItem.current = id;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem.current || dragItem.current === targetId) return;
    const currentOrder = items.map((i) => i.id);
    const fromIdx = currentOrder.indexOf(dragItem.current);
    const toIdx = currentOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragItem.current);
    onReorder(newOrder.map((id, idx) => ({ id, sort_order: idx })));
    dragItem.current = null;
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Day {dayNumber} — {dateLabel}
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
          {items.map((item) => (
            <ItineraryItemCard
              key={item.id}
              item={item}
              tripId={tripId}
              myRole={myRole}
              onEdit={() => handleEdit(item)}
              onDelete={() => onDeleteItem(item.id)}
              onDragStart={handleDragStart(item.id)}
              onDragOver={handleDragOver}
              onDrop={handleDrop(item.id)}
            />
          ))}
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

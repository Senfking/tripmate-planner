import { useMemo, useState } from "react";
import { useItinerary } from "@/hooks/useItinerary";
import { useRouteStops } from "@/hooks/useRouteStops";
import { useItineraryAttendance } from "@/hooks/useItineraryAttendance";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DaySection } from "./DaySection";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarPlus, Download, Loader2 } from "lucide-react";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import { ItemFormModal } from "./ItemFormModal";
import { toast } from "sonner";

/** Convert "HH:MM" or "HH:MM:SS" to minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

interface Props {
  tripId: string;
  myRole?: string;
}

export function ItineraryTab({ tripId, myRole }: Props) {
  const { items, isLoading, addItem, updateItem, deleteItem, reorderItems } = useItinerary(tripId);
  const { stops } = useRouteStops(tripId);
  const { attendance, members, cycleStatus } = useItineraryAttendance(tripId);
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [newDayDate, setNewDayDate] = useState<string | null>(null);
  const [newDayFormOpen, setNewDayFormOpen] = useState(false);

  // Compute all day dates from route stops + existing items
  const allDays = useMemo(() => {
    const dateSet = new Set<string>();

    // Dates from route stops
    (stops || []).forEach((stop) => {
      try {
        const start = parseISO(stop.start_date);
        const end = parseISO(stop.end_date);
        eachDayOfInterval({ start, end }).forEach((d) => dateSet.add(format(d, "yyyy-MM-dd")));
      } catch {}
    });

    // Dates from existing items
    items.forEach((i) => dateSet.add(i.day_date));

    return Array.from(dateSet).sort();
  }, [stops, items]);

  // Map day -> destination from route stops
  const destinationByDay = useMemo(() => {
    const map: Record<string, string> = {};
    (stops || []).forEach((stop) => {
      try {
        const start = parseISO(stop.start_date);
        const end = parseISO(stop.end_date);
        eachDayOfInterval({ start, end }).forEach((d) => {
          map[format(d, "yyyy-MM-dd")] = stop.destination;
        });
      } catch {}
    });
    return map;
  }, [stops]);

  // Hybrid sort: timed items by start_time (as minutes), untimed by sort_order
  const itemsByDay = useMemo(() => {
    const map: Record<string, typeof items> = {};
    items.forEach((i) => {
      if (!map[i.day_date]) map[i.day_date] = [];
      map[i.day_date].push(i);
    });
    for (const day in map) {
      map[day].sort((a, b) => {
        const av = a.start_time ? timeToMinutes(a.start_time) : (a.sort_order ?? 0);
        const bv = b.start_time ? timeToMinutes(b.start_time) : (b.sort_order ?? 0);
        if (av !== bv) return av - bv;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    }
    return map;
  }, [items]);

  const handleAddDay = (date: Date | undefined) => {
    if (!date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    setNewDayDate(dateStr);
    setAddDayOpen(false);
    setNewDayFormOpen(true);
  };

  const handleAddItem = (data: any) => {
    addItem.mutate(data);
  };

  const handleUpdateItem = (data: any) => {
    updateItem.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {allDays.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground">No itinerary days yet.</p>
          <p className="text-sm text-muted-foreground">
            Add a day to start planning activities, or confirm route stops to auto-generate days.
          </p>
        </div>
      )}

      {allDays.map((day, idx) => (
        <DaySection
          key={day}
          dayDate={day}
          dayNumber={idx + 1}
          items={itemsByDay[day] || []}
          tripId={tripId}
          myRole={myRole}
          destination={destinationByDay[day]}
          members={members}
          attendance={attendance}
          onCycleAttendance={(itemId) => cycleStatus.mutate(itemId)}
          onAddItem={handleAddItem}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={(id) => deleteItem.mutate(id)}
          onReorder={(r) => reorderItems.mutate(r)}
          saving={addItem.isPending || updateItem.isPending}
        />
      ))}

      {/* Add Day button */}
      <div className="flex justify-end md:justify-start">
        <Popover open={addDayOpen} onOpenChange={setAddDayOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <CalendarPlus className="h-4 w-4 mr-1.5" />
              Add day
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
            <Calendar mode="single" onSelect={handleAddDay} />
          </PopoverContent>
        </Popover>
      </div>

      {newDayDate && (
        <ItemFormModal
          open={newDayFormOpen}
          onOpenChange={setNewDayFormOpen}
          onSave={(data) => {
            addItem.mutate(data);
            setNewDayFormOpen(false);
            setNewDayDate(null);
          }}
          saving={addItem.isPending}
          dayDate={newDayDate}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useState, Component, type ReactNode } from "react";
import { useItinerary } from "@/hooks/useItinerary";
import { useRouteStops } from "@/hooks/useRouteStops";
import { useItineraryAttendance } from "@/hooks/useItineraryAttendance";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DaySection } from "./DaySection";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarPlus, Download, Loader2, Sparkles, AlertTriangle, SlidersHorizontal } from "lucide-react";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import { ItemFormModal } from "./ItemFormModal";
import { ImportItineraryModal } from "./ImportItineraryModal";
import { TripBuilderFlow } from "@/components/trip-builder/TripBuilderFlow";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { useNavigate } from "react-router-dom";

// Error boundary so the builder never crashes the itinerary page
class BuilderBoundary extends Component<{ children: ReactNode; onClose: () => void }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error("TripBuilder crashed:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6">
          <div className="text-center max-w-sm space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">The trip builder encountered an error.</p>
            <Button onClick={this.props.onClose} className="rounded-xl">Close</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Convert "HH:MM" or "HH:MM:SS" to minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

interface Props {
  tripId: string;
  tripStartDate?: string | null;
  myRole?: string;
  newItemIds?: Set<string>;
}

export function ItineraryTab({ tripId, tripStartDate, myRole, newItemIds }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, isLoading, addItem, batchAddItems, updateItem, deleteItem, reorderItems } = useItinerary(tripId);
  const { stops } = useRouteStops(tripId);
  const { attendance, members, cycleStatus } = useItineraryAttendance(tripId);
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [newDayDate, setNewDayDate] = useState<string | null>(null);
  const [newDayFormOpen, setNewDayFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [icsLoading, setIcsLoading] = useState(false);
  const [lastVisitItemIds, setLastVisitItemIds] = useState<Set<string>>(new Set());
  const [prevLastSeen, setPrevLastSeen] = useState<string | undefined>(undefined);

  // Effect A: fetch last_seen_at on mount
  useEffect(() => {
    if (!tripId || !user) return;
    setPrevLastSeen(undefined);
    setLastVisitItemIds(new Set());

    supabase
      .from("trip_last_seen")
      .select("last_seen_at")
      .eq("trip_id", tripId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data: row }) => {
        setPrevLastSeen(
          row?.last_seen_at ?? new Date(0).toISOString()
        );
      }, () => {
        setPrevLastSeen(new Date(0).toISOString());
      });
  }, [tripId, user?.id]);

  // Effect B: compare once both are ready
  useEffect(() => {
    if (prevLastSeen === undefined) return;
    if (!items) return;
    if (!tripId || !user) return;

    const newIds = items
      .filter(
        (item) =>
          item.created_by !== user.id &&
          item.created_at > prevLastSeen
      )
      .map((item) => item.id);

    setLastVisitItemIds(new Set(newIds));

    supabase.from("trip_last_seen").upsert(
      {
        trip_id: tripId,
        user_id: user.id,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,trip_id" }
    );

    // Reset so new real-time items don't re-trigger this comparison
    setPrevLastSeen(undefined);
  }, [prevLastSeen, isLoading]);

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
      {/* Import with AI */}
      <button
        onClick={() => setImportOpen(true)}
        className="w-full rounded-xl border border-dashed border-[#0D9488]/30 py-3 text-center text-[13px] font-medium text-[#0D9488]/70 hover:border-[#0D9488]/60 hover:text-[#0D9488] transition-colors flex items-center justify-center gap-1.5"
      >
        <Sparkles className="h-4 w-4" />
        Import with Junto AI
      </button>

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
          newItemIds={newItemIds}
           lastVisitItemIds={lastVisitItemIds}
          onCycleAttendance={(itemId) => cycleStatus.mutate(itemId)}
          onAddItem={handleAddItem}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={(id) => deleteItem.mutate(id)}
          onReorder={(r) => reorderItems.mutate(r)}
          onCreateExpenseFromItem={(prefill) => {
            navigate(`/app/trips/${tripId}/expenses`, {
              state: {
                prefillExpense: {
                  title: prefill.title,
                  amount: prefill.amount,
                  currency: prefill.currency,
                  date: prefill.date,
                  itineraryItemId: prefill.itineraryItemId,
                },
              },
            });
          }}
          saving={addItem.isPending || updateItem.isPending}
        />
      ))}

      {/* Add Day */}
      <Popover open={addDayOpen} onOpenChange={setAddDayOpen}>
        <PopoverTrigger asChild>
          <button className="w-full rounded-xl border border-dashed border-muted-foreground/20 py-3 text-center text-[13px] font-medium text-muted-foreground/60 hover:border-primary/40 hover:text-foreground transition-colors flex items-center justify-center gap-1.5">
            <CalendarPlus className="h-4 w-4" />
            Add day
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="center">
          <Calendar mode="single" onSelect={handleAddDay} />
        </PopoverContent>
      </Popover>

      <ImportItineraryModal
        open={importOpen}
        onOpenChange={setImportOpen}
        tripId={tripId}
        tripStartDate={tripStartDate ?? null}
        onAddItem={(data) => addItem.mutate(data)}
        onBatchAddItems={(items) => batchAddItems.mutateAsync(items)}
      />

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

      {/* Add to Calendar - bottom of page */}
      {items.length > 0 && (
        <Button
          variant="ghost"
          className="w-full h-11 gap-2 text-[13px] font-medium text-muted-foreground"
          disabled={icsLoading}
          onClick={async () => {
            setIcsLoading(true);
            try {
              const session = (await supabase.auth.getSession()).data.session;
              if (!session) { toast.error("Please sign in"); return; }
              const res = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-trip-ics?trip_id=${tripId}`,
                { headers: { Authorization: `Bearer ${session.access_token}` } }
              );
              if (!res.ok) throw new Error("Export failed");
              const blob = await res.blob();
              trackEvent("export_downloaded", { trip_id: tripId, format: "ics" }, user?.id);
              const a = document.createElement("a");
              const objUrl = URL.createObjectURL(blob);
              a.href = objUrl;
              a.download = "itinerary.ics";
              a.click();
              URL.revokeObjectURL(objUrl);
            } catch {
              toast.error("Failed to export calendar");
            } finally {
              setIcsLoading(false);
            }
          }}
        >
          {icsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
          Add to Calendar
        </Button>
      )}
    </div>
  );
}

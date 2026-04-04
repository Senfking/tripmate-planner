import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface TripDateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string | null;
  endDate: string | null;
  onSave: (start: string | null, end: string | null) => void;
  saving?: boolean;
}

export function TripDateEditor({
  open,
  onOpenChange,
  startDate,
  endDate,
  onSave,
  saving,
}: TripDateEditorProps) {
  const [range, setRange] = useState<{ from?: Date; to?: Date }>(() => ({
    from: startDate ? new Date(startDate + "T00:00:00") : undefined,
    to: endDate ? new Date(endDate + "T00:00:00") : undefined,
  }));

  // Reset state when drawer opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setRange({
        from: startDate ? new Date(startDate + "T00:00:00") : undefined,
        to: endDate ? new Date(endDate + "T00:00:00") : undefined,
      });
    }
    onOpenChange(v);
  };

  const handleSave = () => {
    const s = range.from ? format(range.from, "yyyy-MM-dd") : null;
    const e = range.to ? format(range.to, "yyyy-MM-dd") : null;
    onSave(s, e);
  };

  const handleClear = () => {
    onSave(null, null);
  };

  const hasChanged =
    (range.from ? format(range.from, "yyyy-MM-dd") : null) !== startDate ||
    (range.to ? format(range.to, "yyyy-MM-dd") : null) !== endDate;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" style={{ color: "#0D9488" }} />
            Trip dates
          </DrawerTitle>
          <DrawerDescription className="text-sm text-muted-foreground">
            {range.from && range.to
              ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`
              : range.from
              ? `From ${format(range.from, "MMM d, yyyy")}`
              : "Select a date range"}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex justify-center px-4 pb-2">
          <Calendar
            mode="range"
            selected={range.from ? { from: range.from, to: range.to } : undefined}
            onSelect={(r) => setRange({ from: r?.from, to: r?.to })}
            numberOfMonths={1}
            className={cn("p-3 pointer-events-auto")}
          />
        </div>

        <div className="px-4 pb-6 space-y-2">
          <Button
            className="w-full h-11 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)" }}
            disabled={!range.from || saving || !hasChanged}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save dates"}
          </Button>
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              className="w-full h-10 rounded-xl text-sm text-muted-foreground"
              onClick={handleClear}
              disabled={saving}
            >
              Clear dates
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

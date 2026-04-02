import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ItineraryItem } from "@/hooks/useItinerary";

interface ItemFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    id?: string;
    title: string;
    start_time?: string | null;
    end_time?: string | null;
    location_text?: string | null;
    notes?: string | null;
    status?: string;
    day_date: string;
  }) => void;
  saving?: boolean;
  dayDate: string;
  item?: ItineraryItem | null;
}

export function ItemFormModal({ open, onOpenChange, onSave, saving, dayDate, item }: ItemFormModalProps) {
  const isMobile = useIsMobile();
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("idea");

  useEffect(() => {
    if (open) {
      setTitle(item?.title || "");
      setStartTime(item?.start_time?.slice(0, 5) || "");
      setEndTime((item as any)?.end_time?.slice(0, 5) || "");
      setLocation(item?.location_text || "");
      setNotes(item?.notes || "");
      setStatus(item?.status || "idea");
    }
  }, [open, item]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: item?.id,
      title: title.trim(),
      start_time: startTime || null,
      end_time: endTime || null,
      location_text: location || null,
      notes: notes || null,
      status,
      day_date: dayDate,
    });
  };

  // Generate time slots every 15 minutes
  const timeSlots = Array.from({ length: 96 }, (_, i) => {
    const h = String(Math.floor(i / 4)).padStart(2, "0");
    const m = String((i % 4) * 15).padStart(2, "0");
    return `${h}:${m}`;
  });

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Visit Colosseum" required />
      </div>
      <div className="space-y-2">
        <Label>Time</Label>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={startTime} onValueChange={setStartTime}>
            <SelectTrigger className="w-[110px]"><SelectValue placeholder="Start" /></SelectTrigger>
            <SelectContent className="max-h-[240px]">
              {timeSlots.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-sm">→</span>
          <Select value={endTime} onValueChange={setEndTime}>
            <SelectTrigger className="w-[110px]"><SelectValue placeholder="End" /></SelectTrigger>
            <SelectContent className="max-h-[240px]">
              {timeSlots.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          {(startTime || endTime) && (
            <button type="button" onClick={() => { setStartTime(""); setEndTime(""); }} className="text-xs text-muted-foreground hover:text-foreground">
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Rome city centre" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any extra details…" rows={3} />
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="idea">💡 Idea</SelectItem>
            <SelectItem value="planned">📋 Planned</SelectItem>
            <SelectItem value="booked">🎫 Booked</SelectItem>
            <SelectItem value="confirmed">✅ Confirmed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={!title.trim() || saving}>
        {saving ? "Saving…" : item ? "Save changes" : "Add activity"}
      </Button>
    </form>
  );

  const heading = item ? "Edit activity" : "Add activity";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="pb-6 max-h-[85dvh]">
          <DrawerHeader className="px-6">
            <DrawerTitle>{heading}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto flex-1 min-h-0 px-6">
            {formContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

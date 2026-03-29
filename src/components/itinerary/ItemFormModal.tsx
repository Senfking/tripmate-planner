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
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("idea");

  useEffect(() => {
    if (open) {
      setTitle(item?.title || "");
      setStartTime(item?.start_time?.slice(0, 5) || "");
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
      location_text: location || null,
      notes: notes || null,
      status,
      day_date: dayDate,
    });
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Visit Colosseum" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="start_time">Start time</Label>
        <Input id="start_time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
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
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="px-0">
            <DrawerTitle>{heading}</DrawerTitle>
          </DrawerHeader>
          {formContent}
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

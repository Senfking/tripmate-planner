import { useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { DateRangePicker } from "./DateRangePicker";

type Props = {
  onSubmit: (data: { destination: string; note?: string; startDate?: string; endDate?: string }) => void;
  isPending: boolean;
};

export function ProposalForm({ onSubmit, isPending }: Props) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const isMobile = useIsMobile();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) return;
    onSubmit({
      destination: destination.trim(),
      note: note.trim() || undefined,
      startDate: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
      endDate: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
    });
    setDestination("");
    setNote("");
    setDateRange(undefined);
    setOpen(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setDateRange(undefined);
    }
  };

  const trigger = (
    <Button variant="outline" size="sm" className="gap-1.5">
      <Plus className="h-4 w-4" />
      Suggest a destination
    </Button>
  );

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="dest">Destination</Label>
        <Input id="dest" placeholder="e.g. Barcelona" value={destination} onChange={(e) => setDestination(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea id="note" placeholder="e.g. Found flights for €180 from Zurich" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label>Dates (optional)</Label>
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          placeholder="Pick travel dates"
          className="w-full"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending || !destination.trim()}>
        {isPending ? "Submitting…" : "Submit suggestion"}
      </Button>
    </form>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="text-left px-0">
            <DrawerTitle>Suggest a destination</DrawerTitle>
          </DrawerHeader>
          {formContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Suggest a destination</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

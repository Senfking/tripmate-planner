import { useState, useEffect } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DateRangePicker } from "./DateRangePicker";

type Props = {
  onSubmit: (data: { destination: string; note?: string; startDate?: string; endDate?: string }) => Promise<void>;
  isPending: boolean;
  fullWidth?: boolean;
};

export function ProposalForm({ onSubmit, isPending, fullWidth }: Props) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const isMobile = useIsMobile();

  // Track virtual keyboard height via Visual Viewport API so the bottom sheet
  // slides up when the keyboard appears (iOS doesn't resize the layout viewport).
  useEffect(() => {
    if (!isMobile || !open) {
      setKeyboardOffset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setKeyboardOffset(0);
    };
  }, [isMobile, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) return;
    try {
      await onSubmit({
        destination: destination.trim(),
        note: note.trim() || undefined,
        startDate: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
        endDate: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
      });
      setDestination("");
      setNote("");
      setDateRange(undefined);
      setOpen(false);
    } catch {
      // Error handled by parent via toast
    }
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={
          isMobile
            ? "fixed left-0 right-0 top-auto translate-x-0 translate-y-0 max-w-full rounded-t-[10px] rounded-b-none px-4 pt-4 pb-6 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-left-0 data-[state=closed]:slide-out-to-left-0 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
            : "max-w-sm"
        }
        style={isMobile ? { bottom: keyboardOffset, transition: "bottom 0.2s ease-out" } : undefined}
      >
        <DialogHeader className={isMobile ? "text-left" : undefined}>
          <DialogTitle>Suggest a destination</DialogTitle>
        </DialogHeader>
        {/* px-1 -mx-1 gives focus rings room to render without being clipped */}
        <div className={isMobile ? "overflow-y-auto max-h-[55dvh] px-1 -mx-1" : undefined}>
          {formContent}
        </div>
      </DialogContent>
    </Dialog>
  );
}

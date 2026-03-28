import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

type Props = {
  onSubmit: (data: { destination: string; note?: string }) => void;
  isPending: boolean;
};

export function ProposalForm({ onSubmit, isPending }: Props) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const isMobile = useIsMobile();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) return;
    onSubmit({
      destination: destination.trim(),
      note: note.trim() || undefined,
    });
    setDestination("");
    setNote("");
    setOpen(false);
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
      <Button type="submit" className="w-full" disabled={isPending || !destination.trim()}>
        {isPending ? "Submitting…" : "Submit suggestion"}
      </Button>
    </form>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
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
    <Dialog open={open} onOpenChange={setOpen}>
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

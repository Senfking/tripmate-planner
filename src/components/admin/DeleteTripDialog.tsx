import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  tripName: string;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteTripDialog({ tripName, onConfirm, isPending }: Props) {
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const matches = typed.trim().toLowerCase() === tripName.trim().toLowerCase();

  const confirmBody = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-center sm:text-left">
        This will permanently delete <strong>{tripName}</strong> and all its data (itinerary,
        expenses, bookings, polls). This action cannot be undone.
      </p>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Type <strong>{tripName}</strong> to confirm:
        </p>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={tripName}
          className="text-sm"
        />
      </div>
    </div>
  );

  const trigger = (
    <Button variant="destructive" size="sm" className="w-full gap-2">
      <Trash2 className="h-3.5 w-3.5" />
      Delete this trip
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTyped(""); }}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Delete trip permanently?</DrawerTitle>
            <DrawerDescription className="sr-only">Confirm trip deletion</DrawerDescription>
          </DrawerHeader>
          <div className="px-4">{confirmBody}</div>
          <DrawerFooter>
            <Button
              variant="destructive"
              disabled={!matches || isPending}
              onClick={() => { if (matches) onConfirm(); }}
            >
              {isPending ? "Deleting…" : "Delete forever"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTyped(""); }}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete trip permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{tripName}</strong> and all its data (itinerary,
            expenses, bookings, polls). This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Type <strong>{tripName}</strong> to confirm:
          </p>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={tripName}
            className="text-sm"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setTyped("")}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!matches || isPending}
            onClick={(e) => {
              if (!matches) { e.preventDefault(); return; }
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Deleting…" : "Delete forever"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

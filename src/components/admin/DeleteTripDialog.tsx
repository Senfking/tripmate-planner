import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  tripName: string;
  onConfirm: () => void;
  isPending: boolean;
}

const ARM_DELAY_MS = 500;

export function DeleteTripDialog({ tripName, onConfirm, isPending }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [armed, setArmed] = useState(false);
  const isMobile = useIsMobile();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setArmed(false);
    }
  }, [open]);

  // Arm the primary button after a short delay whenever the step changes
  useEffect(() => {
    if (!open) return;
    setArmed(false);
    const t = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(t);
  }, [step, open]);

  const trigger = (
    <Button variant="destructive" size="sm" className="w-full gap-2">
      <Trash2 className="h-3.5 w-3.5" />
      Delete this trip
    </Button>
  );

  const title = step === 1 ? "Delete trip permanently?" : "Are you sure?";
  const description =
    step === 1 ? (
      <>
        This will permanently delete <strong>{tripName}</strong> and all its data (itinerary,
        expenses, bookings, polls). This action cannot be undone.
      </>
    ) : (
      <>Last chance — this can&apos;t be undone.</>
    );

  const handlePrimary = () => {
    if (step === 1) {
      setStep(2);
    } else {
      onConfirm();
    }
  };

  const handleSecondary = () => {
    if (step === 2) {
      setStep(1);
    } else {
      setOpen(false);
    }
  };

  const primaryLabel =
    step === 1 ? "Delete trip" : isPending ? "Deleting…" : "Yes, delete forever";
  const secondaryLabel = step === 1 ? "Cancel" : "Go back";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground">
              {description}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button
              variant="destructive"
              disabled={!armed || isPending}
              onClick={handlePrimary}
            >
              {primaryLabel}
            </Button>
            <Button variant="outline" onClick={handleSecondary} disabled={isPending}>
              {secondaryLabel}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleSecondary} disabled={isPending}>
            {secondaryLabel}
          </Button>
          <Button
            variant="destructive"
            disabled={!armed || isPending}
            onClick={handlePrimary}
          >
            {primaryLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

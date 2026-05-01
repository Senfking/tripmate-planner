import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DrawerPrimitive from "vaul";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const srOnly = "absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fills the input — typically the AI-generated itinerary_title. */
  defaultName?: string;
  submitting?: boolean;
  onConfirm: (tripName: string) => void;
}

/**
 * "Name your trip" modal — shown ALWAYS before saving a trip from the AI
 * builder. Pre-filled with the AI-generated itinerary_title so users can
 * accept it with one tap, or rename to something they'll recognize.
 *
 * Rendered above any portaled fullscreen views (e.g. TripResultsView at
 * z-[9999]) — modals are top-of-stack by definition.
 */
export function NameTripModal({ open, onOpenChange, defaultName, submitting, onConfirm }: Props) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [name, setName] = useState(defaultName ?? "");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName ?? "");
      setError(false);
    }
  }, [open, defaultName]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    onConfirm(trimmed);
  };

  const body = (
    <div className="space-y-4 pt-1">
      <p className="text-[13px] text-muted-foreground -mt-1">
        Give it a short name you'll recognize.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="trip-name" className="text-[13px] font-semibold">
          Trip name <span className="text-[#0D9488]">*</span>
        </Label>
        <Input
          id="trip-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error && e.target.value.trim().length > 0) setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="e.g. Girls trip, Iceland 2026, Honeymoon"
          className={cn(
            "h-12 rounded-xl text-[15px]",
            error && "border-red-300 focus-visible:ring-red-200",
          )}
          aria-invalid={error}
          autoFocus
        />
        {error && (
          <p className="text-[12px] text-red-500 pl-1 animate-fade-in">Give your trip a name</p>
        )}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full h-12 rounded-xl font-semibold text-[15px] text-white gap-2 mt-2"
        style={!submitting ? { background: "#0D9488" } : undefined}
      >
        <Sparkles className="h-4 w-4" />
        {submitting ? "Creating…" : "Create trip"}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-[10000] bg-black/80" />
          <DrawerPrimitive.Content className="fixed inset-x-0 bottom-0 z-[10001] mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background">
            <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
            <DrawerHeader className="text-left">
              <DrawerTitle>Name your trip</DrawerTitle>
              <DialogPrimitive.Description className={srOnly}>
                Give your trip a short, recognizable name before saving it.
              </DialogPrimitive.Description>
            </DrawerHeader>
            <div className="px-4 pb-6">{body}</div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[10000] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-[10001] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
          )}
        >
          <DialogHeader>
            <DialogTitle>Name your trip</DialogTitle>
            <VisuallyHidden>
              <DialogDescription>
                Give your trip a short, recognizable name before saving it.
              </DialogDescription>
            </VisuallyHidden>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[70vh]">{body}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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
 */
export function NameTripModal({ open, onOpenChange, defaultName, submitting, onConfirm }: Props) {
  const [name, setName] = useState(defaultName ?? "");
  const [error, setError] = useState(false);

  // Reset to the default whenever the modal re-opens (e.g. user cancels and
  // tries again, or generates a new plan).
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

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Name your trip">
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
            className={`h-12 rounded-xl text-[15px] ${error ? "border-red-300 focus-visible:ring-red-200" : ""}`}
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
    </ResponsiveModal>
  );
}

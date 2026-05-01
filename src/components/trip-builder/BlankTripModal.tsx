import { useState, useCallback } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Sparkles } from "lucide-react";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/decisions/DateRangePicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BlankTripModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState(false);

  const hasName = name.trim().length > 0;
  const canSubmit = hasName && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!user) {
      toast.error("You need to be signed in to create a trip.");
      return;
    }
    if (!hasName) {
      setNameError(true);
      return;
    }
    if (!canSubmit) return;
    setSubmitting(true);
    const trimmedName = name.trim();
    const trimmedDest = destination.trim();
    try {
      const { data: trip, error } = await supabase
        .from("trips")
        .insert({
          name: trimmedName,
          trip_name: trimmedName,
          itinerary_title: trimmedName,
          destination: trimmedDest || trimmedName,
          tentative_start_date: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null,
          tentative_end_date: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      trackEvent("trip_created", { trip_id: trip.id, blank_trip: true });
      toast.success("Trip created!");
      onOpenChange(false);
      // Reset
      setName("");
      setDestination("");
      setDateRange(undefined);
      navigate(`/app/trips/${trip.id}`);
    } catch (err: any) {
      console.error("[BlankTripModal] create trip failed:", err);
      toast.error(err?.message || "Couldn't create your trip. Please try again.");
      setSubmitting(false);
    }
  }, [user, canSubmit, hasName, name, destination, dateRange, navigate, onOpenChange]);

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Create a blank trip">
      <div className="space-y-4 pt-1">
        <p className="text-[13px] text-muted-foreground -mt-1">
          Create a trip you'll fill in as you go — just a name to start.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="blank-name" className="text-[13px] font-semibold">
            Trip name <span className="text-[#0D9488]">*</span>
          </Label>
          <Input
            id="blank-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError && e.target.value.trim().length > 0) setNameError(false);
            }}
            placeholder="e.g. Summer in Europe, Bachelorette Weekend, Family Reunion"
            className={`h-12 rounded-xl text-[15px] ${nameError ? "border-red-300 focus-visible:ring-red-200" : ""}`}
            aria-invalid={nameError}
            autoFocus
          />
          {nameError && (
            <p className="text-[12px] text-red-500 pl-1 animate-fade-in">Give your trip a name</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">
            Dates <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <DateRangePicker value={dateRange} onChange={setDateRange} className="w-full" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="blank-dest" className="text-[13px] font-semibold">
            Destination <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="blank-dest"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Add later if you're not sure yet"
            className="h-12 rounded-xl text-[15px]"
          />
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendlyError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/decisions/DateRangePicker";

const TRAVEL_EMOJIS = [
  "✈️", "🏖️", "🏔️", "🌍", "🗺️", "🚗", "🚂", "⛷️",
  "🏕️", "🎒", "🌴", "🏛️", "🎡", "🚢", "🏄", "🌋",
  "🗼", "🎭", "🍕", "🌸",
];

export default function TripNew() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("✈️");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Trip name is required");
      return;
    }

    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from("trips")
        .insert({
          name: name.trim(),
          emoji,
          tentative_start_date: dateRange?.from
            ? format(dateRange.from, "yyyy-MM-dd")
            : null,
          tentative_end_date: dateRange?.to
            ? format(dateRange.to, "yyyy-MM-dd")
            : null,
        } as any)
        .select()
        .single();

      if (dbError) throw dbError;
      toast.success("Trip created!");
      navigate(`/app/trips/${data.id}`);
    } catch (err: any) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-lg mx-auto">
      <button
        onClick={() => navigate("/app/trips")}
        className="flex items-center gap-1 text-muted-foreground mb-4 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">Back</span>
      </button>

      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <h1 className="text-xl font-bold mb-6">Create a Trip</h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Trip Name *</Label>
              <Input
                id="name"
                placeholder="e.g. Lisbon Summer 2026"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                maxLength={60}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground text-right">{name.length}/60</p>
            </div>

            {/* Date range */}
            <div className="space-y-2">
              <Label>Trip Dates</Label>
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
                className="w-full"
              />
            </div>

            {/* Emoji picker */}
            <div className="space-y-2">
              <Label>Trip Emoji</Label>
              <div className="flex flex-wrap gap-1.5">
                {TRAVEL_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={`flex items-center justify-center h-11 w-11 text-2xl rounded-xl transition-all ${
                      emoji === e
                        ? "bg-primary/20 ring-2 ring-primary scale-110"
                        : "hover:bg-muted"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full h-11 mt-6" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Trip
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

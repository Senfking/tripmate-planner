import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendlyError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Hash } from "lucide-react";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/decisions/DateRangePicker";
import { TabHeroHeader } from "@/components/ui/TabHeroHeader";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMutation } from "@tanstack/react-query";

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
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  const joinMutation = useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc("join_by_code", { _code: code });
      if (error) throw error;
      const result = data as any;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (data: any) => {
      setJoinOpen(false);
      toast.success(`Joined ${data.trip_name || "trip"}!`);
      navigate(`/app/trips/${data.trip_id}`);
    },
    onError: () => {
      setJoinError("Code not found — check with your organiser");
    },
  });
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
    <div className="min-h-screen" style={{ backgroundColor: "#F1F5F9" }}>
      <TabHeroHeader title="New Trip" subtitle="Plan your next adventure" />

      <div className="px-4 mt-4 pb-32 max-w-lg mx-auto w-full">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-[13px] font-semibold text-foreground">Trip Name *</Label>
            <Input
              id="name"
              placeholder="e.g. Lisbon Summer 2026"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              maxLength={60}
              className="h-11 rounded-xl bg-white border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            />
            <p className="text-xs text-muted-foreground text-right">{name.length}/60</p>
          </div>

          {/* Date range */}
          <div className="space-y-2">
            <Label className="text-[13px] font-semibold text-foreground">Trip Dates</Label>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              className="w-full"
            />
          </div>

          {/* Emoji picker */}
          <div className="space-y-2">
            <Label className="text-[13px] font-semibold text-foreground">Trip Emoji</Label>
            <div className="flex flex-wrap gap-1.5 bg-white rounded-xl p-3 border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {TRAVEL_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`flex items-center justify-center h-11 w-11 text-2xl rounded-xl transition-all ${
                    emoji === e
                      ? "bg-[#0D9488]/15 ring-2 ring-[#0D9488] scale-110"
                      : "hover:bg-muted"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full h-12 mt-6 rounded-xl text-[15px] font-semibold text-white shadow-md"
            style={{ background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)" }}
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create Trip
          </Button>
        </form>
      </div>
    </div>
  );
}

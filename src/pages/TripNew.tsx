import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
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
  DrawerDescription,
} from "@/components/ui/drawer";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { useMutation } from "@tanstack/react-query";

const TRAVEL_EMOJIS = [
  "✈️", "🏖️", "🏔️", "🌍", "🗺️", "🚗", "🚂", "⛷️",
  "🏕️", "🎒", "🌴", "🏛️", "🎡", "🚢", "🏄", "🌋",
  "🗼", "🎭", "🍕", "🌸",
];

export default function TripNew() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("✈️");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [createdTripId, setCreatedTripId] = useState<string | null>(null);

  const navigateToTrip = useCallback((tripId: string) => {
    navigate(`/app/trips/${tripId}`);
  }, [navigate]);

  const handleShareWhatsApp = useCallback(() => {
    if (!createdTripId) return;
    const displayName = profile?.display_name || "Someone";
    const refCode = profile?.referral_code || "";
    const text = `✈️ ${displayName} is planning a trip on Junto — the app that replaces group chat chaos.\n\nItineraries, expenses, bookings & decisions all in one place.\n\nTry it free → https://juntotravel.lovable.app/ref?ref=${refCode}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    setTimeout(() => navigateToTrip(createdTripId), 1000);
  }, [createdTripId, profile, navigateToTrip]);

  const handleSkipShare = useCallback(() => {
    setShareOpen(false);
    if (createdTripId) navigateToTrip(createdTripId);
  }, [createdTripId, navigateToTrip]);

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

      const alreadyShown = localStorage.getItem("junto_post_create_share_shown");
      if (alreadyShown) {
        navigate(`/app/trips/${data.id}`);
      } else {
        localStorage.setItem("junto_post_create_share_shown", "true");
        setCreatedTripId(data.id);
        setShareOpen(true);
      }
    } catch (err: any) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F1F5F9" }}>
      <TabHeroHeader title="New Trip" subtitle="Plan your next adventure" />

      <div className="px-4 mt-3 pb-32 max-w-lg mx-auto w-full">
        <button
          onClick={() => navigate("/app/trips")}
          className="flex items-center gap-1 text-sm text-muted-foreground mb-4 bg-transparent border-none cursor-pointer"
        >
          <span>← Back to trips</span>
        </button>
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

          <button
            type="button"
            onClick={() => { setJoinCode(""); setJoinError(""); setJoinOpen(true); }}
            className="w-full text-center text-sm font-medium mt-3 bg-transparent border-none cursor-pointer"
            style={{ color: "#0D9488" }}
          >
            or join an existing trip
          </button>
        </form>

        {/* Join drawer */}
        <Drawer open={joinOpen} onOpenChange={(v) => { setJoinOpen(v); if (!v) { setJoinCode(""); setJoinError(""); } }}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle>Enter invite code</DrawerTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ask a trip organiser for their 6–8 letter code
              </p>
            </DrawerHeader>
            <div className="px-4 pb-6 space-y-4">
              <Input
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase().slice(0, 8)); setJoinError(""); }}
                placeholder="e.g. 6D9MCG"
                className="text-center text-[24px] font-mono tracking-[0.15em] h-14 rounded-xl border-input"
                maxLength={8}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && joinCode.length >= 4 && !joinMutation.isPending) joinMutation.mutate(joinCode);
                }}
              />
              {joinError && (
                <p className="text-xs text-destructive text-center">{joinError}</p>
              )}
              <Button
                className="w-full h-11 rounded-xl text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)" }}
                disabled={joinCode.length < 4 || joinMutation.isPending}
                onClick={() => joinMutation.mutate(joinCode)}
              >
                {joinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join trip"}
              </Button>
            </div>
          </DrawerContent>
        </Drawer>

        {/* Post-create share sheet */}
        <Drawer open={shareOpen} onOpenChange={(v) => { if (!v) handleSkipShare(); }}>
          <DrawerContent>
            <DrawerHeader className="text-center">
              <DrawerTitle className="text-lg">Now invite your crew 🎉</DrawerTitle>
              <DrawerDescription className="text-sm text-muted-foreground mt-1">
                Share Junto so everyone can join the trip — and plan together from day one.
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-6 space-y-3">
              <Button
                className="w-full h-12 rounded-xl text-[15px] font-semibold text-white gap-2"
                style={{ background: "#25D366" }}
                onClick={handleShareWhatsApp}
              >
                <WhatsAppIcon className="h-5 w-5" />
                Share Junto with friends
              </Button>
              <Button
                variant="ghost"
                className="w-full h-12 rounded-xl text-[15px] text-muted-foreground"
                onClick={handleSkipShare}
              >
                Skip for now
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}

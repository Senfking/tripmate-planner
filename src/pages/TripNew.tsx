import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendlyError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Hash, Camera, X, Crop } from "lucide-react";
import { CoverCropOverlay } from "@/components/trip/CoverCropOverlay";
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

const EMOJI_GROUPS = [
  // Popular / quick picks (always visible)
  ["✈️", "🏖️", "🏔️", "🌍", "🚗", "🌴", "❄️", "☀️", "🎒", "🥳"],
  // Transport
  ["🚂", "🚢", "🛳️", "🚌", "🏍️", "🛩️", "🚁", "⛵", "🚲", "🛺", "🚀", "🛶"],
  // Beach & tropical
  ["🏝️", "🤿", "🏄", "🐚", "🦀", "🐠", "🧜", "🌺", "🥥", "🍹"],
  // Mountains & outdoors
  ["⛷️", "🏕️", "🧗", "🚴", "🎿", "⛺", "🦌", "🏊", "🎣", "🛷", "🌲", "🏞️"],
  // Cities & landmarks
  ["🏛️", "🗼", "🗽", "🎡", "🎢", "🕌", "⛩️", "🏰", "🗿", "🎭", "🎪", "🏟️"],
  // Food & drink
  ["🍕", "🍷", "☕", "🍜", "🥘", "🍣", "🌮", "🥐", "🍺", "🧁", "🍝", "🫕", "🥂", "🍦"],
  // Nature & weather
  ["🌸", "🌊", "🌙", "🌈", "🔥", "⭐", "💫", "🌋", "🏜️", "🌻", "🦋", "🐬"],
  // Activities & vibes
  ["📸", "💎", "🎯", "🎶", "❤️", "🧳", "🗺️", "🎨", "🛍️", "💃", "🎵", "🧘", "🎤", "🎮"],
  // Flags & symbols
  ["🇪🇺", "🇺🇸", "🇬🇧", "🇫🇷", "🇪🇸", "🇮🇹", "🇩🇪", "🇯🇵", "🇹🇭", "🇧🇷", "🇦🇺", "🇲🇽", "🇬🇷", "🇵🇹", "🇭🇷", "🇮🇩"],
];

const QUICK_EMOJIS = EMOJI_GROUPS[0];
const ALL_EMOJIS = EMOJI_GROUPS;

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
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [originalCoverUrl, setOriginalCoverUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [showAllEmojis, setShowAllEmojis] = useState(false);

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

      // Upload cover image if selected
      if (coverFile && data.id) {
        const ext = coverFile.name.split(".").pop() || "jpg";
        const path = `covers/${data.id}/cover.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("trip-attachments")
          .upload(path, coverFile, { upsert: true });
        if (!upErr) {
          await supabase.from("trips").update({ cover_image_path: path } as any).eq("id", data.id);
        }
      }

      toast.success("Trip created!");
      localStorage.setItem(`junto_just_created_trip_${data.id}`, "true");
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

          {/* Cover image */}
          <div className="space-y-2">
            <Label className="text-[13px] font-semibold text-foreground">Cover Photo</Label>
            {coverPreview ? (
              <div className="relative rounded-xl overflow-hidden h-[120px] bg-white border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (originalCoverUrl) setCropSource(originalCoverUrl);
                    }}
                    className="h-7 w-7 rounded-full bg-black/50 flex items-center justify-center"
                  >
                    <Crop className="h-3.5 w-3.5 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCoverFile(null); setCoverPreview(null); setCropSource(null); setOriginalCoverUrl(null); }}
                    className="h-7 w-7 rounded-full bg-black/50 flex items-center justify-center"
                  >
                    <X className="h-3.5 w-3.5 text-white" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="w-full h-[80px] rounded-xl border-2 border-dashed border-muted-foreground/20 bg-white flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-muted-foreground/40 transition-colors"
              >
                <Camera className="h-5 w-5" />
                <span className="text-xs font-medium">Add cover photo</span>
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith("image/")) { toast.error("Please select an image"); return; }
                if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
                const objectUrl = URL.createObjectURL(file);
                setOriginalCoverUrl(objectUrl);
                setCropSource(objectUrl);
                e.target.value = "";
              }}
            />
          </div>

          {/* Emoji picker */}
          <div className="space-y-2">
            <Label className="text-[13px] font-semibold text-foreground">Trip Emoji</Label>
            <div className="bg-white rounded-xl p-3 border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {/* Quick picks */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_EMOJIS.map((e) => (
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

              {/* Expanded categories */}
              {showAllEmojis && (
                <div className="mt-2 space-y-1.5 max-h-[260px] overflow-y-auto">
                  {ALL_EMOJIS.slice(1).map((group, gi) => (
                    <div key={gi}>
                      {gi > 0 && <div className="h-px bg-muted my-1.5" />}
                      <div className="flex flex-wrap gap-1.5">
                        {group.map((e) => (
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
                  ))}
                </div>
              )}

              {/* Toggle */}
              <button
                type="button"
                onClick={() => setShowAllEmojis(!showAllEmojis)}
                className="w-full mt-2 text-xs font-medium py-1.5 rounded-lg hover:bg-muted transition-colors"
                style={{ color: "#0D9488" }}
              >
                {showAllEmojis ? "Show less" : "Show more emojis"}
              </button>
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
      </div>

      {/* Crop overlay */}
      {cropSource && (
        <CoverCropOverlay
          imageSrc={cropSource}
          onSave={(blob) => {
            setCoverFile(new File([blob], "cover.jpg", { type: "image/jpeg" }));
            setCoverPreview(URL.createObjectURL(blob));
            // Don't clear cropSource — store original for re-crop via state
            setCropSource(null);
          }}
          onCancel={() => setCropSource(null)}
        />
      )}
    </div>
  );
}

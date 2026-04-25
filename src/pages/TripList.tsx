import { useState, useCallback, useRef, useMemo } from "react";
import { DesktopFooter } from "@/components/DesktopFooter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Users, Plus, Plane, Calendar, Radio, Hash, ChevronRight, X, Copy, Sparkles, Trash2 } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { toast } from "sonner";
import { format, differenceInDays, isAfter, isBefore, isWithinInterval, parseISO, isToday, isTomorrow } from "date-fns";
import { resolvePhoto, DEFAULT_TRIP_PHOTO } from "@/lib/tripPhoto";
import { useSeedTripCoverUrls, useTripCoverUrl } from "@/hooks/useTripCoverUrl";
import { TabHeroHeader, type HeroPill } from "@/components/ui/TabHeroHeader";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";
import type { AITripResult } from "@/components/trip-results/useResultsState";
import { RotatingPlaceholder } from "@/components/landing/RotatingPlaceholder";

/* ─── Status logic ─── */
type TripStatus = "live" | "countdown" | "upcoming" | "ended" | "no-dates";

function getTripStatus(start: string | null, end: string | null): { status: TripStatus; daysToGo?: number } {
  // No start_date → draft (can't classify on the timeline)
  if (!start) return { status: "no-dates" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const s = parseISO(start);
  const e = end ? parseISO(end) : null;

  // Ended: end date exists and is strictly before today
  if (e && isBefore(e, today)) return { status: "ended" };

  // Live: today within [start, end]. Without an end date we can't know if it's still ongoing,
  // so treat start-without-end as upcoming/ended based on the start date only.
  if (e && isWithinInterval(today, { start: s, end: e })) return { status: "live" };

  // Future
  if (isAfter(s, today)) {
    const days = differenceInDays(s, today);
    if (days <= 60) return { status: "countdown", daysToGo: days };
    return { status: "upcoming" };
  }
  // Start in the past with no end date → can't be classified as live; treat as undated
  if (!e) return { status: "no-dates" };
  return { status: "upcoming" };
}

/* ─── Sorting ─── */
type EnrichedTrip = {
  id: string;
  name: string;
  emoji: string | null;
  tentative_start_date: string | null;
  tentative_end_date: string | null;
  created_at: string;
  memberCount: number;
  photoUrl: string;
  coverImagePath: string | null;
  coverFocalPoint: string | null;
  statusInfo: ReturnType<typeof getTripStatus>;
  members?: { user_id: string; profile?: { display_name: string | null; avatar_url?: string | null } }[];
  nextActivity?: { title: string; day_date: string; start_time: string | null } | null;
};

function sortTrips(trips: EnrichedTrip[]): EnrichedTrip[] {
  const active: EnrichedTrip[] = [];
  const upcoming: EnrichedTrip[] = [];
  const noDates: EnrichedTrip[] = [];
  const past: EnrichedTrip[] = [];

  for (const t of trips) {
    switch (t.statusInfo.status) {
      case "live": active.push(t); break;
      case "countdown":
      case "upcoming": upcoming.push(t); break;
      case "no-dates": noDates.push(t); break;
      case "ended": past.push(t); break;
    }
  }

  active.sort((a, b) => (a.tentative_start_date ?? "").localeCompare(b.tentative_start_date ?? ""));
  upcoming.sort((a, b) => (a.tentative_start_date ?? "").localeCompare(b.tentative_start_date ?? ""));
  noDates.sort((a, b) => a.name.localeCompare(b.name));
  past.sort((a, b) => (b.tentative_end_date ?? "").localeCompare(a.tentative_end_date ?? ""));

  return [...active, ...upcoming, ...noDates, ...past];
}

/* ─── Date formatting ─── */
function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return "Dates TBD";
  if (start && end)
    return `${format(parseISO(start), "MMM d")} – ${format(parseISO(end), "MMM d, yyyy")}`;
  if (start) return `From ${format(parseISO(start), "MMM d, yyyy")}`;
  return `Until ${format(parseISO(end!), "MMM d, yyyy")}`;
}

function getInitial(name: string | null | undefined) {
  return (name || "?").charAt(0).toUpperCase();
}

/* ─── Status Badge ─── */
function StatusBadge({ info }: { info: ReturnType<typeof getTripStatus> | undefined }) {
  if (!info) return null;
  switch (info.status) {
    case "live":
      return (
        <span className="flex items-center gap-1.5 rounded-full bg-red-500/80 backdrop-blur-sm px-2.5 py-1 text-[11px] font-semibold text-white">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          Live
        </span>
      );
    case "countdown":
      return (
        <span className="rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-white">
          {info.daysToGo === 0 ? "Today!" : info.daysToGo === 1 ? "Tomorrow" : `${info.daysToGo}d to go`}
        </span>
      );
    case "upcoming":
      return (
        <span className="rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-2.5 py-1 text-[11px] font-medium text-white/80">
          Upcoming
        </span>
      );
    case "ended":
      return (
        <span className="rounded-full bg-black/30 backdrop-blur-sm px-2.5 py-1 text-[11px] font-medium text-white/60">
          Ended
        </span>
      );
    default:
      return null;
  }
}

/* ─── Next activity label ─── */
function formatNextActivity(item: { title: string; day_date: string; start_time: string | null }): string {
  const d = parseISO(item.day_date);
  let when: string;
  if (isToday(d)) {
    if (item.start_time) {
      const hour = parseInt(item.start_time.split(":")[0], 10);
      when = hour >= 17 ? "Tonight" : "Today";
    } else {
      when = "Today";
    }
  } else if (isTomorrow(d)) {
    when = "Tomorrow";
  } else {
    when = format(d, "MMM d");
  }
  return `▶ ${when} · ${item.title}`;
}

/* ─── Hero Card (Live Trip) ─── */
function HeroCard({ trip }: { trip: EnrichedTrip }) {
  const visibleMembers = trip.members?.slice(0, 4) ?? [];
  const memberCount = trip.memberCount;

  return (
    <Link to={`/app/trips/${trip.id}`} className="block">
      <div className="relative h-[320px] rounded-3xl overflow-hidden shadow-2xl">
        <img
          src={trip.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: trip.coverFocalPoint || "center" }}
          loading="eager"
          onError={(e) => { e.currentTarget.src = DEFAULT_TRIP_PHOTO; }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85) 100%)",
          }}
        />

        {/* Status badge - top right */}
        <div className="absolute right-4 top-4">
          <StatusBadge info={trip.statusInfo} />
        </div>

        {/* Bottom content */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "#0D9488" }}>
              Happening now
            </span>
            <p className="text-2xl font-bold leading-tight text-white mt-0.5 line-clamp-2">
              {trip.name}
            </p>
            <p className="text-sm text-white/70 mt-0.5">
              {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
            </p>
            {trip.nextActivity && (
              <p className="text-xs text-white/60 mt-1">
                {formatNextActivity(trip.nextActivity)}
              </p>
            )}
          </div>

          {/* Avatar stack + count */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center -space-x-2">
              {visibleMembers.map((m) => (
                <Avatar key={m.user_id} className="h-7 w-7 ring-2 ring-white/50">
                  {m.profile?.avatar_url && (
                    <AvatarImage src={m.profile.avatar_url} alt={m.profile?.display_name || ""} />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-medium">
                    {getInitial(m.profile?.display_name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            {memberCount > 0 && (
              <span className="text-[11px] text-white/70 font-medium">
                {memberCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─── Regular Card (Upcoming / Ended / No-dates) ─── */
function RegularCard({ trip }: { trip: EnrichedTrip }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let progress = 0;
  if (trip.tentative_start_date) {
    const start = parseISO(trip.tentative_start_date);
    const created = parseISO(trip.created_at);
    const totalSpan = differenceInDays(start, created);
    const elapsed = differenceInDays(today, created);
    if (totalSpan > 0) {
      progress = Math.min(1, Math.max(0, elapsed / totalSpan));
    }
  }

  return (
    <Link to={`/app/trips/${trip.id}`} className="block">
      <div className="relative h-[160px] rounded-2xl overflow-hidden shadow-lg">
        <img
          src={trip.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: trip.coverFocalPoint || "center" }}
          loading="lazy"
          onError={(e) => { e.currentTarget.src = DEFAULT_TRIP_PHOTO; }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.10) 100%)",
          }}
        />

        <div className="absolute right-3 top-3">
          <StatusBadge info={trip.statusInfo} />
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3.5">
          <p className="text-lg font-bold leading-tight text-white line-clamp-2">
            {trip.emoji || "✈️"} {trip.name}
          </p>
          <p className="mt-0.5 text-sm text-white/70">
            {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
          </p>
        </div>

        <div className="absolute bottom-3.5 right-4 flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-sm px-2 py-0.5 text-[11px] text-white/60">
          <Users className="h-3 w-3" />
          <span>{trip.memberCount}</span>
        </div>

        {trip.statusInfo.status !== "ended" && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: "rgba(255,255,255,0.2)" }}>
            <div
              className="h-full"
              style={{ width: `${progress * 100}%`, background: "rgba(255,255,255,0.7)" }}
            />
          </div>
        )}
      </div>
    </Link>
  );
}

/* ─── Greeting helper ─── */
function getGreeting(displayName: string | null | undefined): string {
  const hour = new Date().getHours();
  const first = displayName?.split(" ")[0] ?? "";
  const name = first ? `, ${first}` : "";
  if (hour >= 6 && hour < 12) return `Good morning${name}`;
  if (hour >= 12 && hour < 18) return `Good afternoon${name}`;
  return `Good evening${name}`;
}

/* ─── Join Drawer ─── */
function JoinDrawer({
  open, onOpenChange, code, onCodeChange, error, loading, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  code: string;
  onCodeChange: (v: string) => void;
  error: string;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Enter invite code</DrawerTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ask a trip organiser for their 6–8 letter code
          </p>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4">
          <Input
            value={code}
            onChange={(e) => onCodeChange(e.target.value.slice(0, 8))}
            placeholder="e.g. 6D9MCG"
            className="text-center text-[24px] font-mono tracking-[0.15em] h-14 rounded-xl border-input"
            maxLength={8}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.length >= 4 && !loading) onSubmit();
            }}
          />
          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
          )}
          <Button
            className="w-full h-11 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)" }}
            disabled={code.length < 4 || loading}
            onClick={onSubmit}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join trip"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ─── Main Page ─── */
export default function TripList() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [emptyDestination, setEmptyDestination] = useState("");
  const [showBuilder, setShowBuilder] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [builderInitDest, setBuilderInitDest] = useState("");
  const [draftToResume, setDraftToResume] = useState<{ planId: string; result: AITripResult } | null>(null);
  const [referralDismissed, setReferralDismissed] = useState(
    () => localStorage.getItem("junto_referral_card_dismissed") === "true"
  );

  // Post-trip nudge: find the most recently ended trip that hasn't been dismissed
  const dismissedNudges = useRef<Set<string>>(
    new Set(JSON.parse(localStorage.getItem("junto_post_trip_nudge_dismissed") || "[]"))
  );
  const [nudgeDismissedState, setNudgeDismissedState] = useState(0);

  const handleDismissNudge = useCallback((tripId: string) => {
    dismissedNudges.current.add(tripId);
    localStorage.setItem("junto_post_trip_nudge_dismissed", JSON.stringify([...dismissedNudges.current]));
    setNudgeDismissedState((n) => n + 1);
  }, []);

  const handleNudgeWhatsApp = useCallback((tripName: string) => {
    const displayName = profile?.display_name || "Someone";
    const refCode = (profile as any)?.referral_code || "";
    const text = `Hey! I just planned "${tripName}" with Junto and it made everything so much easier - itinerary, expenses, group decisions, all in one place.\n\nIf you're planning a trip, check it out → https://junto.pro/ref?ref=${refCode}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }, [profile]);

  const handleNudgeCopyLink = useCallback(() => {
    const refCode = (profile as any)?.referral_code || "";
    navigator.clipboard.writeText(`https://junto.pro/ref?ref=${refCode}`);
    toast.success("Link copied!");
  }, [profile]);

  const handleDismissReferral = useCallback(() => {
    setReferralDismissed(true);
    localStorage.setItem("junto_referral_card_dismissed", "true");
  }, []);

  const handleReferralWhatsApp = useCallback(() => {
    const displayName = profile?.display_name || "Someone";
    const refCode = (profile as any)?.referral_code || "";
    const text = `✈️ ${displayName} thinks you'd love Junto.\n\nGroup trips are chaos - 200-message threads, spreadsheets, nobody knowing who booked what.\n\nJunto fixes that. One place for your itinerary, expenses, bookings and group decisions.\n\nTry it free → https://junto.pro/ref?ref=${refCode}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }, [profile]);

  const handleCopyReferralLink = useCallback(() => {
    const refCode = (profile as any)?.referral_code || "";
    navigator.clipboard.writeText(`https://junto.pro/ref?ref=${refCode}`);
    toast.success("Link copied!");
  }, [profile]);

  const seedCoverUrls = useSeedTripCoverUrls();
  const coverUrlSeederRef = useRef(seedCoverUrls);
  coverUrlSeederRef.current = seedCoverUrls;
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

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
      setJoinCode("");
      setJoinError("");
      toast.success(`Joined ${data.trip_name || "trip"}!`);
      navigate(`/app/trips/${data.trip_id}`);
    },
    onError: (err: any) => {
      if (err.message === "already_member") {
        setJoinError("");
        setJoinOpen(false);
        setJoinCode("");
        const tripId = (err as any)?.trip_id;
        if (tripId) navigate(`/app/trips/${tripId}`);
        else toast.info("You're already a member of this trip");
      } else {
        setJoinError("Code not found - check with your organiser");
      }
    },
  });

  const { data: trips, isLoading } = useQuery({
    queryKey: ["trips", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*");
      if (error) throw error;

      const tripIds = data.map((t) => t.id);

      const [membersResult, stopsResult, memberDetailsResult, activitiesResult] = await Promise.allSettled([
        supabase.from("trip_members").select("trip_id").in("trip_id", tripIds),
        supabase
          .from("trip_route_stops" as any)
          .select("trip_id, destination")
          .in("trip_id", tripIds)
          .order("start_date", { ascending: true }),
        supabase
          .from("trip_members")
          .select("trip_id, user_id")
          .in("trip_id", tripIds)
          .order("joined_at", { ascending: true })
          .limit(500),
        supabase
          .from("itinerary_items")
          .select("trip_id, title, day_date, start_time")
          .in("trip_id", tripIds)
          .gte("day_date", new Date().toISOString().split("T")[0])
          .order("day_date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(200),
      ]);

      const membersRes = membersResult.status === "fulfilled" ? membersResult.value : { data: null };
      const stopsRes = stopsResult.status === "fulfilled" ? stopsResult.value : { data: null };
      const memberDetailsRes = memberDetailsResult.status === "fulfilled" ? memberDetailsResult.value : { data: null };
      const activitiesRes = activitiesResult.status === "fulfilled" ? activitiesResult.value : { data: null };

      const countMap: Record<string, number> = {};
      membersRes.data?.forEach((m: any) => {
        countMap[m.trip_id] = (countMap[m.trip_id] || 0) + 1;
      });

      const stopDestsMap: Record<string, string[]> = {};
      (stopsRes.data as any[] | null)?.forEach((s: any) => {
        if (!stopDestsMap[s.trip_id]) stopDestsMap[s.trip_id] = [];
        stopDestsMap[s.trip_id].push(s.destination);
      });

      const membersByTrip: Record<string, { user_id: string }[]> = {};
      memberDetailsRes.data?.forEach((m: any) => {
        if (!membersByTrip[m.trip_id]) membersByTrip[m.trip_id] = [];
        if (membersByTrip[m.trip_id].length < 5) {
          membersByTrip[m.trip_id].push({ user_id: m.user_id });
        }
      });

      const allUserIds = [...new Set(Object.values(membersByTrip).flat().map((m) => m.user_id))];
      let profileMap = new Map<string, { display_name: string | null; avatar_url?: string | null }>();
      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase.rpc("get_public_profiles", { _user_ids: allUserIds });
        profileMap = new Map(profiles?.map((p: any) => [p.id, p]) ?? []);
      }

      const nextActivityMap: Record<string, { title: string; day_date: string; start_time: string | null }> = {};
      activitiesRes.data?.forEach((a: any) => {
        if (!nextActivityMap[a.trip_id]) {
          nextActivityMap[a.trip_id] = { title: a.title, day_date: a.day_date, start_time: a.start_time };
        }
      });

      // Fetch signed URLs for trips with custom covers, reusing cached URLs
      const tripsWithCovers = data.filter((t: any) => t.cover_image_path);
      const signedUrlMap: Record<string, string> = {};
      if (tripsWithCovers.length > 0) {
        const needsFetch: typeof tripsWithCovers = [];
        for (const t of tripsWithCovers) {
          const cached = queryClientRef.current.getQueryData<string>(
            ["trip-cover-url", t.id, t.cover_image_path]
          );
          if (cached) {
            signedUrlMap[t.id] = cached;
          } else {
            needsFetch.push(t);
          }
        }
        if (needsFetch.length > 0) {
          await Promise.all(
            needsFetch.map(async (t: any) => {
              const { data: urlData } = await supabase.storage
                .from("trip-attachments")
                .createSignedUrl(t.cover_image_path, 7 * 24 * 60 * 60);
              if (urlData?.signedUrl) signedUrlMap[t.id] = urlData.signedUrl;
            })
          );
        }
      }

      // Seed the shared cover-url cache so TripHome reuses the same signed URLs
      coverUrlSeederRef.current(
        tripsWithCovers
          .filter((t: any) => signedUrlMap[t.id])
          .map((t: any) => ({
            tripId: t.id,
            coverImagePath: t.cover_image_path,
            signedUrl: signedUrlMap[t.id],
          }))
      );

      const enriched: EnrichedTrip[] = data.map((t) => {
        const statusInfo = getTripStatus(t.tentative_start_date, t.tentative_end_date);
        const photoUrl = signedUrlMap[t.id] || resolvePhoto(t.name, stopDestsMap[t.id] ?? []);
        const tripMembers = (membersByTrip[t.id] ?? []).map((m) => ({
          ...m,
          profile: profileMap.get(m.user_id),
        }));
        return {
          id: t.id,
          name: t.name,
          emoji: t.emoji,
          tentative_start_date: t.tentative_start_date,
          tentative_end_date: t.tentative_end_date,
          created_at: t.created_at,
          memberCount: countMap[t.id] || 0,
          photoUrl,
          coverImagePath: (t as any).cover_image_path ?? null,
          coverFocalPoint: (t as any).cover_focal_point ?? null,
          statusInfo,
          members: tripMembers,
          nextActivity: nextActivityMap[t.id] ?? null,
        };
      });

      return sortTrips(enriched);
    },
    enabled: !!user,
  });

  // ── Drafts query (ai_trip_plans with no trip_id) ──
  const { data: drafts } = useQuery({
    queryKey: ["ai-drafts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_trip_plans" as any)
        .select("id, result, created_at")
        .is("trip_id", null)
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.from("ai_trip_plans" as any).delete().eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-drafts"] });
      toast.success("Draft deleted");
    },
    onError: () => toast.error("Failed to delete draft"),
  });

  const postTripNudge = useMemo(() => {
    if (!trips || trips.length === 0) return null;
    const ended = trips
      .filter((t) => t.statusInfo.status === "ended" && !dismissedNudges.current.has(t.id))
      .sort((a, b) => (b.tentative_end_date ?? "").localeCompare(a.tentative_end_date ?? ""));
    return ended[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, nudgeDismissedState]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background">
        <TabHeroHeader title="Your trips" subtitle="Loading…" />
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-4 mt-4">
          <div className="h-[320px] rounded-3xl skeleton-shimmer" style={{ opacity: 0.1 }} />
          <div className="h-[160px] rounded-2xl skeleton-shimmer" style={{ opacity: 0.1, animationDelay: "150ms" }} />
        </div>
      </div>
    );
  }

  const greeting = getGreeting(profile?.display_name);
  const tripCount = trips?.length ?? 0;
  const liveCount = trips?.filter((t) => t.statusInfo.status === "live").length ?? 0;
  const nextCountdown = trips?.find((t) => t.statusInfo.status === "countdown");

  const subtitle = (() => {
    if (tripCount === 0) return "No trips yet - start planning!";
    if (liveCount > 0) return `${tripCount} trip${tripCount !== 1 ? "s" : ""} · ${liveCount} happening now`;
    if (nextCountdown?.statusInfo.daysToGo !== undefined)
      return `${tripCount} trip${tripCount !== 1 ? "s" : ""} · next in ${nextCountdown.statusInfo.daysToGo}d`;
    return `${tripCount} trip${tripCount !== 1 ? "s" : ""}`;
  })();

  // Actionable pills - quick actions
  const tripsPills: HeroPill[] = [
    { icon: <Hash className="h-3 w-3" />, label: "Join", onClick: () => { setJoinCode(""); setJoinError(""); setJoinOpen(true); } },
    { icon: <Plus className="h-3 w-3" />, label: "New trip", to: "/app/trips/new" },
  ];
  if (liveCount > 0) {
    tripsPills.unshift({ icon: <Radio className="h-3 w-3" />, label: `${liveCount} live` });
  }

  /* ── Standalone builder overlay ── */
  if (showBuilder || draftToResume) {
    return (
      <StandaloneTripBuilder
        onClose={() => {
          setShowBuilder(false);
          setDraftToResume(null);
          setBuilderInitDest("");
          queryClient.invalidateQueries({ queryKey: ["ai-drafts"] });
          queryClient.invalidateQueries({ queryKey: ["trips"] });
        }}
        initialDestination={builderInitDest || undefined}
        draftPlanId={draftToResume?.planId}
        draftResult={draftToResume?.result}
      />
    );
  }

  /* ── Empty state ── */
  if (!trips || trips.length === 0) {
    return (
      <div className="relative min-h-dvh flex flex-col bg-background">
        <TabHeroHeader title={greeting} subtitle="No trips yet — start planning!" pills={tripsPills} />

        <div className="hidden md:block pt-6 pb-4 px-4">
          <h1 className="text-2xl font-bold text-foreground">{greeting}</h1>
          <p className="text-sm text-muted-foreground mt-1">No trips yet — start planning!</p>
        </div>

        <div className="flex flex-1 flex-col items-center px-6 pt-12 md:pt-4 mt-4 md:mt-0 max-w-md mx-auto w-full">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488]/10 mb-4">
            <Sparkles className="h-8 w-8 text-[#0D9488]" />
          </div>
          <h2 className="text-xl font-bold text-foreground text-center">Where do you want to go?</h2>
          <p className="mt-1.5 text-sm text-muted-foreground text-center">
            Describe your dream trip and let Junto AI plan it for you
          </p>

          {/* Landing-style rotating input */}
          <div className="w-full mt-5">
            <div
              className="relative rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-border overflow-hidden"
            >
              <RotatingPlaceholder
                value={emptyDestination}
                onChange={setEmptyDestination}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && emptyDestination.trim()) {
                    setBuilderInitDest(emptyDestination.trim());
                    setShowBuilder(true);
                  }
                }}
              />
            </div>
            <Button
              onClick={() => {
                setBuilderInitDest(emptyDestination.trim());
                setShowBuilder(true);
              }}
              className="w-full mt-2.5 h-12 rounded-xl font-semibold text-white text-sm"
              style={{ background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)" }}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Plan with AI
            </Button>
          </div>

          <button
            onClick={() => {
              setBuilderInitDest("");
              setShowBuilder(true);
            }}
            className="mt-3 text-sm font-medium bg-transparent border-none cursor-pointer"
            style={{ color: "#0D9488" }}
          >
            or plan step by step
          </button>

          <div className="w-full h-px bg-border my-6" />

          <button
            className="text-sm font-medium bg-transparent border-none cursor-pointer"
            style={{ color: "#0D9488" }}
            onClick={() => setJoinOpen(true)}
          >
            Join an existing trip with a code
          </button>
        </div>
        <JoinDrawer
          open={joinOpen}
          onOpenChange={(v) => { setJoinOpen(v); if (!v) { setJoinCode(""); setJoinError(""); } }}
          code={joinCode}
          onCodeChange={(v) => { setJoinCode(v.toUpperCase()); setJoinError(""); }}
          error={joinError}
          loading={joinMutation.isPending}
          onSubmit={() => joinMutation.mutate(joinCode)}
        />
      </div>
    );
  }

  /* ── Group trips by section ── */
  const liveTrip = trips.find((t) => t.statusInfo.status === "live");
  const upcomingTrips = trips.filter(
    (t) => t !== liveTrip && (t.statusInfo.status === "countdown" || t.statusInfo.status === "upcoming")
  );
  const noDateTrips = trips.filter((t) => t.statusInfo.status === "no-dates");
  const pastTrips = trips.filter((t) => t.statusInfo.status === "ended");

  return (
    <div className="relative min-h-dvh flex flex-col bg-background">
      <TabHeroHeader title={greeting} subtitle={subtitle} pills={tripsPills} />

      {/* Desktop compact greeting - replaces hero */}
      <div className="hidden md:block pt-6 pb-4 px-8 max-w-[900px] mx-auto">
        <h1 className="text-2xl font-bold text-foreground">{greeting}</h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {/* ── Happening now ── */}
      {liveTrip && (
        <div className="mx-auto w-full max-w-md md:max-w-[900px] px-4 md:px-8 mt-4 md:mt-0 mb-5">
          <HeroCard trip={liveTrip} />
        </div>
      )}

      {/* ── Coming up ── */}
      {upcomingTrips.length > 0 && (
        <div className="mx-auto w-full max-w-md md:max-w-[900px] px-4 md:px-8 mt-4 md:mt-0 mb-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Coming up</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {upcomingTrips.map((trip, i) => (
              <div
                key={trip.id}
                className={
                  upcomingTrips.length % 2 !== 0 && i === upcomingTrips.length - 1
                    ? "md:col-span-2"
                    : ""
                }
              >
                <RegularCard trip={trip} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── No dates yet (compact cards, full-bleed carousel) ── */}
      {noDateTrips.length > 0 && (
        <div className="mb-5">
          <div className="mx-auto w-full max-w-md md:max-w-[900px] px-4 md:px-8">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">No dates yet</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide pl-4 md:pl-[max(2rem,calc((100vw-900px)/2+2rem))]">
            {noDateTrips.map((trip) => (
              <Link
                key={trip.id}
                to={`/app/trips/${trip.id}`}
                className="group relative shrink-0 w-[220px] h-[120px] rounded-2xl overflow-hidden shadow-md text-left active:scale-[0.98] transition-transform"
              >
                <img
                  src={trip.photoUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: trip.coverFocalPoint || "center" }}
                  loading="lazy"
                  onError={(e) => { e.currentTarget.src = DEFAULT_TRIP_PHOTO; }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.30) 55%, rgba(0,0,0,0.10) 100%)",
                  }}
                />

                {/* Member count - top right */}
                {trip.memberCount > 0 && (
                  <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-white">
                    <Users className="h-3 w-3" />
                    {trip.memberCount}
                  </span>
                )}

                {/* Bottom content */}
                <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
                  <p className="text-[15px] font-bold text-white leading-tight line-clamp-1">
                    {trip.emoji ? `${trip.emoji} ` : ""}{trip.name}
                  </p>
                  <p className="text-[11px] text-white/75 mt-0.5">Dates TBD</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Drafts Section (full-bleed carousel) ── */}
      {drafts && drafts.length > 0 && (
        <div className="mb-5">
          <div className="mx-auto w-full max-w-md md:max-w-[900px] px-4 md:px-8">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Drafts</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide pl-4 md:pl-[max(2rem,calc((100vw-900px)/2+2rem))]">
            {drafts.map((draft: any) => {
              const result = draft.result as AITripResult;
              const destName = result?.destinations?.[0]?.name || "Draft trip";
              const actCount = result?.total_activities || result?.destinations?.reduce((sum: number, d: any) => sum + (d.days?.reduce((ds: number, day: any) => ds + (day.activities?.length || 0), 0) || 0), 0) || 0;
              const startDate = result?.destinations?.[0]?.start_date;
              const endDate = result?.destinations?.[result.destinations.length - 1]?.end_date;
              let dateLabel = "";
              try {
                if (startDate && endDate) dateLabel = `${format(parseISO(startDate), "MMM d")} – ${format(parseISO(endDate), "MMM d")}`;
                else if (startDate) dateLabel = format(parseISO(startDate), "MMM d, yyyy");
              } catch {}
              const photoUrl = resolvePhoto(destName, []);

              return (
                <button
                  key={draft.id}
                  onClick={() => setDraftToResume({ planId: draft.id, result })}
                  className="group relative shrink-0 w-[220px] h-[120px] rounded-2xl overflow-hidden shadow-md text-left active:scale-[0.98] transition-transform"
                >
                  <img
                    src={photoUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.src = DEFAULT_TRIP_PHOTO; }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.30) 55%, rgba(0,0,0,0.10) 100%)",
                    }}
                  />

                  {/* Draft badge - top left */}
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Draft
                  </span>

                  {/* Dismiss - top right */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteDraftMutation.mutate(draft.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        deleteDraftMutation.mutate(draft.id);
                      }
                    }}
                    className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm hover:bg-destructive/80 transition-colors cursor-pointer"
                    aria-label="Delete draft"
                  >
                    <X className="h-3.5 w-3.5 text-white" />
                  </span>

                  {/* Bottom content */}
                  <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
                    <p className="text-[15px] font-bold text-white leading-tight line-clamp-1">{destName}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px] text-white/75">
                        {dateLabel || `${actCount} ${actCount === 1 ? "activity" : "activities"}`}
                      </p>
                      <span className="text-[11px] font-semibold text-white/90 flex items-center gap-0.5">
                        Continue <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Past trips (collapsed by default) ── */}
      {pastTrips.length > 0 && (
        <div className="mx-auto w-full max-w-md md:max-w-[900px] px-4 md:px-8 mb-5">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 py-1"
          >
            <span>{showPast ? "Past trips" : `Show past trips (${pastTrips.length})`}</span>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showPast ? "rotate-90" : ""}`} />
          </button>
          {showPast && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 opacity-75">
              {pastTrips.map((trip, i) => (
                <div
                  key={trip.id}
                  className={
                    pastTrips.length % 2 !== 0 && i === pastTrips.length - 1
                      ? "md:col-span-2"
                      : ""
                  }
                >
                  <RegularCard trip={trip} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="mx-auto grid w-full max-w-md md:max-w-[900px] grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 px-4 md:px-8 pb-[calc(env(safe-area-inset-bottom,0px)+260px)] md:pb-8"
      >


        {/* Post-trip referral nudge */}
        {postTripNudge && (profile as any)?.referral_code && (
          <div
            className="md:col-span-2 rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #0f766e 0%, #0D9488 50%, #0891b2 100%)",
            }}
          >
            <div className="p-5 text-white">
              <div className="flex items-start justify-between">
                <span className="text-2xl">🎉</span>
                <button
                  onClick={() => handleDismissNudge(postTripNudge.id)}
                  className="text-white/40 hover:text-white/80 transition-colors -mt-0.5 -mr-0.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 font-bold text-[15px] leading-snug">
                Loved planning {postTripNudge.name}?
              </p>
              <p className="mt-1 text-[13px] text-white/70 leading-relaxed">
                Share Junto with someone planning their next trip.
              </p>
              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  className="flex-1 gap-2 text-white border-0 font-semibold"
                  style={{ background: "#25D366" }}
                  onClick={() => handleNudgeWhatsApp(postTripNudge.name)}
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  Share via WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-2 border-white/20 text-white hover:bg-white/10 hover:text-white"
                  onClick={handleNudgeCopyLink}
                >
                  <Copy className="h-4 w-4" />
                  Copy link
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Referral card - show when < 2 trips and not dismissed */}
        {tripCount < 2 && !referralDismissed && (profile as any)?.referral_code && (
          <div
            className="md:col-span-2 rounded-2xl p-4"
            style={{
              background: "linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.05))",
              border: "1px solid rgba(13,148,136,0.25)",
            }}
          >
            <div className="flex items-start justify-between">
              <span className="text-2xl">✈️</span>
              <button onClick={handleDismissReferral} className="text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 font-bold text-foreground" style={{ fontSize: 15 }}>
              Junto is better with your people
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Invite friends to plan trips together - or just share the app.
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="flex-1 gap-2 text-white"
                style={{ background: "#25D366" }}
                onClick={handleReferralWhatsApp}
              >
                <WhatsAppIcon className="h-4 w-4" />
                WhatsApp
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-2"
                style={{ borderColor: "rgba(13,148,136,0.4)", color: "#0D9488" }}
                onClick={handleCopyReferralLink}
              >
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
            </div>
          </div>
        )}

      </div>

      {/* Join trip drawer */}
      <JoinDrawer
        open={joinOpen}
        onOpenChange={(v) => { setJoinOpen(v); if (!v) { setJoinCode(""); setJoinError(""); } }}
        code={joinCode}
        onCodeChange={(v) => { setJoinCode(v.toUpperCase()); setJoinError(""); }}
        error={joinError}
        loading={joinMutation.isPending}
        onSubmit={() => joinMutation.mutate(joinCode)}
      />
      <DesktopFooter />
    </div>
  );
}

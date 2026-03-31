import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, differenceInDays, isAfter, isBefore, isWithinInterval, parseISO, isToday, isTomorrow } from "date-fns";
import { resolvePhoto, DEFAULT_TRIP_PHOTO } from "@/lib/tripPhoto";

/* ─── Status logic ─── */
type TripStatus = "live" | "countdown" | "upcoming" | "ended" | "no-dates";

function getTripStatus(start: string | null, end: string | null): { status: TripStatus; daysToGo?: number } {
  if (!start && !end) return { status: "no-dates" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const s = start ? parseISO(start) : null;
  const e = end ? parseISO(end) : null;

  if (s && e && isWithinInterval(today, { start: s, end: e })) return { status: "live" };
  if (e && isBefore(e, today)) return { status: "ended" };
  if (s && isAfter(s, today)) {
    const days = differenceInDays(s, today);
    if (days <= 60) return { status: "countdown", daysToGo: days };
    return { status: "upcoming" };
  }
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
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="eager"
          onError={(e) => { e.currentTarget.src = DEFAULT_TRIP_PHOTO; }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85) 100%)",
          }}
        />

        {/* Status badge — top right */}
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

          {/* Avatar stack */}
          <div className="flex flex-col items-end gap-1 shrink-0">
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
              <span className="text-[11px] text-white/60 font-medium">
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

  // Progress bar: planning progress from creation to start date
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
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="lazy"
          onError={(e) => { e.currentTarget.src = DEFAULT_TRIP_PHOTO; }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.10) 100%)",
          }}
        />

        {/* Status badge — top right */}
        <div className="absolute right-3 top-3">
          <StatusBadge info={trip.statusInfo} />
        </div>

        {/* Content — bottom left */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3.5">
          <p className="text-lg font-bold leading-tight text-white line-clamp-2">
            {trip.emoji || "✈️"} {trip.name}
          </p>
          <p className="mt-0.5 text-sm text-white/70">
            {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
          </p>
        </div>

        {/* Member count — bottom right */}
        <div className="absolute bottom-3.5 right-4 flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-sm px-2 py-0.5 text-[11px] text-white/60">
          <Users className="h-3 w-3" />
          <span>{trip.memberCount}</span>
        </div>

        {/* Progress bar at bottom */}
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

/* ─── Main Page ─── */
export default function TripList() {
  const { user } = useAuth();

  const { data: trips, isLoading } = useQuery({
    queryKey: ["trips", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*");
      if (error) throw error;

      const tripIds = data.map((t) => t.id);

      // Parallel: member counts + route stops + member profiles + next activities
      const [membersRes, stopsRes, memberDetailsRes, activitiesRes] = await Promise.all([
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
          .order("joined_at", { ascending: true }),
        supabase
          .from("itinerary_items")
          .select("trip_id, title, day_date, start_time")
          .in("trip_id", tripIds)
          .gte("day_date", new Date().toISOString().split("T")[0])
          .order("day_date", { ascending: true })
          .order("start_time", { ascending: true }),
      ]);

      const countMap: Record<string, number> = {};
      membersRes.data?.forEach((m: any) => {
        countMap[m.trip_id] = (countMap[m.trip_id] || 0) + 1;
      });

      const stopDestsMap: Record<string, string[]> = {};
      (stopsRes.data as any[] | null)?.forEach((s: any) => {
        if (!stopDestsMap[s.trip_id]) stopDestsMap[s.trip_id] = [];
        stopDestsMap[s.trip_id].push(s.destination);
      });

      // Member details per trip (for avatar display)
      const membersByTrip: Record<string, { user_id: string }[]> = {};
      memberDetailsRes.data?.forEach((m: any) => {
        if (!membersByTrip[m.trip_id]) membersByTrip[m.trip_id] = [];
        if (membersByTrip[m.trip_id].length < 5) {
          membersByTrip[m.trip_id].push({ user_id: m.user_id });
        }
      });

      // Get profiles for all visible members
      const allUserIds = [...new Set(Object.values(membersByTrip).flat().map((m) => m.user_id))];
      let profileMap = new Map<string, { display_name: string | null; avatar_url?: string | null }>();
      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase.rpc("get_public_profiles", { _user_ids: allUserIds });
        profileMap = new Map(profiles?.map((p: any) => [p.id, p]) ?? []);
      }

      // Next activity per trip
      const nextActivityMap: Record<string, { title: string; day_date: string; start_time: string | null }> = {};
      activitiesRes.data?.forEach((a: any) => {
        if (!nextActivityMap[a.trip_id]) {
          nextActivityMap[a.trip_id] = { title: a.title, day_date: a.day_date, start_time: a.start_time };
        }
      });

      const enriched: EnrichedTrip[] = data.map((t) => {
        const statusInfo = getTripStatus(t.tentative_start_date, t.tentative_end_date);
        const photoUrl = resolvePhoto(t.name, stopDestsMap[t.id] ?? []);
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
          statusInfo,
          members: tripMembers,
          nextActivity: nextActivityMap[t.id] ?? null,
        };
      });

      return sortTrips(enriched);
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen pb-[120px]" style={{ backgroundColor: "#0f0f0f", marginTop: "-52px", paddingTop: "52px" }}>
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-4">
          <div className="h-[320px] rounded-3xl skeleton-shimmer" style={{ opacity: 0.1 }} />
          <div className="h-[160px] rounded-2xl skeleton-shimmer" style={{ opacity: 0.1, animationDelay: "150ms" }} />
        </div>
      </div>
    );
  }

  /* ── Empty state ── */
  if (!trips || trips.length === 0) {
    return (
      <div className="relative min-h-screen flex flex-col" style={{ backgroundColor: "#0f0f0f", marginTop: "-52px" }}>
        {/* Hero image */}
        <div className="relative h-[320px] w-full overflow-hidden">
          <img
            src={DEFAULT_TRIP_PHOTO}
            alt="Travel"
            className="h-full w-full object-cover"
            onError={(e) => { e.currentTarget.src = DEFAULT_TRIP_PHOTO; }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, transparent 40%, #0f0f0f 100%)",
            }}
          />
        </div>

        <div className="flex flex-1 flex-col items-center px-6 -mt-8">
          <h1 className="text-2xl font-bold text-white">
            Where to next?
          </h1>
          <p className="mt-2 max-w-[280px] text-center text-sm text-white/50">
            Plan your first group trip — vote on destinations, split costs, and keep everyone in sync.
          </p>
          <Button asChild className="mt-6 w-full max-w-[260px]">
            <Link to="/app/trips/new">Start a trip</Link>
          </Button>
          <Link
            to="/join"
            className="mt-3 text-sm font-medium"
            style={{ color: "#0D9488" }}
          >
            Join with a code
          </Link>
        </div>
      </div>
    );
  }

  /* ── Separate live vs rest ── */
  const liveTrip = trips.find((t) => t.statusInfo.status === "live");
  const otherTrips = trips.filter((t) => t !== liveTrip);

  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "#0f0f0f", marginTop: "-52px" }}>
      {/* Top scrim for header readability */}
      <div
        className="absolute top-0 left-0 right-0 z-10 pointer-events-none"
        style={{
          height: 80,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 100%)",
        }}
      />

      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-[100px]" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}>
        {/* Hero card for live trip */}
        {liveTrip && <HeroCard trip={liveTrip} />}

        {/* Regular cards */}
        {otherTrips.map((trip) => (
          <RegularCard key={trip.id} trip={trip} />
        ))}

        {/* Create trip CTA */}
        <Link to="/app/trips/new" className="block">
          <div
            className="flex h-[56px] items-center justify-center rounded-2xl transition-colors"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px dashed rgba(255,255,255,0.2)",
            }}
          >
            <span className="flex items-center gap-1.5 text-sm text-white/60">
              <Plus className="h-4 w-4" />
              Plan a new trip
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}

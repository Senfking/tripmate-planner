import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, differenceInDays, isAfter, isBefore, isWithinInterval, parseISO } from "date-fns";

/* ─── Photo mapping ─── */
const PHOTO_MAP: [RegExp, string][] = [
  [/brazil|rio|iguazu|florianopolis/i, "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=800&q=80"],
  [/bangkok|thailand|asia/i, "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&q=80"],
  [/europe|paris|london|barcelona|rome|berlin/i, "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80"],
  [/beach|island|maldives|bali/i, "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=800&q=80"],
  [/mountain|alps|ski|hiking/i, "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80"],
  [/japan|tokyo|kyoto/i, "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&q=80"],
  [/new york|usa|america/i, "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=80"],
  [/dubai|uae|middle east/i, "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80"],
];
const DEFAULT_PHOTO = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80";

function resolvePhoto(tripName: string, firstStopDest?: string | null): string {
  const haystack = `${firstStopDest ?? ""} ${tripName}`;
  for (const [re, url] of PHOTO_MAP) {
    if (re.test(haystack)) return url;
  }
  return DEFAULT_PHOTO;
}

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
  memberCount: number;
  photoUrl: string;
  statusInfo: ReturnType<typeof getTripStatus>;
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

/* ─── Trip Card ─── */
function TripCard({ trip, isHero }: { trip: EnrichedTrip; isHero: boolean }) {
  const statusInfo = trip.statusInfo ?? getTripStatus(trip.tentative_start_date, trip.tentative_end_date);
  const height = isHero ? "h-[220px]" : "h-[140px]";
  const radius = isHero ? "rounded-[20px]" : "rounded-[16px]";
  const titleSize = isHero ? "text-[22px]" : "text-[18px]";

  const heroLabel =
    isHero && statusInfo.status === "live"
      ? "Happening now"
      : isHero && (statusInfo.status === "countdown" || statusInfo.status === "upcoming")
        ? "Next trip"
        : null;

  return (
    <Link to={`/app/trips/${trip.id}`} className="block">
      <div className={`relative ${height} ${radius} overflow-hidden shadow-lg`}>
        {/* Background image */}
        <img
          src={trip.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading={isHero ? "eager" : "lazy"}
        />
        {/* Gradient overlay */}
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
          {heroLabel && (
            <span className="mb-1 inline-block text-[11px] font-semibold uppercase tracking-wider text-teal-300">
              {heroLabel}
            </span>
          )}
          <p className={`${titleSize} font-bold leading-tight text-white line-clamp-2`}>
            {trip.emoji || "✈️"} {trip.name}
          </p>
          <p className="mt-0.5 text-[13px] text-white/70">
            {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
          </p>
        </div>

        {/* Member count — bottom right */}
        <div className="absolute bottom-3.5 right-4 flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-sm px-2 py-0.5 text-[11px] text-white/60">
          <Users className="h-3 w-3" />
          <span>{trip.memberCount}</span>
        </div>
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

      // Parallel: member counts + first route stop per trip
      const [membersRes, stopsRes] = await Promise.all([
        supabase.from("trip_members").select("trip_id").in("trip_id", tripIds),
        supabase
          .from("trip_route_stops" as any)
          .select("trip_id, destination")
          .in("trip_id", tripIds)
          .order("start_date", { ascending: true }),
      ]);

      const countMap: Record<string, number> = {};
      membersRes.data?.forEach((m: any) => {
        countMap[m.trip_id] = (countMap[m.trip_id] || 0) + 1;
      });

      // First stop destination per trip
      const firstStopMap: Record<string, string> = {};
      (stopsRes.data as any[] | null)?.forEach((s: any) => {
        if (!firstStopMap[s.trip_id]) firstStopMap[s.trip_id] = s.destination;
      });

      const enriched: EnrichedTrip[] = data.map((t) => {
        const statusInfo = getTripStatus(t.tentative_start_date, t.tentative_end_date);
        const photoUrl = resolvePhoto(t.name, firstStopMap[t.id] ?? null);
        return {
          id: t.id,
          name: t.name,
          emoji: t.emoji,
          tentative_start_date: t.tentative_start_date,
          tentative_end_date: t.tentative_end_date,
          memberCount: countMap[t.id] || 0,
          photoUrl,
          statusInfo,
        };
      });

      return sortTrips(enriched);
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ backgroundColor: "#F1F5F9" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#0D9488" }} />
      </div>
    );
  }

  /* ── Empty state ── */
  if (!trips || trips.length === 0) {
    return (
      <div className="relative min-h-[calc(100vh-4rem)] flex flex-col" style={{ backgroundColor: "#F1F5F9" }}>
        {/* Hero image */}
        <div className="relative h-[260px] w-full overflow-hidden">
          <img
            src={DEFAULT_PHOTO}
            alt="Travel"
            className="h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, transparent 40%, #F1F5F9 100%)",
            }}
          />
        </div>

        <div className="flex flex-1 flex-col items-center px-6 -mt-4">
          <span className="text-sm font-bold tracking-wide" style={{ color: "#0D9488" }}>
            Junto
          </span>
          <h1 className="mt-2 text-2xl font-bold" style={{ color: "#0F172A" }}>
            Where to next?
          </h1>
          <p className="mt-2 max-w-[280px] text-center text-sm" style={{ color: "#64748B" }}>
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

  /* ── Trip list ── */
  return (
    <div className="relative min-h-[calc(100vh-4rem)] pb-[120px] pt-6" style={{ backgroundColor: "#F1F5F9" }}>
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4">
        <div className="flex items-center justify-between px-1 mb-1">
          <h1 className="text-[26px] font-bold" style={{ color: "#0F172A" }}>
            My Trips
          </h1>
        </div>

        {trips.map((trip, i) => (
          <TripCard key={trip.id} trip={trip} isHero={i === 0} />
        ))}

        {/* Single trip: show add card */}
        {trips.length === 1 && (
          <Link to="/app/trips/new" className="block">
            <div
              className="flex h-[80px] items-center justify-center rounded-[16px]"
              style={{
                border: "2px dashed rgba(13,148,136,0.3)",
                backgroundColor: "rgba(13,148,136,0.04)",
              }}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#0D9488" }}>
                <Plus className="h-4 w-4" />
                Plan another trip
              </span>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

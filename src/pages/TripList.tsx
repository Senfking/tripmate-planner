import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, differenceInDays, isAfter, isBefore, isWithinInterval, parseISO } from "date-fns";

/* ─── Photo mapping ─── */
const PHOTO_DB: [string[], string][] = [
  // BRAZIL & SOUTH AMERICA
  [["rio", "rio de janeiro", "brazil", "brasil", "iguazu", "florianopolis", "sao paulo", "buenos aires", "argentina", "chile", "peru", "lima", "bogota", "colombia", "cartagena", "venezuela", "ecuador", "quito", "montevideo", "uruguay"], "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=800&q=80"],
  // SOUTHEAST ASIA
  [["bangkok", "thailand", "phuket", "chiang mai", "koh samui", "pattaya"], "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&q=80"],
  [["bali", "indonesia", "lombok", "jakarta", "ubud", "seminyak"], "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80"],
  [["vietnam", "hanoi", "ho chi minh", "saigon", "hoi an", "halong", "da nang"], "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&q=80"],
  [["singapore"], "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&q=80"],
  [["japan", "tokyo", "kyoto", "osaka", "hiroshima", "nara", "hokkaido"], "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&q=80"],
  [["philippines", "manila", "cebu", "palawan", "boracay"], "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=800&q=80"],
  [["cambodia", "siem reap", "angkor", "phnom penh"], "https://images.unsplash.com/photo-1508159452718-d22f6734a00d?w=800&q=80"],
  // EUROPE
  [["paris", "france", "versailles", "nice", "lyon", "bordeaux", "provence"], "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80"],
  [["rome", "italy", "milan", "venice", "florence", "naples", "amalfi", "sicily", "sardinia"], "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&q=80"],
  [["barcelona", "spain", "madrid", "seville", "granada", "ibiza", "mallorca", "valencia"], "https://images.unsplash.com/photo-1523531294919-4bcd7c65e216?w=800&q=80"],
  [["amsterdam", "netherlands", "rotterdam", "the hague"], "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&q=80"],
  [["london", "england", "uk", "united kingdom", "scotland", "edinburgh", "manchester"], "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80"],
  [["greece", "athens", "santorini", "mykonos", "crete", "rhodes"], "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80"],
  [["croatia", "dubrovnik", "split", "zagreb", "hvar"], "https://images.unsplash.com/photo-1555990538-c4e0b7c5e5e9?w=800&q=80"],
  [["portugal", "lisbon", "porto", "algarve", "madeira", "azores"], "https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=800&q=80"],
  [["switzerland", "zurich", "geneva", "bern", "interlaken", "zermatt"], "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80"],
  [["austria", "vienna", "salzburg", "innsbruck"], "https://images.unsplash.com/photo-1516550893923-42d28e5677af?w=800&q=80"],
  [["germany", "berlin", "munich", "hamburg", "frankfurt", "cologne", "bavaria"], "https://images.unsplash.com/photo-1587330979470-3595ac045ab0?w=800&q=80"],
  [["prague", "czech", "czechia"], "https://images.unsplash.com/photo-1592906209472-a36b1f3782ef?w=800&q=80"],
  [["budapest", "hungary"], "https://images.unsplash.com/photo-1551867633-194f125bddfa?w=800&q=80"],
  [["istanbul", "turkey", "ankara", "cappadocia", "bodrum"], "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=800&q=80"],
  [["scandinavia", "norway", "oslo", "bergen", "fjord", "sweden", "stockholm", "denmark", "copenhagen", "finland", "helsinki"], "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800&q=80"],
  // MIDDLE EAST & AFRICA
  [["dubai", "uae", "abu dhabi", "emirates"], "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80"],
  [["morocco", "marrakech", "casablanca", "fez", "sahara"], "https://images.unsplash.com/photo-1539020140153-e479b8f22986?w=800&q=80"],
  [["egypt", "cairo", "pyramids", "luxor", "sharm", "hurghada"], "https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=800&q=80"],
  [["south africa", "cape town", "johannesburg", "safari", "kenya", "tanzania", "serengeti", "zanzibar"], "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&q=80"],
  // NORTH AMERICA
  [["new york", "nyc", "manhattan", "brooklyn"], "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=80"],
  [["los angeles", "california", "san francisco", "hollywood", "las vegas", "miami", "florida"], "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?w=800&q=80"],
  [["canada", "toronto", "vancouver", "montreal", "banff"], "https://images.unsplash.com/photo-1517935706615-2717063c2225?w=800&q=80"],
  [["mexico", "cancun", "mexico city", "tulum", "playa del carmen", "oaxaca"], "https://images.unsplash.com/photo-1585464231875-d9ef1f5ad396?w=800&q=80"],
  // OCEANIA
  [["australia", "sydney", "melbourne", "brisbane", "cairns", "great barrier reef"], "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&q=80"],
  [["new zealand", "auckland", "queenstown", "rotorua"], "https://images.unsplash.com/photo-1507699622108-4be3abd695ad?w=800&q=80"],
  // INDIAN OCEAN & ISLANDS
  [["maldives", "mauritius", "seychelles", "reunion"], "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=800&q=80"],
  [["sri lanka", "colombo", "kandy", "galle"], "https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=800&q=80"],
  [["india", "mumbai", "delhi", "goa", "jaipur", "rajasthan", "kerala"], "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&q=80"],
  // NATURE / GENERIC
  [["ski", "skiing", "snowboard", "alps", "winter", "mountain", "hiking", "trek"], "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80"],
  [["beach", "island", "coast", "surf", "tropical"], "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80"],
  [["wedding", "bride", "married"], "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80"],
  [["festival", "carnival", "party"], "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80"],
  [["road trip", "campervan", "road"], "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80"],
];
const DEFAULT_PHOTO = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80";

function resolvePhoto(tripName: string, routeStopDests: string[]): string {
  const searchText = [tripName, ...routeStopDests].join(" ").toLowerCase();
  for (const [keywords, url] of PHOTO_DB) {
    if (keywords.some((kw) => searchText.includes(kw))) return url;
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
          <StatusBadge info={statusInfo} />
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

      const stopDestsMap: Record<string, string[]> = {};
      (stopsRes.data as any[] | null)?.forEach((s: any) => {
        if (!stopDestsMap[s.trip_id]) stopDestsMap[s.trip_id] = [];
        stopDestsMap[s.trip_id].push(s.destination);
      });

      const enriched: EnrichedTrip[] = data.map((t) => {
        const statusInfo = getTripStatus(t.tentative_start_date, t.tentative_end_date);
        const photoUrl = resolvePhoto(t.name, stopDestsMap[t.id] ?? []);
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

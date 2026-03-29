import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, ExternalLink, Calendar, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, differenceInDays } from "date-fns";

interface RouteStop {
  destination: string;
  start_date: string;
  end_date: string;
}

interface ShareData {
  trip: {
    name: string;
    emoji: string | null;
    tentative_start_date: string | null;
    tentative_end_date: string | null;
    settlement_currency: string;
  };
  members: { first_name: string }[];
  member_count: number;
  route_stops: RouteStop[];
  itinerary_items: {
    day_date: string;
    start_time: string | null;
    end_time: string | null;
    title: string;
    location_text: string | null;
    status: string;
  }[];
  attachments: {
    title: string;
    url: string | null;
    og_title: string | null;
    og_description: string | null;
    og_image_url: string | null;
  }[];
  expenses_summary?: {
    total_spent: number;
    settlement_currency: string;
    balances: { name: string; net_amount: number }[];
    settle_up: { from: string; to: string; amount: number }[];
  };
}

function getDestinationForDate(dayDate: string, stops: RouteStop[]): string | null {
  for (const stop of stops) {
    if (dayDate >= stop.start_date && dayDate <= stop.end_date) {
      return stop.destination;
    }
  }
  return null;
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const statusColors: Record<string, string> = {
  idea: "bg-muted text-muted-foreground",
  planned: "bg-secondary/20 text-secondary",
  booked: "bg-primary/20 text-primary",
  confirmed: "bg-emerald-100 text-emerald-700",
};

export default function ShareView() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const includeExpenses = searchParams.get("expenses") === "1";

  const { data, isLoading, error } = useQuery<ShareData>({
    queryKey: ["share-view", token, includeExpenses],
    queryFn: async () => {
      const projId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projId}.supabase.co/functions/v1/public-trip-share-view`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, include_expenses: includeExpenses }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Invalid share link");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 space-y-6 bg-white">
        <MapPin className="h-16 w-16 text-gray-300" />
        <div>
          <p className="text-xl font-semibold text-gray-900">
            This share link is invalid or has expired
          </p>
          <p className="text-gray-500 mt-1">
            The trip organizer may have revoked it, or it may have expired.
          </p>
        </div>
        <Button asChild className="bg-teal-600 hover:bg-teal-700">
          <Link to="/signup">Sign up to Junto</Link>
        </Button>
      </div>
    );
  }

  const { trip, members, member_count, route_stops, itinerary_items, attachments, expenses_summary } = data;

  // Date range
  const formatDateRange = (s: string | null, e: string | null) => {
    if (!s && !e) return "Dates TBD";
    if (s && e) {
      const days = differenceInDays(parseISO(e), parseISO(s)) + 1;
      return `${format(parseISO(s), "MMM d")} – ${format(parseISO(e), "MMM d, yyyy")} · ${days} day${days !== 1 ? "s" : ""}`;
    }
    if (s) return `From ${format(parseISO(s), "MMM d, yyyy")}`;
    return `Until ${format(parseISO(e!), "MMM d, yyyy")}`;
  };

  // Group itinerary by day
  const dayMap = new Map<string, typeof itinerary_items>();
  for (const item of itinerary_items) {
    const existing = dayMap.get(item.day_date) || [];
    existing.push(item);
    dayMap.set(item.day_date, existing);
  }
  const sortedDays = [...dayMap.keys()].sort();

  // First day for numbering
  const firstDay = trip.tentative_start_date || sortedDays[0] || null;

  const urlAttachments = attachments.filter((a) => a.url);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Hero header */}
      <header className="bg-gradient-to-br from-teal-600 to-teal-500 text-white p-6 pb-8">
        <div className="max-w-xl mx-auto">
          <span className="text-4xl">{trip.emoji || "✈️"}</span>
          <h1 className="text-2xl font-bold mt-2">{trip.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-white/80 text-sm">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
            </span>
          </div>
          {/* Member avatars */}
          <div className="flex items-center gap-2 mt-4">
            <Users className="h-4 w-4 text-white/70" />
            <span className="text-sm text-white/70">
              {member_count} {member_count === 1 ? "person" : "people"} going
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {members.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-white/20 text-xs font-semibold text-white"
                title={m.first_name}
              >
                {m.first_name[0]?.toUpperCase() || "?"}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-8 pb-12">
        {/* Route */}
        {route_stops.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              🗺️ Trip Route
            </h2>
            <div className="relative pl-6 space-y-3">
              {/* vertical line */}
              <div className="absolute left-2.5 top-1 bottom-1 w-0.5 bg-teal-200 rounded" />
              {route_stops.map((stop, i) => (
                <div key={i} className="relative flex items-start gap-3">
                  <div className="absolute -left-6 top-1 h-5 w-5 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center z-10">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{stop.destination}</p>
                    <p className="text-xs text-gray-500">
                      {format(parseISO(stop.start_date), "MMM d")}
                      {stop.start_date !== stop.end_date && ` – ${format(parseISO(stop.end_date), "MMM d")}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Itinerary */}
        {sortedDays.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              🗓️ Itinerary
            </h2>
            <div className="space-y-5">
              {sortedDays.map((day) => {
                const dayNum = firstDay
                  ? differenceInDays(parseISO(day), parseISO(firstDay)) + 1
                  : null;
                const destination = getDestinationForDate(day, route_stops);
                return (
                  <div key={day}>
                    <h3 className="text-sm font-semibold text-teal-700 mb-2">
                      {dayNum != null && dayNum > 0 ? `Day ${dayNum} — ` : ""}
                      {format(parseISO(day), "EEE d MMM")}
                      {destination ? ` · ${destination}` : ""}
                    </h3>
                    <div className="space-y-2">
                      {dayMap.get(day)!.map((item, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-gray-100 bg-gray-50 p-3 flex items-start gap-3"
                        >
                          {item.start_time && (
                            <span className="text-xs font-mono text-gray-400 whitespace-nowrap mt-0.5">
                              {item.start_time.slice(0, 5)}
                              {item.end_time ? `–${item.end_time.slice(0, 5)}` : ""}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {item.title}
                              </p>
                              {item.status && item.status !== "idea" && (
                                <Badge
                                  variant="secondary"
                                  className={`text-[10px] px-1.5 py-0 h-4 ${statusColors[item.status] || ""}`}
                                >
                                  {item.status}
                                </Badge>
                              )}
                            </div>
                            {item.location_text && (
                              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {item.location_text}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Bookings / Links */}
        {urlAttachments.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              📄 Shared Links
            </h2>
            <div className="space-y-2">
              {urlAttachments.map((a, i) => (
                <a
                  key={i}
                  href={a.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 hover:bg-gray-100 transition-colors"
                >
                  {a.og_image_url && (
                    <img
                      src={a.og_image_url}
                      alt=""
                      className="w-16 h-12 rounded object-cover shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {a.og_title || a.title}
                    </p>
                    {a.og_description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                        {a.og_description}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Expense summary */}
        {expenses_summary && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              💰 Expenses
            </h2>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-4">
              <p className="text-xl font-bold text-gray-900">
                Total spent: {formatCurrency(expenses_summary.total_spent, expenses_summary.settlement_currency)}
              </p>

              {expenses_summary.balances.length > 0 && (
                <div className="space-y-1.5">
                  {expenses_summary.balances.map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{b.name}</span>
                      <span
                        className={`font-medium ${
                          b.net_amount > 0 ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {b.net_amount > 0 ? "is owed " : "owes "}
                        {formatCurrency(Math.abs(b.net_amount), expenses_summary.settlement_currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {expenses_summary.settle_up.length > 0 && (
                <div className="border-t border-gray-200 pt-3 space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Settle up</p>
                  {expenses_summary.settle_up.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="font-medium">{s.from}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                      <span className="font-medium">{s.to}</span>
                      <span className="ml-auto font-semibold text-gray-900">
                        {formatCurrency(s.amount, expenses_summary.settlement_currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Footer CTA */}
        <footer className="text-center py-6 space-y-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">Planning a trip?</p>
          <Button asChild size="lg" className="bg-teal-600 hover:bg-teal-700">
            <Link to="/signup">Join Junto free →</Link>
          </Button>
          <p className="text-xs text-gray-400">
            Last updated {format(new Date(), "MMM d, yyyy 'at' HH:mm")}
          </p>
        </footer>
      </main>
    </div>
  );
}

import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, ExternalLink, Calendar, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";

interface ShareData {
  trip: {
    name: string;
    emoji: string | null;
    tentative_start_date: string | null;
    tentative_end_date: string | null;
  };
  itinerary_items: {
    day_date: string;
    start_time: string | null;
    title: string;
    location_text: string | null;
    status: string;
  }[];
  attachments: { title: string; type: string; url: string | null }[];
  member_count: number;
}

export default function ShareView() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery<ShareData>({
    queryKey: ["share-view", token],
    queryFn: async () => {
      const projId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projId}.supabase.co/functions/v1/public-trip-share-view`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }
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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 space-y-6">
        <MapPin className="h-16 w-16 text-muted-foreground/50" />
        <div>
          <p className="text-xl font-semibold text-foreground">
            This share link is invalid or has expired
          </p>
          <p className="text-muted-foreground mt-1">
            The trip organizer may have revoked it, or it may have expired.
          </p>
        </div>
        <Button asChild>
          <Link to="/signup">Sign up to Junto</Link>
        </Button>
      </div>
    );
  }

  const { trip, itinerary_items, attachments, member_count } = data;
  const urlAttachments = attachments.filter((a) => a.type === "link" && a.url);

  // Group itinerary by day
  const dayMap = new Map<string, typeof itinerary_items>();
  for (const item of itinerary_items) {
    const existing = dayMap.get(item.day_date) || [];
    existing.push(item);
    dayMap.set(item.day_date, existing);
  }
  const sortedDays = [...dayMap.keys()].sort();

  const formatDateRange = (s: string | null, e: string | null) => {
    if (!s && !e) return "Dates TBD";
    if (s && e) return `${format(parseISO(s), "MMM d")} – ${format(parseISO(e), "MMM d, yyyy")}`;
    if (s) return `From ${format(parseISO(s), "MMM d, yyyy")}`;
    return `Until ${format(parseISO(e!), "MMM d, yyyy")}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <header className="bg-gradient-primary text-white p-6 pb-8">
        <div className="max-w-2xl mx-auto">
          <span className="text-4xl">{trip.emoji || "✈️"}</span>
          <h1 className="text-2xl font-bold mt-2">{trip.name}</h1>
          <div className="flex items-center gap-4 mt-2 text-white/80 text-sm">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {member_count} {member_count === 1 ? "traveler" : "travelers"}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Itinerary */}
        {sortedDays.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Itinerary</h2>
            {sortedDays.map((day) => (
              <div key={day} className="space-y-2">
                <h3 className="text-sm font-medium text-primary">
                  {format(parseISO(day), "EEEE, MMM d")}
                </h3>
                <div className="space-y-1.5">
                  {dayMap.get(day)!.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-lg border bg-card p-3 flex items-start gap-3"
                    >
                      {item.start_time && (
                        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap mt-0.5">
                          {item.start_time.slice(0, 5)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.title}
                        </p>
                        {item.location_text && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {item.location_text}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Attachments */}
        {urlAttachments.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Links</h2>
            <div className="space-y-2">
              {urlAttachments.map((a, i) => (
                <a
                  key={i}
                  href={a.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{a.title}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="text-center py-8 space-y-3">
          <p className="text-muted-foreground text-sm">
            Want to collaborate on this trip?
          </p>
          <Button asChild size="lg">
            <Link to="/signup">Join this trip on Junto</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Loader2, Plane } from "lucide-react";
import { format } from "date-fns";

export default function TripList() { 
  const { user } = useAuth();

  const { data: trips, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["trips", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*");
      if (error) throw error;

      // Get member counts for all trips
      const tripIds = data.map((t) => t.id);
      const { data: members } = await supabase
        .from("trip_members")
        .select("trip_id")
        .in("trip_id", tripIds);

      const countMap: Record<string, number> = {};
      members?.forEach((m) => {
        countMap[m.trip_id] = (countMap[m.trip_id] || 0) + 1;
      });

      return data.map((t) => ({
        ...t,
        memberCount: countMap[t.id] || 0,
      }));
    },
    enabled: !!user,
  });

  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start && !end) return "Dates TBD";
    if (start && end)
      return `${format(new Date(start), "MMM d")} – ${format(new Date(end), "MMM d, yyyy")}`;
    if (start) return `From ${format(new Date(start), "MMM d, yyyy")}`;
    return `Until ${format(new Date(end!), "MMM d, yyyy")}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-8rem)] px-4 pb-36 pt-6 sm:px-5">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <div className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-bold text-foreground">My Trips</h1>
        {isRefetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {!trips || trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-20 text-center">
            <Plane className="h-16 w-16 text-muted-foreground/50" />
            <div>
              <p className="text-xl font-semibold text-foreground">No trips yet</p>
              <p className="mt-1 text-muted-foreground">Start planning! ✈️</p>
            </div>
            <Button asChild>
              <Link to="/app/trips/new">Create your first trip</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/join">Join with code</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((trip) => (
              <Link key={trip.id} to={`/app/trips/${trip.id}`}>
                <Card className="cursor-pointer overflow-hidden rounded-2xl border-border/60 shadow-sm transition-all duration-200 hover:shadow-md">
                  <CardContent className="flex items-center gap-3 px-4 py-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-2xl">
                      {(trip as any).emoji || "✈️"}
                    </div>
                    <div className="min-w-0 flex-1 pr-1">
                      <p className="text-base font-semibold leading-snug text-foreground line-clamp-2">
                        {trip.name}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{trip.memberCount}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <button
          onClick={() => refetch()}
          className="w-full py-3 text-center text-sm text-muted-foreground"
        >
          Tap to refresh
        </button>
      </div>

    </div>
  );
}

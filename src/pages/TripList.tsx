import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, Loader2, Plane } from "lucide-react";
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
    <div className="px-5 py-5 space-y-4 relative min-h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">My Trips</h1>
        {isRefetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {!trips || trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <Plane className="h-16 w-16 text-muted-foreground/50" />
          <div>
            <p className="text-xl font-semibold text-foreground">No trips yet</p>
            <p className="text-muted-foreground mt-1">Start planning! ✈️</p>
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
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="text-3xl shrink-0">{(trip as any).emoji || "✈️"}</span>
                  <div className="flex-1 min-w-0 pr-1">
                    <p className="font-semibold text-foreground leading-snug line-clamp-2">{trip.name}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm shrink-0">
                    <Users className="h-4 w-4" />
                    <span>{trip.memberCount}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pull to refresh hint */}
      <button
        onClick={() => refetch()}
        className="w-full text-center text-xs text-muted-foreground py-2"
      >
        Tap to refresh
      </button>

      {/* FAB */}
      <Link
        to="/app/trips/new"
        className="fixed bottom-28 right-5 md:bottom-6 md:right-6 z-50 h-14 w-14 rounded-full bg-gradient-primary text-white shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  );
}

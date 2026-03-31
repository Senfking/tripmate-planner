import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Users, Loader2, MapPin, Share2 } from "lucide-react";
import { useState } from "react";
import { ShareInviteModal } from "@/components/ShareInviteModal";
import { TripOverviewHero } from "@/components/trip/TripOverviewHero";
import { TripDashboard } from "@/components/trip/TripDashboard";
import { format } from "date-fns";
import { useTripRealtime } from "@/hooks/useTripRealtime";

export default function TripHome() {
  const { tripId } = useParams<{ tripId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  useTripRealtime(tripId);
  const { data: trip, isLoading } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("id", tripId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tripId && !!user,
  });

  const { data: memberCount } = useQuery({
    queryKey: ["trip-members-count", tripId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("trip_members")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId!);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!tripId && !!user,
  });

  const { data: myRole } = useQuery({
    queryKey: ["my-trip-role", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("role")
        .eq("trip_id", tripId!)
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data.role;
    },
    enabled: !!tripId && !!user,
  });

  const [shareInviteOpen, setShareInviteOpen] = useState(false);
  const isAdmin = myRole === "owner" || myRole === "admin";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center p-4 space-y-4">
        <MapPin className="h-16 w-16 text-muted-foreground/50" />
        <div>
          <p className="text-xl font-semibold text-foreground">Trip not found</p>
          <p className="text-muted-foreground mt-1">
            This trip doesn't exist or you're not a member.
          </p>
        </div>
        <button
          onClick={() => navigate("/app/trips")}
          className="text-primary underline text-sm"
        >
          Back to My Trips
        </button>
      </div>
    );
  }

  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start && !end) return "Dates TBD";
    if (start && end)
      return `${format(new Date(start), "MMM d")} – ${format(new Date(end), "MMM d, yyyy")}`;
    if (start) return `From ${format(new Date(start), "MMM d, yyyy")}`;
    return `Until ${format(new Date(end!), "MMM d, yyyy")}`;
  };

  return (
    <div className="flex flex-col min-h-screen animate-slide-in" style={{ background: "#F1F5F9" }}>
      {/* Header with photo background */}
      <header className="sticky top-0 z-40 text-white p-4 pb-0 relative overflow-hidden" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}>
        {/* Background: photo with overlay, or solid teal fallback */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, #0D9488, #0EA5E9)" }} />
        <div
          className="absolute inset-0 pointer-events-none bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80')" }}
        />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.50), rgba(13,148,136,0.80))" }} />
        <button
          onClick={() => navigate("/app/trips")}
          className="relative flex items-center gap-1 text-white/80 mb-3 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">My Trips</span>
        </button>
        <div className="relative flex items-center gap-3 pb-5">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{trip.name}</h1>
            <p className="text-sm text-white/80">
              {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShareInviteOpen(true)}
              className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-sm text-white hover:bg-white/30 transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            <div className="flex items-center gap-1 text-white/80 text-sm">
              <Users className="h-4 w-4" />
              <span>{memberCount ?? "…"}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard: overview hero + section cards */}
      <div className="flex-1 pt-4">
        <div className="px-4 mb-3.5">
          <TripOverviewHero
            tripId={trip.id}
            routeLocked={trip.route_locked ?? false}
            startDate={trip.tentative_start_date}
            endDate={trip.tentative_end_date}
          />
        </div>
        <TripDashboard
          tripId={trip.id}
          routeLocked={trip.route_locked ?? false}
          settlementCurrency={trip.settlement_currency}
          myRole={myRole}
          startDate={trip.tentative_start_date}
          endDate={trip.tentative_end_date}
        />
      </div>

      {trip && (
        <ShareInviteModal
          tripId={trip.id}
          tripName={trip.name}
          open={shareInviteOpen}
          onOpenChange={setShareInviteOpen}
          isAdmin={isAdmin}
          trip={trip}
        />
      )}
    </div>
  );
}

import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import { DecisionsFlow } from "@/components/decisions/DecisionsFlow";
import { ItineraryTab } from "@/components/itinerary/ItineraryTab";
import { BookingsTab } from "@/components/bookings/BookingsTab";
import { ExpensesTab } from "@/components/expenses/ExpensesTab";
import { AdminTab } from "@/components/admin/AdminTab";
import { useTripRealtime, type ConnectionStatus } from "@/hooks/useTripRealtime";

const SECTION_TITLES: Record<string, string> = {
  decisions: "Decisions",
  itinerary: "Itinerary",
  bookings: "Bookings & Docs",
  expenses: "Expenses",
  admin: "Admin",
};

function LiveIndicator({ status }: { status: ConnectionStatus }) {
  const config = {
    connected: { color: "bg-emerald-500", pulse: true, label: "Live" },
    reconnecting: { color: "bg-amber-500", pulse: false, label: "Reconnecting…" },
    disconnected: { color: "bg-muted-foreground/50", pulse: false, label: "Offline" },
  }[status];

  return (
    <div className="flex items-center gap-1.5 ml-auto">
      <span className={`h-1.5 w-1.5 rounded-full ${config.color} ${config.pulse ? "animate-pulse" : ""}`} />
      <span className="text-[11px] text-muted-foreground">{config.label}</span>
    </div>
  );
}

export default function TripSection() {
  const { tripId, section } = useParams<{ tripId: string; section: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { connectionStatus, newItemIds } = useTripRealtime(tripId);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!trip || !section || !SECTION_TITLES[section]) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center p-4 space-y-4">
        <MapPin className="h-16 w-16 text-muted-foreground/50" />
        <p className="text-xl font-semibold">Not found</p>
        <button onClick={() => navigate("/app/trips")} className="text-primary underline text-sm">
          Back to My Trips
        </button>
      </div>
    );
  }

  const renderContent = () => {
    switch (section) {
      case "decisions":
        return (
          <DecisionsFlow
            tripId={trip.id}
            myRole={myRole}
            isActive={trip.vibe_board_active ?? false}
            isLocked={trip.vibe_board_locked ?? false}
            memberCount={memberCount ?? 0}
            routeLocked={trip.route_locked ?? false}
          />
        );
      case "itinerary":
        return <ItineraryTab tripId={trip.id} myRole={myRole} newItemIds={newItemIds} />;
      case "bookings":
        return <BookingsTab tripId={trip.id} myRole={myRole} newItemIds={newItemIds} />;
      case "expenses":
        return <ExpensesTab tripId={trip.id} myRole={myRole} newItemIds={newItemIds} />;
      case "admin":
        return <AdminTab tripId={trip.id} myRole={myRole} tripName={trip.name} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-screen animate-slide-in">
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/app/trips/${tripId}`)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm truncate max-w-[160px]">{trip.name}</span>
          </button>
          <LiveIndicator status={connectionStatus} />
        </div>
        <h1 className="text-lg font-bold text-foreground mt-1">{SECTION_TITLES[section]}</h1>
      </header>
      <div className="flex-1 px-4 py-4">{renderContent()}</div>
    </div>
  );
}

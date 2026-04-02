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

  const { data: myMembership } = useQuery({
    queryKey: ["my-trip-membership", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("role, attendance_status")
        .eq("trip_id", tripId!)
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data as { role: string; attendance_status: string };
    },
    enabled: !!tripId && !!user,
  });

  const myRole = myMembership?.role;
  const myAttendanceStatus = myMembership?.attendance_status;

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
            myAttendanceStatus={myAttendanceStatus}
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
    <div
      className="flex flex-col min-h-dvh animate-slide-in bg-background"
      style={section === "expenses" ? { background: "linear-gradient(180deg, #EEF7F6 0%, #F1F5F9 40%)" } : undefined}
    >
      {/* Mobile section header — hidden on desktop where the root DesktopHeader is visible */}
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3 md:hidden" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/app/trips/${tripId}`)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm truncate max-w-[160px]">Trip Dashboard</span>
          </button>
          <LiveIndicator status={connectionStatus} />
        </div>
        <h1 className="text-lg font-bold text-foreground mt-1">{SECTION_TITLES[section]}</h1>
      </header>

      {/* Desktop: breadcrumb row */}
      <div className="hidden md:flex items-center gap-2 px-8 pt-4 pb-2 max-w-[900px] mx-auto w-full">
        <button
          onClick={() => navigate(`/app/trips/${tripId}`)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="truncate max-w-[200px]">{trip.name}</span>
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-semibold text-foreground">{SECTION_TITLES[section]}</span>
        <LiveIndicator status={connectionStatus} />
      </div>

      <div className="flex-1 px-4 py-4 md:px-8 md:max-w-[900px] md:mx-auto md:w-full">{renderContent()}</div>
    </div>
  );
}

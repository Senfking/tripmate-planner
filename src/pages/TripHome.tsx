import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Users, Loader2, MapPin, UserPlus, Share2 } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { ShareInviteModal } from "@/components/ShareInviteModal";
import { DecisionsFlow } from "@/components/decisions/DecisionsFlow";
import { ItineraryTab } from "@/components/itinerary/ItineraryTab";
import { BookingsTab } from "@/components/bookings/BookingsTab";
import { ExpensesTab } from "@/components/expenses/ExpensesTab";
import { format } from "date-fns";

const TRIP_TABS = ["decisions", "itinerary", "bookings", "expenses", "admin"] as const;
type TripTab = (typeof TRIP_TABS)[number];

export default function TripHome() {
  const { tripId } = useParams<{ tripId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

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

  const [searchParams, setSearchParams] = useSearchParams();
  const tabStorageKey = tripId ? `trip-home-tab:${tripId}` : null;
  const tabFromUrl = searchParams.get("tab");
  const tabFromStorage = tabStorageKey ? sessionStorage.getItem(tabStorageKey) : null;
  const activeTab = (TRIP_TABS.includes((tabFromUrl || tabFromStorage || "decisions") as TripTab)
    ? (tabFromUrl || tabFromStorage || "decisions")
    : "decisions") as TripTab;

  const setActiveTab = useCallback((tab: string) => {
    if (!TRIP_TABS.includes(tab as TripTab)) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    }, { replace: true });

    if (tabStorageKey) {
      sessionStorage.setItem(tabStorageKey, tab);
    }
  }, [setSearchParams, tabStorageKey]);

  useEffect(() => {
    if (!tabStorageKey) return;
    sessionStorage.setItem(tabStorageKey, activeTab);
  }, [activeTab, tabStorageKey]);

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

  const tabPlaceholder = (label: string) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-muted-foreground">
        {label} — <span className="font-medium">Coming soon</span>
      </p>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-primary text-white p-4 pb-5">
        <button
          onClick={() => navigate("/app/trips")}
          className="flex items-center gap-1 text-white/80 mb-3 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">My Trips</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{(trip as any).emoji || "✈️"}</span>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="w-full justify-start overflow-x-auto rounded-none border-b bg-background px-2">
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="admin">Admin</TabsTrigger>
        </TabsList>
        <TabsContent value="decisions" className="px-4 py-4">
          <DecisionsFlow
            tripId={trip.id}
            myRole={myRole}
            isActive={(trip as any).vibe_board_active ?? false}
            isLocked={(trip as any).vibe_board_locked ?? false}
            memberCount={memberCount ?? 0}
            routeLocked={(trip as any).route_locked ?? false}
          />
        </TabsContent>
        <TabsContent value="itinerary" className="px-4 py-4">
          <ItineraryTab tripId={trip.id} myRole={myRole} />
        </TabsContent>
        <TabsContent value="bookings" className="px-4 py-4">
          <BookingsTab tripId={trip.id} myRole={myRole} />
        </TabsContent>
        <TabsContent value="expenses" className="px-4 py-4">
          <ExpensesTab tripId={trip.id} myRole={myRole} />
        </TabsContent>
        <TabsContent value="admin">{tabPlaceholder("Admin")}</TabsContent>
      </Tabs>

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

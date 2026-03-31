import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2, MapPin, Share2 } from "lucide-react";
import { useState } from "react";
import { ShareInviteModal } from "@/components/ShareInviteModal";
import { TripDashboard } from "@/components/trip/TripDashboard";
import { MemberListSheet } from "@/components/trip/MemberListSheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, parseISO, isWithinInterval, differenceInCalendarDays } from "date-fns";
import { useTripRealtime, type ConnectionStatus } from "@/hooks/useTripRealtime";

function getInitial(name: string | null | undefined) {
  return (name || "?").charAt(0).toUpperCase();
}

function LiveIndicator({ status }: { status: ConnectionStatus }) {
  const config = {
    connected: { color: "bg-emerald-400", pulse: true, label: "Live" },
    reconnecting: { color: "bg-amber-400", pulse: false, label: "Reconnecting…" },
    disconnected: { color: "bg-white/50", pulse: false, label: "Offline" },
  }[status];

  return (
    <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.color} ${config.pulse ? "animate-pulse" : ""}`} />
      <span className="text-[11px] text-white/90 font-medium">{config.label}</span>
    </div>
  );
}

function getStatusLabel(startDate: string | null, endDate: string | null, routeLocked: boolean): string {
  const today = new Date();
  if (startDate && endDate) {
    const s = parseISO(startDate);
    const e = parseISO(endDate);
    if (e < today) return "Trip completed";
    if (isWithinInterval(today, { start: s, end: e })) return "Live now";
    const daysToGo = differenceInCalendarDays(s, today);
    if (daysToGo <= 7) return `${daysToGo} day${daysToGo !== 1 ? "s" : ""} to go`;
    if (routeLocked) return "Upcoming";
  }
  return "Planning in progress";
}

export default function TripHome() {
  const { tripId } = useParams<{ tripId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { connectionStatus } = useTripRealtime(tripId);

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

  const { data: members } = useQuery({
    queryKey: ["trip-members-full", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, role, joined_at")
        .eq("trip_id", tripId!)
        .order("joined_at");
      if (error) throw error;
      const userIds = data.map((m) => m.user_id);
      const { data: profiles } = await supabase.rpc("get_public_profiles", { _user_ids: userIds });
      const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
      return data.map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id) as { display_name: string | null; avatar_url?: string | null } | undefined,
      }));
    },
    enabled: !!tripId && !!user,
  });

  const [shareInviteOpen, setShareInviteOpen] = useState(false);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
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
          <p className="text-muted-foreground mt-1">This trip doesn't exist or you're not a member.</p>
        </div>
        <button onClick={() => navigate("/app/trips")} className="text-primary underline text-sm">
          Back to My Trips
        </button>
      </div>
    );
  }

  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start && !end) return "Dates TBD";
    if (start && end) return `${format(new Date(start), "MMM d")} – ${format(new Date(end), "MMM d, yyyy")}`;
    if (start) return `From ${format(new Date(start), "MMM d, yyyy")}`;
    return `Until ${format(new Date(end!), "MMM d, yyyy")}`;
  };

  const visibleMembers = members?.slice(0, 4) ?? [];
  const memberCount = members?.length ?? 0;
  const statusLabel = getStatusLabel(trip.tentative_start_date, trip.tentative_end_date, trip.route_locked ?? false);

  // Default cover photo — in future, use trip.cover_photo_url if available
  const coverPhoto = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80";

  return (
    <div className="flex flex-col min-h-screen animate-slide-in" style={{ background: "#F1F5F9" }}>
      {/* ─── HERO SECTION ─── */}
      <div className="relative w-full overflow-hidden" style={{ height: 260 }}>
        {/* Teal fallback */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0D9488, #0369a1)" }} />
        {/* Cover photo */}
        <img
          src={coverPhoto}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Scrim overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.0) 30%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.85) 100%)",
          }}
        />

        {/* TOP LEFT — Back button */}
        <button
          onClick={() => navigate("/app/trips")}
          className="absolute left-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white text-sm hover:bg-black/40 transition-colors"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)", background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          My Trips
        </button>

        {/* TOP RIGHT — Live indicator */}
        <div className="absolute right-4" style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
          <LiveIndicator status={connectionStatus} />
        </div>

        {/* BOTTOM LEFT — Trip info */}
        <div className="absolute left-4 bottom-4 right-28">
          <h1 className="text-2xl font-bold text-white leading-tight truncate">{trip.name}</h1>
          <p className="text-sm text-white/80 mt-0.5">
            {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
          </p>
        </div>

        {/* BOTTOM RIGHT — Avatar stack + count */}
        <button
          onClick={() => setMemberSheetOpen(true)}
          className="absolute right-4 bottom-4 flex flex-col items-end gap-1"
        >
          <div className="flex items-center -space-x-2">
            {visibleMembers.map((m) => (
              <Avatar key={m.user_id} className="h-8 w-8 ring-2 ring-white/50">
                {m.profile?.avatar_url && (
                  <AvatarImage src={m.profile.avatar_url} alt={m.profile?.display_name || ""} />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-[11px] font-medium">
                  {getInitial(m.profile?.display_name)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          {memberCount > 0 && (
            <span className="text-[11px] text-white/70 font-medium">
              {memberCount} member{memberCount !== 1 ? "s" : ""}
            </span>
          )}
        </button>
      </div>

      {/* ─── CONTENT SHEET ─── */}
      <div className="flex-1 rounded-t-3xl -mt-6 relative z-10" style={{ background: "#F1F5F9" }}>
        <div className="pt-4">
          {/* Status info bar */}
          <div className="mx-4 mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
            <span className="text-sm font-medium" style={{ color: "#0D9488" }}>
              {statusLabel}
            </span>
            <button
              onClick={() => setShareInviteOpen(true)}
              className="flex items-center gap-1.5 rounded-full px-3 h-7 text-xs font-medium transition-colors"
              style={{ color: "#0D9488", border: "1px solid rgba(13, 148, 136, 0.3)" }}
            >
              <Share2 className="h-3 w-3" />
              Share
            </button>
          </div>

          {/* Section cards */}
          <TripDashboard
            tripId={trip.id}
            routeLocked={trip.route_locked ?? false}
            settlementCurrency={trip.settlement_currency}
            myRole={myRole}
            startDate={trip.tentative_start_date}
            endDate={trip.tentative_end_date}
          />
        </div>
      </div>

      <MemberListSheet
        open={memberSheetOpen}
        onOpenChange={setMemberSheetOpen}
        members={members ?? []}
      />

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

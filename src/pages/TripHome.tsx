import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, MapPin, Camera, ImageOff, Move, Upload, Pencil, Share2, Settings } from "lucide-react";
import { CoverCropOverlay } from "@/components/trip/CoverCropOverlay";
import { useState, useCallback, useEffect, useRef } from "react";
import { ShareInviteModal } from "@/components/ShareInviteModal";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { TripDashboard } from "@/components/trip/TripDashboard";
import { MemberListSheet } from "@/components/trip/MemberListSheet";
import { AttendanceInviteOverlay } from "@/components/trip/AttendanceInviteOverlay";
import { TripDateEditor } from "@/components/trip/TripDateEditor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { useTripRealtime, type ConnectionStatus } from "@/hooks/useTripRealtime";
import { toast } from "sonner";
import { resolvePhoto, DEFAULT_TRIP_PHOTO } from "@/lib/tripPhoto";
import { useTripCoverUrl } from "@/hooks/useTripCoverUrl";
import { cn } from "@/lib/utils";

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

const ATTENDANCE_BADGE: Record<string, { label: string; className: string }> = {
  going: { label: "✓ You're going", className: "bg-[#0D9488]/10 text-[#0D9488] border-[#0D9488]/20" },
  maybe: { label: "~ Maybe", className: "bg-amber-50 text-amber-700 border-amber-200" },
  not_going: { label: "✗ Can't make it", className: "bg-muted text-muted-foreground border-border" },
};

export default function TripHome() {
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
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

  const updateAttendance = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("trip_members")
        .update({ attendance_status: status } as any)
        .eq("trip_id", tripId!)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ["my-trip-membership", tripId] });
      qc.invalidateQueries({ queryKey: ["trip-members-full", tripId] });
      qc.invalidateQueries({ queryKey: ["admin-members", tripId] });
      qc.invalidateQueries({ queryKey: ["global-decisions"] });
      if (status === "going") toast.success("You're in!");
      else if (status === "maybe") toast.success("Marked as maybe");
      else toast.success("Got it - you can still follow along");
    },
    onError: () => toast.error("Failed to update attendance"),
  });

  const { data: members } = useQuery({
    queryKey: ["trip-members-full", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, role, joined_at, attendance_status")
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

  const { data: routeStops } = useQuery({
    queryKey: ["trip-route-stops", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_route_stops")
        .select("destination")
        .eq("trip_id", tripId!)
        .order("start_date");
      if (error) throw error;
      return data.map((s) => s.destination);
    },
    enabled: !!tripId && !!user,
  });

  const [shareInviteOpen, setShareInviteOpen] = useState(false);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);
  const [croppingCover, setCroppingCover] = useState(false);
  const [savingCrop, setSavingCrop] = useState(false);
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const updateTripDates = useMutation({
    mutationFn: async ({ start, end }: { start: string | null; end: string | null }) => {
      const { error } = await supabase
        .from("trips")
        .update({ tentative_start_date: start, tentative_end_date: end })
        .eq("id", tripId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trips", user?.id] });
      setDateEditorOpen(false);
      toast.success("Trip dates updated");
    },
    onError: () => toast.error("Failed to update dates"),
  });
  const heroRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const coverImagePath = (trip as any)?.cover_image_path as string | null;
  const { data: coverSignedUrl } = useTripCoverUrl(tripId, coverImagePath);

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tripId) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    setUploadingCover(true);
    setCoverMenuOpen(false);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `covers/${tripId}/cover.${ext}`;
      const { error: upErr } = await supabase.storage.from("trip-attachments").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("trips").update({ cover_image_path: path } as any).eq("id", tripId);
      if (dbErr) throw dbErr;
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trip-cover-url", tripId] });
      toast.success("Cover photo updated!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload image");
    } finally {
      setUploadingCover(false);
      e.target.value = "";
    }
  }, [tripId, qc]);

  const handleResetCover = useCallback(async () => {
    if (!tripId) return;
    setCoverMenuOpen(false);
    try {
      const { error } = await supabase.from("trips").update({ cover_image_path: null } as any).eq("id", tripId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trip-cover-url", tripId] });
      toast.success("Cover photo reset to default");
    } catch (err: any) {
      toast.error(err?.message || "Failed to reset cover");
    }
  }, [tripId, qc]);

  const handleCropSave = useCallback(async (blob: Blob) => {
    if (!tripId) return;
    setSavingCrop(true);
    try {
      const path = `covers/${tripId}/cover.jpg`;
      const { error: upErr } = await supabase.storage.from("trip-attachments").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("trips").update({ cover_image_path: path } as any).eq("id", tripId);
      if (dbErr) throw dbErr;
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trip-cover-url", tripId] });
      setCroppingCover(false);
      toast.success("Cover photo adjusted!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save crop");
    } finally {
      setSavingCrop(false);
    }
  }, [tripId, qc]);

  const handleStartAdjust = useCallback(() => {
    setCoverMenuOpen(false);
    setCroppingCover(true);
  }, []);

  // Attendance overlay state
  const sessionKey = `junto_invite_dismissed_${tripId}`;
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [overlayForcedOpen, setOverlayForcedOpen] = useState(false);
  const [overlayAnimating, setOverlayAnimating] = useState(false);

  useEffect(() => {
    if (!myMembership) return;
    if (myMembership.attendance_status === "pending") {
      sessionStorage.removeItem(sessionKey);
      setOverlayDismissed(false);
    } else {
      setOverlayDismissed(!!sessionStorage.getItem(sessionKey));
    }
  }, [myMembership?.attendance_status, sessionKey]);

  const isPending = myAttendanceStatus === "pending";
  const hasLoaded = myMembership !== undefined;
  const showOverlay = hasLoaded && ((isPending && !overlayDismissed) || overlayForcedOpen || overlayAnimating);
  const showPeekingTab = hasLoaded && isPending && overlayDismissed && !overlayForcedOpen;

  const handleOverlayDismiss = useCallback(() => {
    sessionStorage.setItem(sessionKey, "1");
    setOverlayDismissed(true);
    setOverlayForcedOpen(false);
  }, [sessionKey]);

  const handleOverlayRespond = useCallback(
    (status: string) => {
      updateAttendance.mutate(status);
      if (status === "going") setOverlayAnimating(true);
      const delay = status === "going" ? 5500 : 400;
      setTimeout(() => {
        sessionStorage.removeItem(sessionKey);
        setOverlayDismissed(true);
        setOverlayForcedOpen(false);
        setOverlayAnimating(false);
      }, delay);
    },
    [updateAttendance, sessionKey]
  );

  const handleOpenOverlay = useCallback(() => {
    setOverlayForcedOpen(true);
    setOverlayDismissed(false);
  }, []);

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

  const visibleMembers = members?.slice(0, 5) ?? [];
  const memberCount = members?.length ?? 0;
  const coverPhoto = coverSignedUrl || resolvePhoto(trip.name, routeStops ?? []);

  const attendanceBadge = myAttendanceStatus && myAttendanceStatus !== "pending"
    ? ATTENDANCE_BADGE[myAttendanceStatus]
    : null;

  return (
    <div className="flex flex-col min-h-dvh animate-slide-in bg-background">
      {/* Crop overlay */}
      {croppingCover && coverSignedUrl && (
        <CoverCropOverlay
          imageSrc={coverSignedUrl}
          onSave={handleCropSave}
          onCancel={() => setCroppingCover(false)}
          saving={savingCrop}
        />
      )}

      {/* ─── COVER PHOTO — no text overlay ─── */}
      <div
        ref={heroRef}
        className="relative w-full overflow-hidden rounded-b-2xl"
        style={{ height: 200 }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0D9488, #0369a1)" }} />
        <img
          src={coverPhoto}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { e.currentTarget.src = DEFAULT_TRIP_PHOTO; }}
        />
        {/* Top gradient for nav buttons */}
        <div className="absolute inset-x-0 top-0 h-20" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.3), transparent)" }} />
        {/* Bottom gradient + trip name/date overlay */}
        <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }} />
        <div className="absolute bottom-0 inset-x-0 px-4 pb-3">
          <p className="text-white text-[18px] font-bold leading-tight drop-shadow-sm truncate">
            {trip?.destination || trip?.name}
          </p>
          <p className="text-white/80 text-[13px] mt-0.5 drop-shadow-sm">
            {formatDateRange(trip?.tentative_start_date ?? null, trip?.tentative_end_date ?? null)}
          </p>
        </div>

        {/* Back button */}
        <button
          onClick={() => navigate("/app/trips")}
          className="absolute left-4 md:hidden flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white text-sm hover:bg-black/40 transition-colors"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)", background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          My Trips
        </button>

        {/* Right side: Share + Settings + Camera + Live */}
        {!builderOpen && (
          <div className="absolute right-4 flex items-center gap-2" style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
            <LiveIndicator status={connectionStatus} />
            <button
              onClick={() => setShareInviteOpen(true)}
              className="relative z-[5] flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                background: "rgba(0,0,0,0.3)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <Share2 className="h-4 w-4 text-white" />
            </button>
            <button
              onClick={() => navigate(`/app/trips/${tripId}/admin`)}
              className="relative z-[5] flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                background: "rgba(0,0,0,0.3)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <Settings className="h-4 w-4 text-white" />
            </button>
            <button
              onClick={() => setCoverMenuOpen(true)}
              className="relative z-[5] flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                background: "rgba(0,0,0,0.3)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              {uploadingCover ? (
                <Loader2 className="h-4 w-4 text-white animate-spin" />
              ) : (
                <Camera className="h-4 w-4 text-white" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverUpload}
              disabled={uploadingCover}
            />
          </div>
        )}
      </div>

      {/* ─── TRIP INFO (below photo, on white background) ─── */}
      <div className="px-4 pt-4 pb-2 md:max-w-[700px] md:mx-auto md:px-8 space-y-2">
        {/* Trip name */}
        {editingName ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = nameDraft.trim();
              if (trimmed && trimmed !== trip.name) {
                supabase.from("trips").update({ name: trimmed }).eq("id", tripId!).then(({ error }) => {
                  if (error) { toast.error("Failed to rename trip"); return; }
                  qc.invalidateQueries({ queryKey: ["trip", tripId] });
                  qc.invalidateQueries({ queryKey: ["trips", user?.id] });
                  toast.success("Trip renamed");
                });
              }
              setEditingName(false);
            }}
          >
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => setEditingName(false)}
              className="bg-transparent text-2xl font-bold text-foreground leading-tight border-b border-border outline-none w-full"
              autoFocus
            />
          </form>
        ) : (
          <button
            onClick={() => { if (isAdmin) { setNameDraft(trip.name); setEditingName(true); } }}
            className="flex items-center gap-2 group text-left"
          >
            <h1 className="text-2xl font-bold text-foreground leading-tight">{trip.name}</h1>
            {isAdmin && <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
          </button>
        )}

        {/* Date range */}
        <button
          onClick={() => { if (isAdmin) setDateEditorOpen(true); }}
          className="flex items-center gap-1.5 group"
        >
          <p className="text-sm text-muted-foreground">
            {formatDateRange(trip.tentative_start_date, trip.tentative_end_date)}
          </p>
          {isAdmin && <Pencil className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
        </button>

        {/* Members + attendance badge row */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMemberSheetOpen(true)}
            className="flex items-center gap-2 shrink-0"
          >
            <div className="flex items-center -space-x-2">
              {visibleMembers.map((m) => (
                <Avatar key={m.user_id} className="h-7 w-7 ring-2 ring-background">
                  {m.profile?.avatar_url && (
                    <AvatarImage src={m.profile.avatar_url} alt={m.profile?.display_name || ""} />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-medium">
                    {getInitial(m.profile?.display_name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            {memberCount > 0 && (
              <span className="text-[12px] text-muted-foreground whitespace-nowrap">
                {memberCount} member{memberCount !== 1 ? "s" : ""}
              </span>
            )}
          </button>

          {attendanceBadge && (
            <button
              onClick={handleOpenOverlay}
              className={cn("text-[11px] font-medium px-2.5 py-0.5 rounded-full border transition-colors", attendanceBadge.className)}
            >
              {attendanceBadge.label}
            </button>
          )}
        </div>
      </div>

      {/* ─── DASHBOARD CONTENT ─── */}
      <div className="flex-1">
        <TripDashboard
          tripId={trip.id}
          routeLocked={trip.route_locked ?? false}
          settlementCurrency={trip.settlement_currency}
          myRole={myRole}
          startDate={trip.tentative_start_date}
          endDate={trip.tentative_end_date}
          tripName={trip.destination || trip.name}
          coverPhoto={coverPhoto}
          onBuilderToggle={setBuilderOpen}
          onShareOpen={() => setShareInviteOpen(true)}
        />
      </div>

      {/* ─── ATTENDANCE OVERLAY ─── */}
      <AttendanceInviteOverlay
        tripId={trip.id}
        tripName={trip.name}
        tripEmoji={trip.emoji}
        startDate={trip.tentative_start_date}
        endDate={trip.tentative_end_date}
        coverPhoto={coverPhoto}
        members={members ?? []}
        currentUserId={user!.id}
        open={showOverlay}
        peeking={showPeekingTab}
        onPeekTap={handleOpenOverlay}
        onDismiss={handleOverlayDismiss}
        onRespond={handleOverlayRespond}
        isPending={updateAttendance.isPending}
      />

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

      <TripDateEditor
        open={dateEditorOpen}
        onOpenChange={setDateEditorOpen}
        startDate={trip.tentative_start_date}
        endDate={trip.tentative_end_date}
        onSave={(start, end) => updateTripDates.mutate({ start, end })}
        saving={updateTripDates.isPending}
      />

      {/* Cover image menu drawer */}
      <Drawer open={coverMenuOpen} onOpenChange={setCoverMenuOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Cover Photo</DrawerTitle>
            <DrawerDescription className="sr-only">Change trip cover image</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            <Button variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Upload new photo
            </Button>
            {coverImagePath && (
              <Button variant="outline" className="w-full justify-start gap-3 h-12" onClick={handleStartAdjust}>
                <Move className="h-4 w-4" />
                Adjust position
              </Button>
            )}
            {coverImagePath && (
              <Button variant="outline" className="w-full justify-start gap-3 h-12 text-destructive hover:text-destructive" onClick={handleResetCover}>
                <ImageOff className="h-4 w-4" />
                Reset to default
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

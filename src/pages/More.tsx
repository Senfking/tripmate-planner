import { useState, useRef, useCallback, useEffect } from "react";
import { subscribeToPush } from "@/lib/pushSubscription";
import { DesktopFooter } from "@/components/DesktopFooter";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CurrencyPicker } from "@/components/expenses/CurrencyPicker";
import { SingleNationalityPicker } from "@/components/profile/SingleNationalityPicker";
import { countryName } from "@/lib/countries";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  LogOut,
  Camera,
  ChevronRight,
  Pencil,
  Coins,
  KeyRound,
  Mail,
  ChevronsUpDown,
  Copy,
  AlertTriangle,
  Trash2,
  Crown,
  Hash,
  ArrowLeft,
  Bell,
  Globe,
  Gift,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { toast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/supabaseErrors";

/* ───────── helpers ───────── */

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  if (name) return name.charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

/* ───────── push enable button ───────── */

function PushEnableButton() {
  const [status, setStatus] = useState<"unknown" | "enabled" | "denied" | "available">("unknown");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("denied");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
    } else if (Notification.permission === "granted") {
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription().then((sub) => setStatus(sub ? "enabled" : "available")),
      );
    } else {
      setStatus("available");
    }
  }, []);

  if (status === "enabled") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15">
          <Bell className="h-3 w-3 text-primary" />
        </div>
        Push notifications enabled
      </div>
    );
  }
  if (status === "denied") {
    return <p className="text-xs text-muted-foreground">Push notifications are blocked in your browser settings.</p>;
  }
  if (status === "available") {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          const sub = await subscribeToPush();
          setStatus(sub ? "enabled" : "denied");
          setLoading(false);
        }}
      >
        Enable push notifications
      </Button>
    );
  }
  return null;
}

/* ───────── chevron row ───────── */

function SettingRow({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/50"
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-foreground">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
    </button>
  );
}

/* ───────── Avatar Crop Drawer ───────── */

function AvatarCropDrawer({
  file,
  open,
  onClose,
  onSave,
}: {
  file: File | null;
  open: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // x, y = top-left of visible region in image-pixel coords; scale = image pixels per canvas pixel
  const stateRef = useRef({ x: 0, y: 0, scale: 1, minScale: 0.5, maxScale: 4 });
  const dragRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; startScale: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoomValue, setZoomValue] = useState(0); // 0-100 range for slider
  const SIZE = 280;

  const clampState = () => {
    const s = stateRef.current;
    const img = imgRef.current;
    if (!img) return;
    s.scale = Math.max(s.minScale, Math.min(s.maxScale, s.scale));
    const viewW = SIZE * s.scale;
    const viewH = SIZE * s.scale;
    s.x = Math.max(0, Math.min(img.width - viewW, s.x));
    s.y = Math.max(0, Math.min(img.height - viewH, s.y));
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, s.x, s.y, SIZE * s.scale, SIZE * s.scale, 0, 0, SIZE, SIZE);
  }, []);

  const updateZoomSlider = useCallback(() => {
    const s = stateRef.current;
    const pct = 1 - (s.scale - s.minScale) / (s.maxScale - s.minScale);
    setZoomValue(Math.round(pct * 100));
  }, []);

  useEffect(() => {
    if (!file || !open) { setLoaded(false); return; }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const minDim = Math.min(img.width, img.height);
      // Start fully zoomed out to fit the smaller dimension
      const fitScale = minDim / SIZE;
      const maxScale = Math.max(img.width, img.height) / SIZE;
      stateRef.current = {
        x: (img.width - SIZE * fitScale) / 2,
        y: (img.height - SIZE * fitScale) / 2,
        scale: fitScale,
        minScale: Math.min(fitScale * 0.3, 0.5),
        maxScale: Math.max(maxScale, fitScale * 3),
      };
      setLoaded(true);
      updateZoomSlider();
      requestAnimationFrame(draw);
    };
    img.src = URL.createObjectURL(file);
    return () => URL.revokeObjectURL(img.src);
  }, [file, open, draw, updateZoomSlider]);

  // ── Pointer drag (mouse + single touch) ──
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && pinchRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { lastX: e.clientX, lastY: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !imgRef.current) return;
    const s = stateRef.current;
    const dx = (e.clientX - dragRef.current.lastX) * s.scale;
    const dy = (e.clientY - dragRef.current.lastY) * s.scale;
    s.x -= dx;
    s.y -= dy;
    dragRef.current = { lastX: e.clientX, lastY: e.clientY };
    clampState();
    draw();
  };

  const handlePointerUp = () => { dragRef.current = null; };

  // ── Touch pinch-to-zoom ──
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const handleTouchStart = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      touchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (touchesRef.current.size === 2) {
      const pts = Array.from(touchesRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchRef.current = { dist, startScale: stateRef.current.scale };
      dragRef.current = null; // cancel drag during pinch
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      touchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (pinchRef.current && touchesRef.current.size >= 2) {
      const pts = Array.from(touchesRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const ratio = pinchRef.current.dist / dist; // pinch out = smaller scale (zoom in)
      const s = stateRef.current;
      const centerX = s.x + (SIZE * s.scale) / 2;
      const centerY = s.y + (SIZE * s.scale) / 2;
      s.scale = pinchRef.current.startScale * ratio;
      clampState();
      // Re-center after zoom
      s.x = centerX - (SIZE * s.scale) / 2;
      s.y = centerY - (SIZE * s.scale) / 2;
      clampState();
      updateZoomSlider();
      draw();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      touchesRef.current.delete(e.changedTouches[i].identifier);
    }
    if (touchesRef.current.size < 2) {
      pinchRef.current = null;
    }
  };

  // ── Mouse wheel zoom ──
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const s = stateRef.current;
    const centerX = s.x + (SIZE * s.scale) / 2;
    const centerY = s.y + (SIZE * s.scale) / 2;
    s.scale *= (1 + e.deltaY * 0.002);
    clampState();
    s.x = centerX - (SIZE * s.scale) / 2;
    s.y = centerY - (SIZE * s.scale) / 2;
    clampState();
    updateZoomSlider();
    draw();
  };

  // ── Zoom slider ──
  const handleZoomChange = (val: number[]) => {
    const pct = val[0] / 100;
    const s = stateRef.current;
    const centerX = s.x + (SIZE * s.scale) / 2;
    const centerY = s.y + (SIZE * s.scale) / 2;
    // pct=0 means max scale (zoomed out), pct=100 means min scale (zoomed in)
    s.scale = s.maxScale - pct * (s.maxScale - s.minScale);
    clampState();
    s.x = centerX - (SIZE * s.scale) / 2;
    s.y = centerY - (SIZE * s.scale) / 2;
    clampState();
    setZoomValue(val[0]);
    draw();
  };

  const handleSave = () => {
    const img = imgRef.current;
    if (!img) return;
    const s = stateRef.current;
    const out = document.createElement("canvas");
    out.width = 512;
    out.height = 512;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(img, s.x, s.y, SIZE * s.scale, SIZE * s.scale, 0, 0, 512, 512);
    out.toBlob((blob) => { if (blob) onSave(blob); }, "image/jpeg", 0.85);
  };

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Crop your photo</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col items-center gap-3 px-4 pb-2">
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-full border-2 border-primary/30"
            style={{ width: SIZE, height: SIZE, touchAction: "none" }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              className="cursor-grab active:cursor-grabbing"
              style={{ width: SIZE, height: SIZE }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
            />
          </div>
          {/* Zoom slider */}
          <div className="flex items-center gap-3 w-full max-w-[280px]">
            <span className="text-xs text-muted-foreground">−</span>
            <Slider
              value={[zoomValue]}
              onValueChange={handleZoomChange}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground">+</span>
          </div>
          <p className="text-xs text-muted-foreground">Drag to reposition · pinch or slide to zoom</p>
        </div>
        <DrawerFooter>
          <Button onClick={handleSave} disabled={!loaded}>Save</Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/* ───────── MAIN COMPONENT ───────── */

const More = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ── local state ── */
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [showCurrency, setShowCurrency] = useState(false);

  const [showNationalities, setShowNationalities] = useState(false);
  const [primaryNatValue, setPrimaryNatValue] = useState<string | null>(null);
  const [secondaryNatValue, setSecondaryNatValue] = useState<string | null>(null);
  const [savingNationalities, setSavingNationalities] = useState(false);

  // Deep-link: /app/more?edit=nationality opens the nationality editor
  // pre-filled with the current values and scrolls to it. Used by the
  // "Add nationality" empty states in the Bookings & trip results pages.
  useEffect(() => {
    if (searchParams.get("edit") !== "nationality") return;
    setPrimaryNatValue(profile?.nationality_iso ?? null);
    setSecondaryNatValue(profile?.secondary_nationality_iso ?? null);
    setShowNationalities(true);
    // Strip the query param so it doesn't re-trigger / pollute history
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
    // Scroll the editor into view once it has rendered
    requestAnimationFrame(() => {
      document
        .getElementById("nationality-editor")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [searchParams, profile?.nationality_iso, profile?.secondary_nationality_iso, setSearchParams]);

  const [showEmailDrawer, setShowEmailDrawer] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const [showDeleteDrawer, setShowDeleteDrawer] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [soleOwnedTrips, setSoleOwnedTrips] = useState<string[] | null>(null);

  // Reset two-step state when delete drawer closes
  useEffect(() => {
    if (!showDeleteDrawer) {
      setDeleteStep(1);
      setDeleteArmed(false);
    }
  }, [showDeleteDrawer]);

  // Arm primary action briefly after each step
  useEffect(() => {
    if (!showDeleteDrawer) return;
    setDeleteArmed(false);
    const t = setTimeout(() => setDeleteArmed(true), 500);
    return () => clearTimeout(t);
  }, [deleteStep, showDeleteDrawer]);

  const [trips, setTrips] = useState<{ id: string; name: string; emoji: string | null; role: string }[]>([]);
  const [hasMoreTrips, setHasMoreTrips] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState(profile?.notification_preferences);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Crop state
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showCropDrawer, setShowCropDrawer] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  // Auth identity detection
  const [isGoogleOnly, setIsGoogleOnly] = useState(false);

  // Stats
  const [tripCount, setTripCount] = useState(0);
  const [companionCount, setCompanionCount] = useState(0);

  // Referral count
  const [referralCount, setReferralCount] = useState(0);


  /* ── sync notif prefs from profile ── */
  useEffect(() => {
    if (profile?.notification_preferences) {
      setNotifPrefs(profile.notification_preferences);
    }
  }, [profile?.notification_preferences]);

  /* ── detect auth identity ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const identities = data.user?.identities ?? [];
      const hasPasswordIdentity = identities.some((i) => i.provider === "email");
      const hasGoogle = identities.some((i) => i.provider === "google");
      setIsGoogleOnly(hasGoogle && !hasPasswordIdentity);
    });
  }, []);

  /* ── fetch trips ── */
  useEffect(() => {
    if (!user) return;
    supabase
      .from("trip_members")
      .select("role, trips(id, name, emoji)")
      .eq("user_id", user.id)
      .limit(6)
      .then(({ data }) => {
        if (!data) return;
        const mapped = data
          .filter((d: any) => d.trips)
          .map((d: any) => ({
            id: d.trips.id,
            name: d.trips.name,
            emoji: d.trips.emoji,
            role: d.role,
          }));
        setHasMoreTrips(mapped.length > 5);
        setTrips(mapped.slice(0, 5));
      })
      .then(null, () => {});
  }, [user]);

  /* ── fetch stats ── */
  useEffect(() => {
    if (!user) return;
    // Trip count
    supabase
      .from("trip_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => setTripCount(count || 0))
      .then(null, () => {});

    // Companion count
    supabase
      .from("trip_members")
      .select("trip_id")
      .eq("user_id", user.id)
      .then(async ({ data: myTrips }) => {
        if (!myTrips || myTrips.length === 0) { setCompanionCount(0); return; }
        const tripIds = myTrips.map((t) => t.trip_id);
        const { data: allMembers } = await supabase
          .from("trip_members")
          .select("user_id")
          .in("trip_id", tripIds);
        if (!allMembers) { setCompanionCount(0); return; }
        const uniqueOthers = new Set(allMembers.map((m) => m.user_id).filter((id) => id !== user.id));
        setCompanionCount(uniqueOthers.size);
      })
      .then(null, () => {});
  }, [user]);

  /* ── fetch referral count ── */
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", user.id)
      .then(({ count }) => setReferralCount(count || 0))
      .then(null, () => {});
  }, [user]);

  /* ── handlers ── */

  const handleSaveName = async () => {
    if (!user || !nameValue.trim()) return;
    setSavingName(true);
    await supabase.from("profiles").update({ display_name: nameValue.trim() }).eq("id", user.id);
    await refreshProfile();
    setSavingName(false);
    setEditingName(false);
    toast({ title: "Display name updated" });
  };

  const handleSaveNationalities = async () => {
    if (!user) return;
    setSavingNationalities(true);
    // PR #233 cutover: write to scalar columns. Keep `nationalities[]` mirrored
    // (primary first, secondary second) so old surfaces still reading the
    // legacy array don't go blank during the transition. The follow-up
    // migration drops `nationalities[]` once every reader has cut over.
    const mirror: string[] = [];
    if (primaryNatValue) mirror.push(primaryNatValue);
    if (secondaryNatValue) mirror.push(secondaryNatValue);
    const { error } = await supabase
      .from("profiles")
      .update({
        nationality_iso: primaryNatValue,
        secondary_nationality_iso: secondaryNatValue,
        nationalities: mirror,
      } as any)
      .eq("id", user.id);
    setSavingNationalities(false);
    if (error) {
      showErrorToast(error, "Couldn't save nationalities");
      return;
    }
    await refreshProfile();
    setShowNationalities(false);
    toast({ title: "Nationalities updated" });
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setShowCropDrawer(true);
    setShowPhotoOptions(false);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleEditExistingPhoto = async () => {
    if (!profile?.avatar_url) return;
    setShowPhotoOptions(false);
    try {
      const res = await fetch(profile.avatar_url);
      const blob = await res.blob();
      const file = new File([blob], "avatar.jpg", { type: blob.type || "image/jpeg" });
      setCropFile(file);
      setShowCropDrawer(true);
    } catch (err) {
      showErrorToast(err, "Failed to load current photo");
    }
  };

  const handleAvatarTap = () => {
    if (profile?.avatar_url) {
      setShowPhotoOptions(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleCroppedUpload = async (blob: Blob) => {
    if (!user) return;
    setShowCropDrawer(false);
    setCropFile(null);
    try {
      const path = `${user.id}/avatar.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true,
        contentType: "image/jpeg",
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = `${publicUrl}?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
      await refreshProfile();
      toast({ title: "Profile photo updated" });
    } catch (err) {
      showErrorToast(err, "Failed to upload photo");
    }
  };

  const handleCurrencyChange = async (currency: string) => {
    if (!user) return;
    await supabase.from("profiles").update({ default_currency: currency }).eq("id", user.id);
    await refreshProfile();
    setShowCurrency(false);
    toast({ title: `Default currency set to ${currency}` });
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) {
      showErrorToast(error, "Couldn't send reset email");
    } else {
      toast({ title: "Password reset email sent - check your inbox" });
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) return;
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) {
      showErrorToast(error, "Couldn't change email");
    } else {
      toast({ title: `Confirmation sent to ${newEmail.trim()}` });
      setShowEmailDrawer(false);
      setNewEmail("");
    }
  };

  const handleNotifToggle = async (key: string, val: boolean) => {
    if (!user || !notifPrefs) return;
    const updated = { ...notifPrefs, [key]: val };
    setNotifPrefs(updated as any);
    await supabase.from("profiles").update({ notification_preferences: updated as any }).eq("id", user.id);
  };

  const handleSignOutAll = async () => {
    await supabase.auth.signOut({ scope: "global" });
    navigate("/ref", { replace: true });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/ref", { replace: true });
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("delete-account", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || res.data?.error) {
        const errData = res.data;
        if (errData?.error === "sole_owner") {
          setSoleOwnedTrips(errData.trips);
        } else {
          showErrorToast(res.error ?? errData, errData?.message || "Failed to delete account");
        }
        setDeleting(false);
        return;
      }
      toast({ title: "Account deleted" });
      navigate("/ref", { replace: true });
    } catch (err) {
      showErrorToast(err, "Couldn't delete account");
      setDeleting(false);
    }
  };

  const openDeleteDrawer = async () => {
    setSoleOwnedTrips(null);
    setShowDeleteDrawer(true);
    if (!user) return;
    const { data } = await supabase
      .from("trip_members")
      .select("trip_id, trips(name)")
      .eq("user_id", user.id)
      .eq("role", "owner");
    if (data) {
      const sole: string[] = [];
      for (const m of data) {
        const { count } = await supabase
          .from("trip_members")
          .select("id", { count: "exact", head: true })
          .eq("trip_id", m.trip_id)
          .eq("role", "owner")
          .neq("user_id", user.id);
        if (count === 0) sole.push((m as any).trips?.name || "Unnamed trip");
      }
      if (sole.length > 0) setSoleOwnedTrips(sole);
    }
  };

  const handleCopyReferral = useCallback(() => {
    if (profile?.referral_code) {
      navigator.clipboard.writeText(profile.referral_code);
      toast({ title: "Code copied!" });
      trackEvent("referral_code_copied", { type: "code" }, user?.id);
    }
  }, [profile?.referral_code, user?.id]);

  const handleCopyReferralLink = useCallback(() => {
    if (profile?.referral_code) {
      navigator.clipboard.writeText(`https://junto.pro/ref?ref=${profile.referral_code}`);
      toast({ title: "Copied!" });
      trackEvent("referral_code_copied", { type: "link" }, user?.id);
    }
  }, [profile?.referral_code, user?.id]);

  const handleShareWhatsApp = useCallback(() => {
    if (!profile?.referral_code) return;
    const text = `✈️ ${profile.display_name} thinks you'd love Junto.\n\nGroup trips are chaos - 200-message threads, spreadsheets, nobody knowing who booked what.\n\nJunto fixes that. One place for your itinerary, expenses, bookings and group decisions.\n\nTry it free → https://junto.pro/ref?ref=${profile.referral_code}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    trackEvent("referral_link_shared", { method: "whatsapp" }, user?.id);
  }, [profile?.referral_code, user?.id]);


  const tier = (profile?.subscription_tier || "free") as "free" | "pro";

  return (
    <div className="flex-1 bg-muted/40">
      <div className="min-h-dvh flex flex-col px-4 pb-32 space-y-4 md:max-w-[640px] md:mx-auto md:px-8" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.5rem)" }}>
      {/* ── Back button ── */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors -mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* ── SECTION 1: Profile Header ── */}
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <div className="relative">
          <div className="h-20 w-20 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-primary">
                {getInitials(profile?.display_name, user?.email)}
              </span>
            )}
          </div>
          <button
            onClick={handleAvatarTap}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
        </div>

        <div className="flex items-center gap-2">
          {profile?.display_name && (
            <h1 className="text-xl font-bold text-foreground">{profile.display_name}</h1>
          )}
          <Badge
            className={
              tier === "pro"
                ? "bg-gradient-to-r from-primary to-secondary text-primary-foreground text-[10px] px-2"
                : "bg-muted text-muted-foreground text-[10px] px-2"
            }
          >
            {tier === "pro" ? "Pro" : "Free"}
          </Badge>
        </div>

        {user?.email && (
          <div className="flex flex-col items-center">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {user.email}
            </p>
            {isGoogleOnly && (
              <p className="text-xs text-muted-foreground mt-1">Signed in with Google</p>
            )}
          </div>
        )}
      </div>

      {/* ── Stats Card ── */}
      <Card>
        <CardContent className="p-4 flex items-center justify-around">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{tripCount}</p>
            <p className="text-xs text-muted-foreground">Trips</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{companionCount}</p>
            <p className="text-xs text-muted-foreground">👥 Travelled with</p>
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 1.5: Invite friends (HERO) ── */}
      {profile?.referral_code && (
        <Card className="overflow-hidden border-0 shadow-lg">
          <div className="relative bg-gradient-to-br from-primary via-primary to-[hsl(var(--primary)/0.85)] p-5 text-primary-foreground">
            {/* Decorative blobs */}
            <div className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />

            <div className="relative space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur-sm">
                    <Gift className="h-3 w-3" />
                    Early access perk
                  </div>
                  <h2 className="mt-2.5 text-[22px] font-bold leading-tight">
                    Invite friends.<br />Earn free Pro.
                  </h2>
                  <p className="mt-1.5 text-sm text-primary-foreground/85 leading-snug">
                    Help us grow Junto — every friend who joins unlocks Pro features for you when we launch.
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 rounded-2xl bg-white/15 backdrop-blur-sm px-4 py-3">
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold leading-none">{referralCount}</p>
                  <p className="text-[11px] text-primary-foreground/80 mt-1">friends joined</p>
                </div>
                <div className="h-8 w-px bg-white/30" />
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold leading-none">{referralCount}</p>
                  <p className="text-[11px] text-primary-foreground/80 mt-1">rewards earned</p>
                </div>
              </div>

              {/* Code */}
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-xl bg-white/95 px-3 py-2.5 text-center font-mono text-base font-semibold tracking-[0.2em] text-foreground">
                  {profile.referral_code}
                </div>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={handleCopyReferral}
                  className="shrink-0 h-11 w-11 bg-white/95 hover:bg-white text-foreground"
                  aria-label="Copy referral code"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              {/* CTAs */}
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2 bg-[#25D366] hover:bg-[#20BD5A] text-white shadow-md font-semibold h-11"
                  onClick={handleShareWhatsApp}
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  Share on WhatsApp
                </Button>
                <Button
                  variant="secondary"
                  className="gap-2 bg-white/95 hover:bg-white text-foreground h-11 px-4"
                  onClick={handleCopyReferralLink}
                  aria-label="Copy invite link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── SECTION 2: Account Settings ── */}
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {/* Edit display name */}
          {editingName ? (
            <div className="flex items-center gap-2 px-4 py-3">
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                placeholder="Display name"
                className="h-9 flex-1"
                autoFocus
              />
              <Button size="sm" onClick={handleSaveName} disabled={savingName}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                ✕
              </Button>
            </div>
          ) : (
            <SettingRow
              icon={Pencil}
              label="Edit display name"
              onClick={() => {
                setNameValue(profile?.display_name || "");
                setEditingName(true);
              }}
            />
          )}

          {/* Default currency */}
          {showCurrency ? (
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground mb-2">Default currency</p>
              <CurrencyPicker
                value={profile?.default_currency || "EUR"}
                onChange={handleCurrencyChange}
              />
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-xs"
                onClick={() => setShowCurrency(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <SettingRow icon={Coins} label={`Default currency: ${profile?.default_currency || "EUR"}`} onClick={() => setShowCurrency(true)} />
          )}

          {!isGoogleOnly && (
            <>
              <SettingRow icon={KeyRound} label="Change password" onClick={handleResetPassword} />
              <SettingRow icon={Mail} label="Change email" onClick={() => setShowEmailDrawer(true)} />
            </>
          )}

          {/* Nationalities (PR #233 — scalar primary + secondary) */}
          {showNationalities ? (
            <div id="nationality-editor" className="px-4 py-3 space-y-3 scroll-mt-24">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">Primary nationality</p>
                <SingleNationalityPicker
                  value={primaryNatValue}
                  onChange={(v) => {
                    setPrimaryNatValue(v);
                    // Clearing the primary auto-clears the secondary; you
                    // can't have a second passport without a first.
                    if (!v) setSecondaryNatValue(null);
                  }}
                  excludeCode={secondaryNatValue}
                  disabled={savingNationalities}
                  placeholder="Select primary nationality…"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">
                  Second nationality{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </p>
                <SingleNationalityPicker
                  value={secondaryNatValue}
                  onChange={setSecondaryNatValue}
                  excludeCode={primaryNatValue}
                  disabled={savingNationalities || !primaryNatValue}
                  placeholder={primaryNatValue ? "Add a second passport…" : "Set primary first"}
                  clearable
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used for personalized travel and visa info. Not shared with other users.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={handleSaveNationalities} disabled={savingNationalities}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowNationalities(false);
                    setPrimaryNatValue(profile?.nationality_iso ?? null);
                    setSecondaryNatValue(profile?.secondary_nationality_iso ?? null);
                  }}
                  disabled={savingNationalities}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <SettingRow
              icon={Globe}
              label={(() => {
                const parts: string[] = [];
                if (profile?.nationality_iso) parts.push(countryName(profile.nationality_iso));
                if (profile?.secondary_nationality_iso) parts.push(countryName(profile.secondary_nationality_iso));
                return parts.length > 0
                  ? `Nationalities: ${parts.join(", ")}`
                  : "Add nationalities (optional)";
              })()}
              onClick={() => {
                setPrimaryNatValue(profile?.nationality_iso ?? null);
                setSecondaryNatValue(profile?.secondary_nationality_iso ?? null);
                setShowNationalities(true);
              }}
            />
          )}

          <SettingRow icon={Hash} label="Join a trip" onClick={() => navigate("/join")} />
        </CardContent>
      </Card>

      {/* ── SECTION 3: My Plan ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {tier === "pro" ? "Pro Plan" : "Free Plan"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tier === "pro" ? "All features unlocked" : "Basic features included"}
              </p>
            </div>
            <Button
              size="sm"
              variant={tier === "pro" ? "outline" : "default"}
              onClick={() => toast({ title: "Coming soon! 🚀" })}
            >
              {tier === "pro" ? "Manage" : "Upgrade to Pro"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 4: Notifications ── */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-medium text-foreground">Notifications</p>
          {notifPrefs && (
            <div className="space-y-3">
              {([
                ["new_expense", "New expenses"],
                ["decisions_reminder", "Polls (new + closing soon)"],
                ["route_confirmed", "Trip countdown reminders"],
                ["new_member", "New members joining"],
                ["new_activity", "Itinerary changes"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{label}</span>
                  <Switch
                    checked={(notifPrefs as any)[key] ?? true}
                    onCheckedChange={(v) => handleNotifToggle(key, v)}
                  />
                </div>
              ))}
            </div>
          )}
          <PushEnableButton />
        </CardContent>
      </Card>

      {/* ── SECTION 5: My Trips ── */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">My Trips</p>
          {trips.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No trips yet</p>
          )}
          {trips.map((t) => (
            <Link
              key={t.id}
              to={`/app/trips/${t.id}`}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50"
            >
              <span className="text-lg">{t.emoji || "✈️"}</span>
              <span className="flex-1 text-sm text-foreground truncate">{t.name}</span>
              <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                {t.role === "owner" ? (
                  <span className="flex items-center gap-1"><Crown className="h-3 w-3" /> Owner</span>
                ) : t.role}
              </Badge>
            </Link>
          ))}
          {hasMoreTrips && (
            <Link to="/app/trips" className="block text-xs text-secondary font-medium pt-1">
              See all trips →
            </Link>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 7: Danger Zone ── */}
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors">
          <ChevronsUpDown className="h-4 w-4" />
          Danger Zone
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="border-destructive/30 mt-2">
            <CardContent className="p-0 divide-y divide-border">
              <button
                onClick={handleSignOutAll}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent/50 transition-colors"
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
                Sign out all devices
              </button>
              <button
                onClick={openDeleteDrawer}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/5 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete account
              </button>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Sign Out button ── */}
      <Button
        variant="outline"
        className="w-full mt-6 mb-2 text-destructive border-destructive/30"
        onClick={handleSignOut}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Sign out
      </Button>

      {/* ── Legal links ── */}
      <div className="flex items-center justify-center gap-3 mt-4 text-xs text-muted-foreground md:hidden">
        <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
          Privacy Policy
        </Link>
        <span>·</span>
        <Link to="/terms" className="underline underline-offset-2 hover:text-foreground transition-colors">
          Terms & Conditions
        </Link>
      </div>

      {/* ── App version footer ── */}
      <p className="text-center text-xs text-muted-foreground pb-4 mt-1">
        Junto · v{__BUILD_TS__}
      </p>

      {/* ── PHOTO OPTIONS DRAWER ── */}
      <Drawer open={showPhotoOptions} onOpenChange={setShowPhotoOptions}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Profile photo</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-3"
              onClick={() => { setShowPhotoOptions(false); fileInputRef.current?.click(); }}
            >
              <Camera className="h-4 w-4" />
              Upload new photo
            </Button>
            {profile?.avatar_url && (
              <Button
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={handleEditExistingPhoto}
              >
                <Pencil className="h-4 w-4" />
                Edit current photo
              </Button>
            )}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── CROP DRAWER ── */}
      <AvatarCropDrawer
        file={cropFile}
        open={showCropDrawer}
        onClose={() => { setShowCropDrawer(false); setCropFile(null); }}
        onSave={handleCroppedUpload}
      />

      {/* ── EMAIL DRAWER ── */}
      <Drawer open={showEmailDrawer} onOpenChange={setShowEmailDrawer}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Change email</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-2">
            <Input
              type="email"
              placeholder="New email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <DrawerFooter>
            <Button onClick={handleChangeEmail} disabled={!newEmail.trim()}>
              Send confirmation
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>


      {/* ── DELETE ACCOUNT DRAWER ── */}
      <Drawer open={showDeleteDrawer} onOpenChange={setShowDeleteDrawer}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {deleteStep === 1 ? "Delete account permanently?" : "Are you sure?"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-3">
            {soleOwnedTrips && soleOwnedTrips.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  This permanently deletes your account and all your data. This cannot be undone.
                </p>
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <p className="font-medium">
                    You are the owner of {soleOwnedTrips.length} trip(s):
                  </p>
                  <ul className="list-disc list-inside mt-1">
                    {soleOwnedTrips.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs">
                    Transfer ownership or delete these trips first.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {deleteStep === 1
                  ? "This will permanently delete your account and all your data (trips, itineraries, expenses, bookings). This action cannot be undone."
                  : "Last chance — this can't be undone."}
              </p>
            )}
          </div>
          <DrawerFooter>
            {(!soleOwnedTrips || soleOwnedTrips.length === 0) && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (deleteStep === 1) {
                    setDeleteStep(2);
                  } else {
                    handleDeleteAccount();
                  }
                }}
                disabled={deleting || !deleteArmed}
              >
                {deleteStep === 1
                  ? "Delete account"
                  : deleting
                  ? "Deleting…"
                  : "Yes, delete forever"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                if (deleteStep === 2) {
                  setDeleteStep(1);
                } else {
                  setShowDeleteDrawer(false);
                }
              }}
              disabled={deleting}
            >
              {deleteStep === 2 ? "Go back" : "Cancel"}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <DesktopFooter />
      </div>
    </div>
  );
};

export default More;

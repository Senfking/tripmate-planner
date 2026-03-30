import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CurrencyPicker } from "@/components/expenses/CurrencyPicker";
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
  Image as ImageIcon,
  Coins,
  KeyRound,
  Mail,
  ChevronsUpDown,
  Copy,
  AlertTriangle,
  Trash2,
  Crown,
  Hash,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

/* ───────── helpers ───────── */

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  if (name) return name.charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

async function resizeImage(file: File, maxSize = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
      } else {
        if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
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

/* ───────── MAIN COMPONENT ───────── */

const More = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  /* ── local state ── */
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [showCurrency, setShowCurrency] = useState(false);

  const [showEmailDrawer, setShowEmailDrawer] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const [showDeleteDrawer, setShowDeleteDrawer] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [soleOwnedTrips, setSoleOwnedTrips] = useState<string[] | null>(null);

  const [trips, setTrips] = useState<{ id: string; name: string; emoji: string | null; role: string }[]>([]);
  const [hasMoreTrips, setHasMoreTrips] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState(profile?.notification_preferences);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── sync notif prefs from profile ── */
  useEffect(() => {
    if (profile?.notification_preferences) {
      setNotifPrefs(profile.notification_preferences);
    }
  }, [profile?.notification_preferences]);

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
      });
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const blob = await resizeImage(file);
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
    } catch {
      toast({ title: "Failed to upload photo", variant: "destructive" });
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
    await supabase.auth.resetPasswordForEmail(user.email);
    toast({ title: "Password reset email sent — check your inbox" });
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) return;
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
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
    navigate("/login", { replace: true });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (deleteEmail !== user.email) {
      toast({ title: "Email doesn't match", variant: "destructive" });
      return;
    }
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
          toast({ title: errData?.message || "Failed to delete account", variant: "destructive" });
        }
        setDeleting(false);
        return;
      }
      toast({ title: "Account deleted" });
      navigate("/login", { replace: true });
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
      setDeleting(false);
    }
  };

  const openDeleteDrawer = async () => {
    setDeleteEmail("");
    setSoleOwnedTrips(null);
    setShowDeleteDrawer(true);
    // Pre-check sole ownership
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
    }
  }, [profile?.referral_code]);

  const tier = (profile?.subscription_tier || "free") as "free" | "pro";

  return (
    <div className="min-h-[calc(100vh-10rem)] bg-muted/40 px-4 pb-32 pt-6 space-y-4">
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
            onClick={() => fileInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
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
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            {user.email}
          </p>
        )}
      </div>

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

          <SettingRow icon={ImageIcon} label="Change profile photo" onClick={() => fileInputRef.current?.click()} />

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

          <SettingRow icon={KeyRound} label="Change password" onClick={handleResetPassword} />
          <SettingRow icon={Mail} label="Change email" onClick={() => setShowEmailDrawer(true)} />
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
                ["new_activity", "New activity added"],
                ["new_expense", "New expense added"],
                ["new_member", "New member joins"],
                ["route_confirmed", "Route confirmed"],
                ["decisions_reminder", "Decisions reminder"],
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
          <p className="text-xs text-muted-foreground">
            Push notifications coming soon — your preferences will be saved
          </p>
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

      {/* ── SECTION 6: Referral ── */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Invite friends to Junto</p>
          {profile?.referral_code && (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg bg-muted px-3 py-2 font-mono text-sm tracking-widest text-foreground">
                {profile.referral_code}
              </div>
              <Button size="icon" variant="outline" onClick={handleCopyReferral} className="shrink-0">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Share your code — referral rewards coming soon
          </p>
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
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-accent/50 transition-colors"
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
                Sign out
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

      {/* Join a trip link */}
      <div className="flex justify-center pt-2">
        <Button variant="outline" className="gap-2" asChild>
          <Link to="/join">
            <Hash className="h-4 w-4" />
            Join a trip
          </Link>
        </Button>
      </div>

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
              Delete account
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              This permanently deletes your account and all your data. This cannot be undone.
            </p>

            {soleOwnedTrips && soleOwnedTrips.length > 0 && (
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
            )}

            {(!soleOwnedTrips || soleOwnedTrips.length === 0) && (
              <>
                <p className="text-sm text-foreground font-medium">
                  Type your email to confirm:
                </p>
                <Input
                  type="email"
                  placeholder={user?.email || ""}
                  value={deleteEmail}
                  onChange={(e) => setDeleteEmail(e.target.value)}
                />
              </>
            )}
          </div>
          <DrawerFooter>
            {(!soleOwnedTrips || soleOwnedTrips.length === 0) && (
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deleting || deleteEmail !== user?.email}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </Button>
            )}
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default More;

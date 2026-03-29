import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getShareableAppOrigin } from "@/lib/appUrl";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Copy,
  Loader2,
  Trash2,
  CalendarPlus,
  Download,
  Share2,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

interface Props {
  tripId: string;
  tripName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  trip: {
    emoji?: string | null;
    tentative_start_date?: string | null;
    tentative_end_date?: string | null;
    trip_code?: string;
  };
}

/* ── helpers ─────────────────────────────────────────── */

function buildMembersLine(names: string[], total: number): string {
  if (total === 0) return "";
  if (total === 1) return `${names[0]} is going`;
  if (total === 2) return `${names[0]} and ${names[1]} are going`;
  return `${names[0]}, ${names[1]} and ${total - 2} others are going`;
}

function buildRouteLine(stops: { destination: string }[]): string {
  if (stops.length === 0) return "";
  return `Route: ${stops.map((s) => s.destination).join(" → ")}`;
}

function buildDateStr(start: string | null | undefined, end: string | null | undefined) {
  if (start && end)
    return `${format(new Date(start), "MMM d")} – ${format(new Date(end), "MMM d")}`;
  if (start) return `from ${format(new Date(start), "MMM d")}`;
  return "";
}

function filterLines(lines: string[]): string {
  return lines.filter((l) => l !== "").join("\n");
}

/* ── component ───────────────────────────────────────── */

export function ShareInviteModal({ tripId, tripName, open, onOpenChange, isAdmin, trip }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [includeExpenses, setIncludeExpenses] = useState(false);

  const origin = getShareableAppOrigin() || window.location.origin;
  const tripCode = (trip as any).trip_code as string | undefined;

  /* ── invite token ──────────────────────────────────── */
  const { data: activeInvite, isLoading: inviteLoading } = useQuery({
    queryKey: ["active-invite", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("*")
        .eq("trip_id", tripId)
        .is("revoked_at" as any, null)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!user,
  });

  const createInvite = useMutation({
    mutationFn: async () => {
      const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
      const token = Array.from(crypto.getRandomValues(new Uint8Array(10)))
        .map((b) => chars[b % chars.length])
        .join("");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("invites").insert({
        trip_id: tripId,
        token,
        role: "member",
        expires_at: expiresAt,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-invite", tripId] }),
    onError: () => toast.error("Failed to create invite link"),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invites")
        .update({ revoked_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-invite", tripId] });
      toast.success("Invite link revoked");
    },
    onError: () => toast.error("Failed to revoke invite"),
  });

  useEffect(() => {
    if (open && !inviteLoading && !activeInvite && !createInvite.isPending && !createInvite.isSuccess && user) {
      createInvite.mutate();
    }
  }, [open, inviteLoading, activeInvite, user]);

  const inviteUrl = activeInvite ? `${origin}/i/${activeInvite.token}` : null;

  /* ── share token ───────────────────────────────────── */
  const { data: activeShare, isLoading: shareLoading } = useQuery({
    queryKey: ["share-token", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_share_tokens")
        .select("*")
        .eq("trip_id", tripId)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!user,
  });

  const createShare = useMutation({
    mutationFn: async () => {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("trip_share_tokens").insert({
        trip_id: tripId,
        token,
        expires_at: expiresAt,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["share-token", tripId] });
      toast.success("Share link created");
    },
    onError: () => toast.error("Failed to create share link"),
  });

  useEffect(() => {
    if (open && !shareLoading && !activeShare && !createShare.isPending && !createShare.isSuccess && user) {
      createShare.mutate();
    }
  }, [open, shareLoading, activeShare, user]);

  const shareUrl = activeShare
    ? `${origin}/share/${activeShare.token}${includeExpenses ? "?expenses=1" : ""}`
    : null;

  const revokeShare = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("trip_share_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["share-token", tripId] });
      toast.success("Share link revoked");
    },
    onError: () => toast.error("Failed to revoke link"),
  });

  /* ── route stops ───────────────────────────────────── */
  const { data: routeStops } = useQuery({
    queryKey: ["route-stops-share", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_route_stops")
        .select("destination")
        .eq("trip_id", tripId)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!user,
  });

  /* ── members ───────────────────────────────────────── */
  const { data: membersData } = useQuery({
    queryKey: ["members-names-share", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_members")
        .select("user_id, profiles(display_name)")
        .eq("trip_id", tripId);
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!user,
  });

  const memberNames = (membersData || []).map((m: any) => {
    const name = m.profiles?.display_name || "Member";
    return name.split(" ")[0]; // first name
  });
  const memberCount = memberNames.length;

  /* ── WhatsApp helpers ──────────────────────────────── */
  const dateStr = buildDateStr(trip.tentative_start_date, trip.tentative_end_date);
  const routeLine = buildRouteLine(routeStops || []);
  const membersLine = buildMembersLine(memberNames, memberCount);

  const dayCount = trip.tentative_start_date && trip.tentative_end_date
    ? differenceInDays(new Date(trip.tentative_end_date), new Date(trip.tentative_start_date)) + 1
    : null;

  const handleWhatsAppInvite = () => {
    if (!inviteUrl) return;
    const msg = filterLines([
      `Hey! Come plan ${tripName} with us on Junto ✈️`,
      dateStr,
      routeLine,
      membersLine,
      "",
      `Join the trip here:`,
      inviteUrl,
      "",
      tripCode ? `Or open Junto and enter code: ${tripCode}` : "",
    ]);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleWhatsAppShare = () => {
    if (!shareUrl) return;
    const emoji = (trip as any).emoji || "✈️";
    const dateLine = dateStr + (dayCount ? ` · ${dayCount} days` : "");
    const msg = filterLines([
      `${emoji} ${tripName}`,
      dateLine,
      routeLine,
      membersLine,
      "",
      `See the full trip plan:`,
      shareUrl,
      "",
      inviteUrl ? `Want to join us?\n${inviteUrl}` : "",
      "",
      `Planned with Junto 🗺️ juntotravel.lovable.app`,
    ]);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  /* ── copy helper ───────────────────────────────────── */
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  /* ── export helpers ────────────────────────────────── */
  const [icsLoading, setIcsLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  const downloadFile = async (fn: string, filename: string, setLoading: (v: boolean) => void) => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please sign in"); return; }
      const projId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projId}.supabase.co/functions/v1/${fn}?trip_id=${tripId}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  };

  /* ── section label helper ──────────────────────────── */
  const SectionLabel = ({ children, sub }: { children: React.ReactNode; sub: string }) => (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{children}</p>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );

  const isLinkLoading = inviteLoading || createInvite.isPending;

  /* ── render ────────────────────────────────────────── */
  const titleContent = (
    <span className="flex items-center gap-2">
      <Share2 className="h-5 w-5" />
      Share &amp; Invite
    </span>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={titleContent} className="sm:max-w-md">
      <div className="space-y-4">
        {/* ── Section 1: Invite ────────────────────────── */}
        <SectionLabel sub="Add people as trip members">Invite to trip</SectionLabel>

        {isLinkLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : inviteUrl ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm truncate"
              />
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(inviteUrl)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {tripCode && (
              <p className="text-xs text-muted-foreground">
                Code: <span className="font-mono font-medium">{tripCode}</span>
              </p>
            )}
            <Button
              size="sm"
              className="w-full gap-2 bg-[#25D366] hover:bg-[#1da851] text-white"
              onClick={handleWhatsAppInvite}
            >
              <WhatsAppIcon className="h-4 w-4" />
              Share invite via WhatsApp
            </Button>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => revokeInvite.mutate(activeInvite!.id)}
                disabled={revokeInvite.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Revoke link
              </Button>
            )}
          </div>
        ) : (
          <Button
            onClick={() => createInvite.mutate()}
            disabled={createInvite.isPending}
            size="sm"
            className="w-full"
          >
            Generate invite link
          </Button>
        )}

        <Separator />

        {/* ── Section 2: Share plan ────────────────────── */}
        <SectionLabel sub="Share a view-only summary — no login needed">Share trip plan</SectionLabel>

        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="include-expenses" className="text-sm font-medium">Include expense summary</Label>
            <p className="text-xs text-muted-foreground">Shows total spent and who owes whom</p>
          </div>
          <Switch id="include-expenses" checked={includeExpenses} onCheckedChange={setIncludeExpenses} />
        </div>

        {shareLoading || createShare.isPending ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : shareUrl && activeShare ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm truncate"
              />
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(shareUrl)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Expires on {format(new Date(activeShare.expires_at), "MMM d, yyyy")}
            </p>
            <Button
              size="sm"
              className="w-full gap-2 bg-[#25D366] hover:bg-[#1da851] text-white"
              onClick={handleWhatsAppShare}
            >
              <WhatsAppIcon className="h-4 w-4" />
              Share plan via WhatsApp
            </Button>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => revokeShare.mutate(activeShare.id)}
                disabled={revokeShare.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Revoke link
              </Button>
            )}
          </div>
        ) : (
          <Button
            onClick={() => createShare.mutate()}
            disabled={createShare.isPending}
            size="sm"
            className="w-full"
          >
            Generate share link
          </Button>
        )}

        <Separator />

        {/* ── Section 3: Export ─────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Also export</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={icsLoading}
              onClick={() => downloadFile("export-trip-ics", "junto-itinerary.ics", setIcsLoading)}
            >
              {icsLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />}
              Add to Calendar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={csvLoading}
              onClick={() => downloadFile("export-expenses-csv", "junto-expenses.csv", setCsvLoading)}
            >
              {csvLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
              Export CSV
            </Button>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}

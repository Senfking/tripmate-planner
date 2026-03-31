import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getShareableAppOrigin } from "@/lib/appUrl";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Copy,
  Loader2,
  CalendarPlus,
  Download,
  Info,
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
    share_permission?: string;
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

  const shareRestricted = (trip as any).share_permission === "admin" && !isAdmin;

  const origin = getShareableAppOrigin() || window.location.origin;
  const tripCode = (trip as any).trip_code as string | undefined;

  /* ── invite URL (uses trip_code directly) ──────────── */
  const inviteUrl = tripCode ? `${origin}/join/${tripCode}` : null;

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
      const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
      const token = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => chars[b % chars.length])
        .join("");
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
      `Join me on ${tripName} on Junto! ✈️`,
      "",
      tripCode ? `Use code ${tripCode} or tap:` : `Tap to join:`,
      inviteUrl,
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

  /* ── render ────────────────────────────────────────── */
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Share & Invite"
      className="sm:max-w-[420px]"
    >
      {shareRestricted ? (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
          <p className="text-sm font-medium text-foreground">Sharing restricted</p>
          <p className="text-xs text-muted-foreground max-w-[260px]">
            Only admins and the trip owner can generate invite and share links for this trip.
          </p>
        </div>
      ) : (
      <div className="space-y-5 -mt-1">
        {/* ── Section 1: Invite members ────────────────── */}
        <section className="space-y-3">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Invite to trip</h3>
            <p className="text-[13px] text-muted-foreground font-normal mt-0.5">Share the code or link to add members</p>
          </div>

          {tripCode ? (
            <div className="space-y-3">
              <button
                className="w-full flex flex-col items-center py-5 rounded-xl bg-muted/50 hover:bg-muted/80 transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(tripCode);
                  toast.success("Code copied!");
                }}
              >
                <span className="text-[28px] font-bold font-mono tracking-[0.15em] text-foreground">
                  {tripCode}
                </span>
                <span className="text-[12px] text-muted-foreground mt-1">Tap to copy</span>
              </button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl h-11 text-[14px] font-medium gap-1.5"
                  onClick={() => inviteUrl && copyToClipboard(inviteUrl)}
                >
                  <Copy className="h-4 w-4" />
                  Copy link
                </Button>
                <Button
                  className="flex-1 gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl h-11 text-[14px] font-medium shadow-sm"
                  onClick={handleWhatsAppInvite}
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  Share via WhatsApp
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No trip code available</p>
          )}
        </section>

        {/* ── Section 2: Share plan ────────────────────── */}
        <section className="space-y-3">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Share plan</h3>
            <p className="text-[13px] text-muted-foreground font-normal mt-0.5">View-only — no login needed</p>
          </div>

          <div className="flex items-center justify-between gap-3 py-0.5">
            <div>
              <Label htmlFor="include-expenses" className="text-[14px] font-medium text-foreground">Include expenses</Label>
              <p className="text-[12px] text-muted-foreground leading-tight mt-0.5">Who owes whom</p>
            </div>
            <Switch id="include-expenses" checked={includeExpenses} onCheckedChange={setIncludeExpenses} />
          </div>

          {shareLoading || createShare.isPending ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : shareUrl && activeShare ? (
            <div className="space-y-2.5">
              <Button
                className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl h-11 text-[14px] font-medium shadow-sm"
                onClick={handleWhatsAppShare}
              >
                <WhatsAppIcon className="h-4 w-4" />
                Share plan via WhatsApp
              </Button>
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-muted-foreground">
                  Expires {format(new Date(activeShare.expires_at), "MMM d, yyyy")}
                </p>
                <button
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  onClick={() => copyToClipboard(shareUrl)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              {isAdmin && (
                <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                  <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-muted-foreground leading-snug">
                      Revoking disables this share link permanently. You can generate a new one anytime.
                    </p>
                    <button
                      className="text-[12px] font-medium text-destructive hover:text-destructive/80 transition-colors mt-1"
                      onClick={() => revokeShare.mutate(activeShare.id)}
                      disabled={revokeShare.isPending}
                    >
                      {revokeShare.isPending ? "Revoking…" : "Revoke this link"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Button
              onClick={() => createShare.mutate()}
              disabled={createShare.isPending}
              variant="outline"
              className="w-full rounded-xl h-11 text-[14px] font-medium"
            >
              Generate share link
            </Button>
          )}
        </section>

        {/* ── Section 3: Export ─────────────────────────── */}
        <section className="space-y-2.5">
          <h3 className="text-[12px] font-medium text-muted-foreground">Export</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-11 text-[14px] font-medium"
              disabled={icsLoading}
              onClick={() => downloadFile("export-trip-ics", "junto-itinerary.ics", setIcsLoading)}
            >
              {icsLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-1.5" />}
              Calendar
            </Button>
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-11 text-[14px] font-medium"
              disabled={csvLoading}
              onClick={() => downloadFile("export-expenses-csv", "junto-expenses.csv", setCsvLoading)}
            >
              {csvLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
              Expenses CSV
            </Button>
          </div>
        </section>
      </div>
      )}
    </ResponsiveModal>
  );
}
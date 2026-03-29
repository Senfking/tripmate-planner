import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getShareableAppOrigin } from "@/lib/appUrl";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Copy, Link2, CalendarPlus, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";

interface Props {
  tripId: string;
  tripName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}

export function ShareModal({ tripId, tripName, open, onOpenChange, isAdmin }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [includeExpenses, setIncludeExpenses] = useState(false);

  const { data: activeToken, isLoading } = useQuery({
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

  const { data: tripData } = useQuery({
    queryKey: ["trip-dates-share", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("tentative_start_date, tentative_end_date")
        .eq("id", tripId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!user,
  });

  const generateMutation = useMutation({
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
      return token;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["share-token", tripId] });
      toast.success("Share link created");
    },
    onError: () => toast.error("Failed to create share link"),
  });

  const revokeMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const { error } = await supabase
        .from("trip_share_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", tokenId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["share-token", tripId] });
      toast.success("Share link revoked");
    },
    onError: () => toast.error("Failed to revoke link"),
  });

  const origin = getShareableAppOrigin() || window.location.origin;
  const shareUrl = activeToken
    ? `${origin}/share/${activeToken.token}${includeExpenses ? "?expenses=1" : ""}`
    : null;

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const buildDateStr = () => {
    const s = tripData?.tentative_start_date;
    const e = tripData?.tentative_end_date;
    if (s && e) return `${format(new Date(s), "MMM d")} – ${format(new Date(e), "MMM d")}`;
    if (s) return `from ${format(new Date(s), "MMM d")}`;
    return "";
  };

  const handleWhatsApp = () => {
    if (!shareUrl) return;
    const dateStr = buildDateStr();
    const signupUrl = `${origin}/signup`;
    const msg = `✈️ ${tripName}${dateStr ? ` · ${dateStr}` : ""}\n\nHere's our trip plan: ${shareUrl}\n\nJoin us on Junto: ${signupUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

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

  const titleContent = (
    <span className="flex items-center gap-2">
      <Link2 className="h-5 w-5" />
      Share {tripName}
    </span>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={titleContent} className="sm:max-w-md">
      <div className="space-y-4">
        {/* Expense toggle */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="include-expenses" className="text-sm font-medium">Include expense summary</Label>
            <p className="text-xs text-muted-foreground">Shows total spent and who owes whom</p>
          </div>
          <Switch
            id="include-expenses"
            checked={includeExpenses}
            onCheckedChange={setIncludeExpenses}
          />
        </div>

        <Separator />

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeToken && shareUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm truncate"
              />
              <Button size="sm" variant="outline" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Expires on {format(new Date(activeToken.expires_at), "MMM d, yyyy")}
            </p>

            {/* WhatsApp button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10"
              onClick={handleWhatsApp}
            >
              <WhatsAppIcon className="h-4 w-4" />
              Share via WhatsApp
            </Button>

            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => revokeMutation.mutate(activeToken.id)}
                disabled={revokeMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Revoke link
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-4 space-y-3">
            {isAdmin ? (
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Generate share link
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                No share link yet. Ask a trip admin to generate one.
              </p>
            )}
          </div>
        )}

        <Separator />

        {/* Export section */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Also export
          </p>
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

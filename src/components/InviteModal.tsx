import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getShareableAppOrigin } from "@/lib/appUrl";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Copy,
  Check,
  Loader2,
  Link,
  AlertTriangle,
  RefreshCw,
  Ban,
  Hash,
  Users,
} from "lucide-react";

interface InviteModalProps {
  tripId: string;
  tripName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin?: boolean;
}

export function InviteModal({ tripId, tripName, open, onOpenChange, isAdmin = false }: InviteModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const shareableOrigin = getShareableAppOrigin();

  const { data: activeInvite, isLoading: inviteLoading, isError: inviteError } = useQuery({
    queryKey: ["active-invite", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invites")
        .select("*")
        .eq("trip_id", tripId)
        .is("revoked_at" as any, null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!user,
    retry: 1,
  });

  const { data: redemptionCount } = useQuery({
    queryKey: ["invite-redemptions-count", activeInvite?.id],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("invite_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("invite_id", activeInvite!.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!activeInvite?.id,
  });

  const { data: tripData } = useQuery({
    queryKey: ["trip-code", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("trip_code" as any)
        .eq("id", tripId)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: open && !!user,
  });

  const tripCode = tripData?.trip_code;

  const createInvite = useMutation({
    mutationFn: async () => {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("invites").insert({
        trip_id: tripId,
        token,
        role: "member",
        expires_at: expiresAt,
        created_by: user!.id,
      });
      if (error) throw error;
      return token;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-invite", tripId] });
    },
    onError: () => {
      toast.error("Failed to create invite link.");
    },
  });

  const revokeInvite = useMutation({
    mutationFn: async () => {
      if (!activeInvite) return;
      const { error } = await supabase
        .from("invites")
        .update({ revoked_at: new Date().toISOString() } as any)
        .eq("id", activeInvite.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-invite", tripId] });
      toast.success("Invite link revoked.");
    },
    onError: () => {
      toast.error("Failed to revoke link.");
    },
  });

  const regenerateCode = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("regenerate_trip_code", {
        _trip_id: tripId,
      });
      if (error) throw error;
      return data as { success?: boolean; trip_code?: string; error?: string };
    },
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["trip-code", tripId] });
        toast.success("Trip code regenerated.");
      } else {
        toast.error("Failed to regenerate code.");
      }
    },
    onError: () => {
      toast.error("Failed to regenerate code.");
    },
  });

  useEffect(() => {
    if (open && !inviteLoading && !inviteError && !activeInvite && user && shareableOrigin) {
      createInvite.mutate();
    }
  }, [open, inviteLoading, inviteError, activeInvite, user, shareableOrigin]);

  const inviteLink = activeInvite && shareableOrigin
    ? `${shareableOrigin}/app/invite/${activeInvite.token}`
    : null;

  const daysLeft = activeInvite
    ? Math.max(0, Math.ceil((new Date(activeInvite.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    toast.success("Link copied!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = async () => {
    if (!tripCode) return;
    await navigator.clipboard.writeText(tripCode);
    setCopiedCode(true);
    toast.success("Code copied!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setCopiedLink(false);
      setCopiedCode(false);
    }
    onOpenChange(v);
  };

  const content = (
    <div className="space-y-4">
      {!shareableOrigin && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Invite links won't work until the app is published. The trip code below still works.
          </p>
        </div>
      )}

      {/* Share Link Section */}
      {shareableOrigin && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Link className="h-4 w-4" />
            Share link
          </div>

          {inviteLoading && !inviteError ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : inviteLink ? (
            <div className="space-y-2">
              <div className="rounded-md border bg-muted p-2.5">
                <p className="text-xs break-all text-muted-foreground select-all font-mono leading-relaxed">
                  {inviteLink}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleCopyLink}
                  size="sm"
                  variant={copiedLink ? "secondary" : "default"}
                  className="flex-1"
                >
                  {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedLink ? "Copied!" : "Copy link"}
                </Button>
                {isAdmin && (
                  <Button
                    onClick={() => revokeInvite.mutate()}
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={revokeInvite.isPending}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Revoke
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</span>
                {typeof redemptionCount === "number" && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {redemptionCount} joined
                  </span>
                )}
              </div>
            </div>
          ) : (
            <Button
              onClick={() => createInvite.mutate()}
              disabled={createInvite.isPending}
              size="sm"
              className="w-full"
            >
              <Link className="h-4 w-4" />
              Generate invite link
            </Button>
          )}
        </div>
      )}

      {shareableOrigin && <Separator />}

      {/* Trip Code Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Hash className="h-4 w-4" />
          Trip code
        </div>

        {tripCode ? (
          <div className="space-y-2">
            <button
              onClick={handleCopyCode}
              className="w-full flex items-center justify-center gap-3 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 py-3 px-4 hover:bg-primary/10 transition-colors cursor-pointer"
            >
              <span className="text-2xl font-mono font-bold tracking-[0.3em] text-foreground">
                {tripCode}
              </span>
              {copiedCode ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <p className="text-xs text-muted-foreground text-center">
              People can enter this at{" "}
              <span className="font-medium">juntotravel.lovable.app/join</span>
            </p>
            {isAdmin && (
              <Button
                onClick={() => regenerateCode.mutate()}
                size="sm"
                variant="ghost"
                className="w-full text-muted-foreground"
                disabled={regenerateCode.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Generate new code
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Invite to {tripName}</DrawerTitle>
            <DrawerDescription>
              Share the link or trip code so friends can join.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to {tripName}</DialogTitle>
          <DialogDescription>
            Share the link or trip code so friends can join.
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getShareableAppOrigin } from "@/lib/appUrl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2, Link, AlertTriangle } from "lucide-react";

interface InviteModalProps {
  tripId: string;
  tripName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteModal({ tripId, tripName, open, onOpenChange }: InviteModalProps) {
  const { user } = useAuth();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareableOrigin = getShareableAppOrigin();

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

      return `${shareableOrigin}/app/invite/${token}`;
    },
    onSuccess: (link) => {
      setInviteLink(link);
    },
    onError: () => {
      toast.error("Failed to create invite link. Please try again.");
    },
  });

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setInviteLink(null);
      setCopied(false);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to {tripName}</DialogTitle>
          <DialogDescription>
            Generate a link to invite friends. It expires in 7 days.
          </DialogDescription>
        </DialogHeader>

        {!inviteLink ? (
          <Button
            onClick={() => createInvite.mutate()}
            disabled={createInvite.isPending}
            className="w-full"
          >
            {createInvite.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link className="h-4 w-4" />
            )}
            Generate invite link
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
              <p className="flex-1 text-sm break-all text-muted-foreground select-all">
                {inviteLink}
              </p>
            </div>
            <Button onClick={handleCopy} className="w-full" variant={copied ? "secondary" : "default"}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

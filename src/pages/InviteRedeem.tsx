import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "This invite link is invalid or doesn't exist.",
  already_redeemed: "This invite has already been used.",
  expired: "This invite link has expired. Ask the organiser for a new one or request the trip code.",
  already_member: "You're already a member of this trip!",
  not_authenticated: "Please sign in to join this trip.",
  revoked: "This invite link has been disabled. Ask the organiser for the trip code instead.",
};

export default function InviteRedeem() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const attempted = useRef(false);

  const redeem = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("redeem_invite", {
        _token: token!,
      });
      if (error) throw error;
      return data as { success?: boolean; error?: string; trip_id?: string; trip_name?: string };
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`You've joined ${result.trip_name}! 🎉`);
        navigate(`/app/trips/${result.trip_id}`, { replace: true });
      } else if (result.error === "already_member" && result.trip_id) {
        toast.info("You're already a member of this trip!");
        navigate(`/app/trips/${result.trip_id}`, { replace: true });
      }
    },
    onError: () => {
      // generic error handled in render
    },
  });

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Store token so signup/login pages can show contextual message
      sessionStorage.setItem("invite_token", token!);
      navigate(`/signup?redirect=/app/invite/${token}`, { replace: true });
      return;
    }

    if (!attempted.current && token) {
      attempted.current = true;
      redeem.mutate();
    }
  }, [user, authLoading, token]);

  if (authLoading || redeem.isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Joining trip…</p>
      </div>
    );
  }

  const errorKey = redeem.data?.error;
  const errorMsg = errorKey
    ? ERROR_MESSAGES[errorKey] || "Something went wrong. Please try again."
    : redeem.isError
    ? "Something went wrong. Please try again."
    : null;

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center p-6 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive/60" />
        <p className="text-xl font-semibold text-foreground">Can't join trip</p>
        <p className="text-muted-foreground max-w-sm">{errorMsg}</p>
        <Button variant="outline" onClick={() => navigate("/app/trips")}>
          Go to My Trips
        </Button>
      </div>
    );
  }

  return null;
}

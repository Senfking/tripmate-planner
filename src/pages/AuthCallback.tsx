import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { peekAnonSessionId, clearAnonSessionId } from "@/lib/anonSession";
import { Loader2 } from "lucide-react";

function safeRedirect(path: string | null): string {
  if (path && path.startsWith("/") && !path.startsWith("//")) return path;
  return "/app/trips";
}

export default function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));
  const handled = useRef(false);

  // Reset scroll position immediately to prevent visual glitch when
  // transitioning from ReferralLanding's fixed-position scroll container
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (loading || !user || handled.current) return;
    handled.current = true;

    const setupAndNavigate = async () => {
      const referral = localStorage.getItem("junto_referral_code");
      if (referral) {
        try {
          const { data: referrerId } = await supabase.rpc("resolve_referral_code", { _code: referral });
          if (referrerId) {
            await supabase.from("profiles").update({ referred_by: referrerId }).eq("id", user.id);
          }
        } finally {
          localStorage.removeItem("junto_referral_code");
        }
      }
      // Claim any anonymous trips for this session before routing.
      const anonSessionId = peekAnonSessionId();
      let claimedTripId: string | null = null;
      if (anonSessionId) {
        try {
          const { data: sess } = await supabase.auth.getSession();
          const token = sess.session?.access_token;
          if (token) {
            const url = `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "")}/functions/v1/claim-anonymous-trip`;
            const res = await fetch(url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
              },
              body: JSON.stringify({ anon_session_id: anonSessionId }),
            });
            if (res.ok) {
              const json = await res.json();
              const ids = Array.isArray(json?.claimed_trip_ids) ? json.claimed_trip_ids : [];
              if (ids.length > 0) {
                claimedTripId = ids[ids.length - 1];
                clearAnonSessionId();
              }
            }
          }
        } catch (e) {
          console.error("[AuthCallback] claim failed:", e);
        }
      }
      window.scrollTo(0, 0);
      navigate(claimedTripId ? `/app/trips/${claimedTripId}` : redirectTo, { replace: true });
    };

    setupAndNavigate();
  }, [user, loading, navigate, redirectTo]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

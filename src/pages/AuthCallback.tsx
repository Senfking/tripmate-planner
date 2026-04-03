import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
      window.scrollTo(0, 0);
      navigate(redirectTo, { replace: true });
    };

    setupAndNavigate();
  }, [user, loading, navigate, redirectTo]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

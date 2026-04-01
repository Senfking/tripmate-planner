import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const handled = useRef(false);

  useEffect(() => {
    if (loading || !user || handled.current) return;
    handled.current = true;

    const referral = localStorage.getItem("junto_referral_code");
    if (referral) {
      supabase
        .rpc("resolve_referral_code", { _code: referral })
        .then(({ data: referrerId }) => {
          localStorage.removeItem("junto_referral_code");
          if (referrerId) {
            supabase
              .from("profiles")
              .update({ referred_by: referrerId })
              .eq("id", user.id);
          }
        });
    }

    navigate(redirectTo || "/app/trips", { replace: true });
  }, [user, loading, navigate, redirectTo]);

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

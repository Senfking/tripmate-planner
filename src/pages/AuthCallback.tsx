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
        .from("profiles")
        .select("id")
        .eq("referral_code", referral)
        .maybeSingle()
        .then(({ data: referrer }) => {
          if (referrer) {
            supabase
              .from("profiles")
              .update({ referred_by: referrer.id })
              .eq("id", user.id)
              .then(() => localStorage.removeItem("junto_referral_code"));
          } else {
            localStorage.removeItem("junto_referral_code");
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

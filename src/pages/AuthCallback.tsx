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
      navigate(redirectTo, { replace: true });
    };

    setupAndNavigate();
  }, [user, loading, navigate, redirectTo]);

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

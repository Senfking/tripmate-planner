import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Receipt, Vote } from "lucide-react";

const VIDEO_SRC =
  "https://videos.pexels.com/video-files/4010511/4010511-hd_1920_1080_25fps.mp4";

const USPS = [
  { icon: MapPin, label: "Plan together" },
  { icon: Receipt, label: "Split costs" },
  { icon: Vote, label: "Decide as one" },
] as const;

export default function ReferralLanding() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("code");
  const [referrer, setReferrer] = useState<{ display_name: string | null } | null>(null);

  useEffect(() => {
    if (!code) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("referral_code", code)
        .maybeSingle();
      if (data) setReferrer(data);
    })();
  }, [code]);

  const handleCta = () => {
    navigate(code ? `/signup?ref=${code}` : "/signup");
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Background video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        src={VIDEO_SRC}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.88) 85%, rgba(0,0,0,0.95) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-[2] flex flex-col h-full">
        {/* Wordmark */}
        <div
          className="text-center shrink-0"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
        >
          <span className="text-[14px] font-extrabold tracking-[0.35em] uppercase text-white/50">
            Junto
          </span>
        </div>

        {/* Video breathes */}
        <div className="flex-1" />

        {/* Bottom content */}
        <div
          className="px-6 shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
        >
          {/* Referrer pill */}
          {referrer?.display_name && (
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] text-white/80 backdrop-blur-md mb-4"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <span
                className="flex items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                style={{ width: 22, height: 22, background: "#0D9488" }}
              >
                {referrer.display_name.charAt(0).toUpperCase()}
              </span>
              {referrer.display_name} invited you
            </div>
          )}

          {/* Headline */}
          <h1
            className="text-white font-bold"
            style={{ fontSize: 36, lineHeight: 1.05, letterSpacing: "-0.02em" }}
          >
            Plan trips
            <br />
            together.
          </h1>

          {/* Subline */}
          <p className="mt-2" style={{ fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.5)" }}>
            One shared space for itineraries, expenses & group decisions.
          </p>

          {/* Feature pills */}
          <div className="flex items-center gap-2 mt-5">
            {USPS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 backdrop-blur-md"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <Icon className="h-3.5 w-3.5 text-[#5eead4]" />
                <span className="text-[12px] font-medium text-white/75">{label}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={handleCta}
            className="w-full mt-6 text-white font-semibold rounded-2xl active:scale-[0.97] transition-transform"
            style={{
              height: 52,
              fontSize: 16,
              background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
              boxShadow: "0 4px 24px rgba(13,148,136,0.35)",
            }}
          >
            Get started — it's free
          </button>

          {/* Login */}
          <p className="text-center mt-3.5 text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="underline underline-offset-2"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

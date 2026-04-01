import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

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
      {/* LAYER 1 — Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
        src="https://videos.pexels.com/video-files/4010511/4010511-hd_1920_1080_25fps.mp4"
      />

      {/* LAYER 2 — Gradient overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* LAYER 3 — Content */}
      <div className="relative z-[2] flex flex-col justify-between h-full">
        {/* TOP — Wordmark */}
        <div
          className="text-center"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}
        >
          <span
            className="uppercase font-bold tracking-[0.25em]"
            style={{
              fontSize: 13,
              fontFamily: "Georgia, 'Times New Roman', serif",
              background: "linear-gradient(135deg, #ffffff 0%, #5eead4 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Junto
          </span>
        </div>

        {/* BOTTOM — CTA block */}
        <div
          className="px-6"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
        >
          {/* Referrer pill */}
          {referrer?.display_name && (
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-white backdrop-blur-md"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <span
                className="flex items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{
                  width: 28,
                  height: 28,
                  background: "#0D9488",
                }}
              >
                {referrer.display_name.charAt(0).toUpperCase()}
              </span>
              <span>{referrer.display_name} invited you to Junto</span>
            </div>
          )}

          {/* Headline */}
          <h1
            className="text-white font-bold mt-3"
            style={{ fontSize: 36, lineHeight: 1.1 }}
          >
            Plan trips together.
          </h1>

          {/* Subtext */}
          <p
            className="mt-3"
            style={{ fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.75)" }}
          >
            Group itineraries, shared expenses,
            <br />
            real-time decisions — all in one place.
          </p>

          {/* CTA */}
          <button
            onClick={handleCta}
            className="w-full mt-8 text-white font-semibold rounded-2xl active:scale-[0.97] transition-transform"
            style={{
              height: 52,
              fontSize: 16,
              background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
            }}
          >
            Get started free
          </button>

          {/* Login link */}
          <p className="text-center mt-4 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="underline"
              style={{ color: "rgba(255,255,255,0.75)" }}
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

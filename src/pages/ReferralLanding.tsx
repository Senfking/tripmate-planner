import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const VIDEOS = [
  "https://videos.pexels.com/video-files/4010511/4010511-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/2169880/2169880-hd_1920_1080_24fps.mp4",
  "https://videos.pexels.com/video-files/1437396/1437396-hd_1920_1080_30fps.mp4",
  "https://videos.pexels.com/video-files/3113851/3113851-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/1093662/1093662-hd_1920_1080_30fps.mp4",
];

function VideoSlideshow() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % VIDEOS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {VIDEOS.map((src, i) => (
        <video
          key={i}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover object-center z-0"
          style={{
            opacity: i === activeIndex ? 1 : 0,
            transition: "opacity 1.5s ease-in-out",
          }}
          src={src}
        />
      ))}
    </>
  );
}

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
      {/* LAYER 1 — Video slideshow */}
      <VideoSlideshow />

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
            className="text-[13px] font-extrabold tracking-[0.3em] uppercase text-white/70"
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

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Receipt, Vote } from "lucide-react";

const VIDEOS = [
  "https://videos.pexels.com/video-files/4010511/4010511-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/2169880/2169880-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/2772930/2772930-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/4227028/4227028-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/5904958/5904958-hd_1920_1080_25fps.mp4",
];

const FEATURES = [
  { icon: MapPin, label: "Plan together" },
  { icon: Receipt, label: "Split costs" },
  { icon: Vote, label: "Decide as one" },
];

function VideoSlideshow({ activeIndex }: { activeIndex: number }) {
  return (
    <>
      {VIDEOS.map((src, i) => (
        <video
          key={src}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
          style={{
            opacity: i === activeIndex ? 1 : 0,
            transition: "opacity 1.5s ease-in-out",
          }}
          src={src}
          onError={(e) => {
            (e.currentTarget as HTMLVideoElement).style.display = "none";
          }}
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
  const [activeIndex, setActiveIndex] = useState(0);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % VIDEOS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCta = () => {
    navigate(code ? `/signup?ref=${code}` : "/signup");
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* LAYER 1 — All 5 videos stacked */}
      <VideoSlideshow activeIndex={activeIndex} />

      {/* LAYER 2 — Gradient overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* LAYER 3 — Content */}
      <div className="relative z-[2] flex flex-col h-full">
        {/* TOP — Wordmark */}
        <div
          className="text-center shrink-0"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
        >
          <span className="text-[18px] font-extrabold tracking-[0.3em] uppercase text-white/70">
            Junto
          </span>
        </div>

        {/* Spacer — lets the video breathe */}
        <div className="flex-1" />

        {/* BOTTOM — Content block */}
        <div
          className="px-6 shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
        >
          {/* Referrer pill */}
          {referrer?.display_name && (
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-white backdrop-blur-md mb-4"
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <span
                className="flex items-center justify-center rounded-full text-[11px] font-bold text-white shrink-0"
                style={{ width: 26, height: 26, background: "#0D9488" }}
              >
                {referrer.display_name.charAt(0).toUpperCase()}
              </span>
              <span>{referrer.display_name} invited you</span>
            </div>
          )}

          {/* Headline */}
          <h1
            className="text-white font-bold"
            style={{ fontSize: 34, lineHeight: 1.08 }}
          >
            Plan trips
            <br />
            together.
          </h1>

          {/* Subline */}
          <p
            className="mt-2.5"
            style={{ fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.6)" }}
          >
            Itineraries, expenses & decisions — one shared space.
          </p>

          {/* Feature pills */}
          <div className="flex items-center gap-2 mt-5 flex-wrap">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 backdrop-blur-md"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <Icon className="h-3.5 w-3.5 text-[#5eead4]" />
                <span className="text-[12px] font-medium text-white/80">{label}</span>
              </div>
            ))}
          </div>

          {/* Scene dots */}
          <div className="flex items-center justify-center gap-1.5 mt-6">
            {VIDEOS.map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all duration-500"
                style={{
                  width: i === activeIndex ? 18 : 5,
                  height: 5,
                  background:
                    i === activeIndex
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(255,255,255,0.3)",
                }}
              />
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={handleCta}
            className="w-full mt-5 text-white font-semibold rounded-2xl active:scale-[0.97] transition-transform"
            style={{
              height: 52,
              fontSize: 16,
              background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
              boxShadow: "0 4px 24px rgba(13,148,136,0.35)",
            }}
          >
            Get started free
          </button>

          {/* Login link */}
          <p className="text-center mt-3.5 text-[13px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="underline underline-offset-2"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

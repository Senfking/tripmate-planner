import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Receipt, Vote, Calendar, Sparkles, Globe } from "lucide-react";

/* ── Verified working video sources (diverse scenery) ── */
const VIDEOS = [
  "https://videos.pexels.com/video-files/4010511/4010511-hd_1920_1080_25fps.mp4",   // Beach resort aerial
  "https://videos.pexels.com/video-files/3571264/3571264-hd_1920_1080_30fps.mp4",   // Ocean waves drone
  "https://videos.pexels.com/video-files/3015488/3015488-hd_1920_1080_24fps.mp4",   // Mountain landscape
  "https://videos.pexels.com/video-files/1093662/1093662-hd_1920_1080_30fps.mp4",   // City skyline
  "https://videos.pexels.com/video-files/2519660/2519660-hd_1920_1080_24fps.mp4",   // Tropical nature
];

const FEATURES = [
  { icon: MapPin, text: "Itineraries" },
  { icon: Receipt, text: "Expense splitting" },
  { icon: Vote, text: "Group polls" },
  { icon: Sparkles, text: "AI scanning" },
  { icon: Calendar, text: "Schedules" },
  { icon: Globe, text: "Multi-currency" },
];

/* ── Video slideshow — all stacked, opacity crossfade ── */
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
          className="absolute inset-0 w-full h-full object-cover"
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
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleCta = () => {
    navigate(code ? `/signup?ref=${code}` : "/signup");
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* All 5 videos stacked */}
      <VideoSlideshow activeIndex={activeIndex} />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.85) 78%, rgba(0,0,0,0.96) 100%)",
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

        {/* Let the video breathe */}
        <div className="flex-1" />

        {/* Bottom content */}
        <div
          className="px-6 shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
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
            style={{ fontSize: 34, lineHeight: 1.08, letterSpacing: "-0.02em" }}
          >
            Plan trips
            <br />
            together.
          </h1>

          {/* Subline */}
          <p
            className="mt-2"
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.75)",
              textShadow: "0 1px 8px rgba(0,0,0,0.5)",
            }}
          >
            Ditch the group chat chaos. Plan, split & decide — all in one place.
          </p>

          {/* Feature pills — 3x2 grid */}
          <div className="grid grid-cols-3 gap-1.5 mt-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-1 rounded-full px-2 py-1 backdrop-blur-sm"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Icon className="h-3 w-3 text-[#5eead4] shrink-0" />
                <span className="text-[10px] font-medium text-white/55 truncate">{text}</span>
              </div>
            ))}
          </div>

          {/* Scene dots */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {VIDEOS.map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all duration-500"
                style={{
                  width: i === activeIndex ? 16 : 4,
                  height: 4,
                  background:
                    i === activeIndex ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)",
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
            Get started — it's free
          </button>

          {/* Login */}
          <p className="text-center mt-3 text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
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

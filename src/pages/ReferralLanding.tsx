import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";


/* ── Verified working video sources (diverse scenery) ── */
const VIDEOS = [
  "https://videos.pexels.com/video-files/4010511/4010511-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/3571264/3571264-hd_1920_1080_30fps.mp4",
  "https://videos.pexels.com/video-files/3015488/3015488-hd_1920_1080_24fps.mp4",
  "https://videos.pexels.com/video-files/1093662/1093662-hd_1920_1080_30fps.mp4",
  "https://videos.pexels.com/video-files/2519660/2519660-hd_1920_1080_24fps.mp4",
];

const STATEMENTS = [
  { problem: "Planning a group trip is chaos.", solution: "One shared space for the whole trip — itinerary, decisions, everything." },
  { problem: "Splitting costs always gets awkward.", solution: "Log expenses, scan receipts with AI, and settle up in any currency." },
  { problem: "Group chats, spreadsheets, random screenshots.", solution: "No more digging through 200 messages. Flights, hotels, visas — all in one place." },
  { problem: "Making decisions in a group is painful.", solution: "Vote on options, lock in the plan, and actually move forward." },
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
  const [statementIndex, setStatementIndex] = useState(0);
  const [statementVisible, setStatementVisible] = useState(true);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setStatementVisible(false);
      setTimeout(() => {
        setStatementIndex((i) => (i + 1) % STATEMENTS.length);
        setStatementVisible(true);
      }, 400);
    }, 4500);
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
        {/* Wordmark with gradient backing */}
        <div
          className="text-center shrink-0 relative z-[1]"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)",
            paddingBottom: 24,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0) 100%)",
          }}
        >
          <span className="text-[19px] font-extrabold tracking-[0.32em] uppercase text-white/80">
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

          {/* Rotating statement panel */}
          <div
            className="mt-5 flex flex-col justify-center backdrop-blur-xl"
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: "20px 20px",
              minHeight: 100,
            }}
          >
            <div style={{ opacity: statementVisible ? 1 : 0, transition: "opacity 0.4s ease-in-out" }}>
              <p className="text-white font-bold" style={{ fontSize: 16, lineHeight: 1.3 }}>
                {STATEMENTS[statementIndex].problem}
              </p>
              <p className="mt-2 font-medium" style={{ fontSize: 14, color: "#0D9488" }}>
                {STATEMENTS[statementIndex].solution}
              </p>
            </div>
          </div>

          {/* Statement dots */}
          <div className="flex items-center justify-center mt-3" style={{ gap: 6 }}>
            {STATEMENTS.map((_, i) => (
              <span
                key={i}
                className="transition-all duration-300"
                style={{
                  width: i === statementIndex ? 20 : 4,
                  height: 4,
                  borderRadius: i === statementIndex ? 2 : "50%",
                  background: i === statementIndex ? "white" : "rgba(255,255,255,0.3)",
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

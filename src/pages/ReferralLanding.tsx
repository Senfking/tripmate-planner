import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  MapPin,
  Receipt,
  Vote,
  Calendar,
  Globe,
  Users,
  FileText,
  Share2,
} from "lucide-react";

/* ── Video sources ─────────────────────────────── */
const VIDEOS = [
  "https://videos.pexels.com/video-files/4010511/4010511-hd_1920_1080_25fps.mp4",   // Maldives aerial
  "https://videos.pexels.com/video-files/2169880/2169880-hd_1920_1080_25fps.mp4",   // Indonesia coast
  "https://videos.pexels.com/video-files/2772930/2772930-hd_1920_1080_25fps.mp4",   // Brazil coastline
  "https://videos.pexels.com/video-files/4227028/4227028-hd_1920_1080_25fps.mp4",   // Turquoise beach
  "https://videos.pexels.com/video-files/5904958/5904958-hd_1920_1080_25fps.mp4",   // Tropical village
];

/* ── USP data ──────────────────────────────────── */
const USPS = [
  { icon: MapPin, title: "Collaborative itineraries", desc: "Build day-by-day plans together in real time" },
  { icon: Receipt, title: "Expense splitting", desc: "Multi-currency tracking with smart settlements" },
  { icon: Vote, title: "Group decisions", desc: "Polls & votes so everyone has a say" },
  { icon: Calendar, title: "Shared schedule", desc: "Attendance tracking for every activity" },
  { icon: Globe, title: "Multi-currency", desc: "Automatic exchange rates, settle in any currency" },
  { icon: FileText, title: "Bookings hub", desc: "Attach confirmations, links & documents" },
  { icon: Users, title: "Trip roles", desc: "Admins, editors & viewers — control who does what" },
  { icon: Share2, title: "Instant sharing", desc: "Invite anyone with a link or trip code" },
];

/* ── Video slideshow ───────────────────────────── */
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

/* ── Main component ────────────────────────────── */
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
            "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.0) 25%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.92) 80%, rgba(0,0,0,0.97) 100%)",
        }}
      />

      {/* LAYER 3 — Content */}
      <div className="relative z-[2] flex flex-col h-full overflow-y-auto">
        {/* ─── TOP — Wordmark ─── */}
        <div
          className="text-center shrink-0"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
        >
          <span className="text-[15px] font-extrabold tracking-[0.35em] uppercase text-white/60">
            Junto
          </span>
        </div>

        {/* ─── Spacer — video breathes ─── */}
        <div className="flex-1 min-h-[120px]" />

        {/* ─── BOTTOM — Content ─── */}
        <div
          className="px-6 shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          {/* Referrer pill */}
          {referrer?.display_name && (
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] text-white backdrop-blur-md mb-3"
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
              <span className="text-white/80">{referrer.display_name} invited you</span>
            </div>
          )}

          {/* Headline */}
          <h1
            className="text-white font-bold"
            style={{ fontSize: 36, lineHeight: 1.05, letterSpacing: "-0.02em" }}
          >
            Plan trips{"\u2002"}
            <br />
            together.
          </h1>

          {/* Subline */}
          <p className="mt-2" style={{ fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.55)" }}>
            One shared space for itineraries, expenses & group decisions.
          </p>

          {/* ─── USP grid ─── */}
          <div className="grid grid-cols-2 gap-2 mt-5">
            {USPS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-xl px-3 py-2.5 backdrop-blur-md"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Icon className="h-4 w-4 text-[#5eead4] mb-1.5" />
                <p className="text-[12px] font-semibold text-white/90 leading-tight">{title}</p>
                <p className="text-[11px] text-white/40 leading-snug mt-0.5">{desc}</p>
              </div>
            ))}
          </div>

          {/* Scene dots */}
          <div className="flex items-center justify-center gap-1.5 mt-5">
            {VIDEOS.map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all duration-500"
                style={{
                  width: i === activeIndex ? 18 : 5,
                  height: 5,
                  background:
                    i === activeIndex ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)",
                }}
              />
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={handleCta}
            className="w-full mt-4 text-white font-semibold rounded-2xl active:scale-[0.97] transition-transform"
            style={{
              height: 52,
              fontSize: 16,
              background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
              boxShadow: "0 4px 24px rgba(13,148,136,0.35)",
            }}
          >
            Get started — it's free
          </button>

          {/* Login link */}
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

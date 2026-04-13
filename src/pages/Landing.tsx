import { useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { RotatingPlaceholder } from "@/components/landing/RotatingPlaceholder";
import { ShimmerButton } from "@/components/landing/ShimmerButton";
import { PlanPreviewMockup } from "@/components/landing/PlanPreviewMockup";
import { TripCarousels } from "@/components/landing/TripCarousel";
import { FeatureCards } from "@/components/landing/FeatureCards";
import { useState } from "react";

/* Scroll-reveal */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("landing-visible"); io.unobserve(el); } },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = "", delay = "" }: { children: React.ReactNode; className?: string; delay?: string }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`landing-reveal ${className}`} style={delay ? { transitionDelay: delay } : undefined}>
      {children}
    </div>
  );
}

const HOW_STEPS = [
  { num: 1, title: "Tell Junto your vibe", desc: "Where, when, how adventurous" },
  { num: 2, title: "Loop in your group", desc: "Everyone votes and customizes the plan" },
  { num: 3, title: "Just travel", desc: "Expenses tracked, concierge on demand, zero drama" },
];

function Header() {
  return (
    <div
      className="fixed top-0 inset-x-0 z-50 grid grid-cols-3 items-center px-5 sm:px-10 lg:px-16"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)",
        paddingBottom: 24,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0) 100%)",
      }}
    >
      <div />
      <span className="text-[19px] font-extrabold tracking-[0.32em] uppercase text-white/80 text-center">
        Junto
      </span>
      <div className="flex items-center justify-end gap-3">
        <Link to="/login" className="text-[14px] font-medium text-white/75 hover:text-white transition-colors">
          Log in
        </Link>
        <Link
          to="/signup"
          className="rounded-full bg-white/15 backdrop-blur-md border border-white/20 px-4 py-1.5 text-[14px] font-semibold text-white hover:bg-white/25 transition-colors"
        >
          Get started
        </Link>
      </div>
    </div>
  );
}

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (!loading && user) navigate("/app/trips", { replace: true });
  }, [loading, user, navigate]);

  const openBuilder = useCallback(() => {
    navigate("/ref");
  }, [navigate]);

  if (loading || user) return null;

  return (
    <div className="bg-[#fafaf9] text-[#1a1a1a] min-h-screen overflow-x-hidden">
      <Header />

      {/* ─── HERO ─── */}
      <section className="relative h-dvh flex flex-col justify-start overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format&fit=crop"
          alt="Tropical beach destination"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 via-40% to-black/80" />

        <div className="relative z-10 mx-auto max-w-3xl w-full px-5 pt-[18vh] sm:pt-[20vh] text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium text-white/90 backdrop-blur-md mb-6"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <Sparkles className="h-3.5 w-3.5 text-[#2dd4bf]" />
            AI-powered group travel
          </div>

          <h1 className="text-[2.2rem] sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight">
            Stop being your group's<br />travel agent
          </h1>

          <p className="mt-4 text-[1rem] sm:text-lg text-white/70 max-w-xl mx-auto leading-relaxed">
            You plan everything. They show up. Sound familiar? Junto gives your whole group one place to plan, decide, and travel together.
          </p>

          {/* Search module */}
          <div className="mt-8 rounded-[1.75rem] p-5 sm:p-6 text-left backdrop-blur-xl mx-auto max-w-lg shadow-[0_8px_60px_-20px_rgba(0,0,0,0.25)]"
            style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(24px) saturate(1.4)" }}>
            <div className="flex items-center gap-2.5 bg-white/95 rounded-2xl px-5 py-3.5 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.1)]">
              <Search className="h-[18px] w-[18px] text-gray-400 shrink-0" />
              <RotatingPlaceholder
                value={searchValue}
                onChange={setSearchValue}
                onKeyDown={(e) => { if (e.key === "Enter") openBuilder(); }}
              />
            </div>

            <ShimmerButton onClick={openBuilder} className="w-full mt-4 rounded-2xl py-3.5 text-[15px]">
              Plan with Junto AI
            </ShimmerButton>
          </div>
        </div>
      </section>

      {/* ─── PLAN PREVIEW ─── */}
      <section className="py-20 sm:py-28 px-5">
        <Reveal>
          <PlanPreviewMockup onCTA={openBuilder} />
        </Reveal>
      </section>

      {/* ─── TRIP CAROUSELS ─── */}
      <section className="py-20 sm:py-28">
        <Reveal>
          <TripCarousels />
        </Reveal>
      </section>

      {/* ─── FEATURE CARDS ─── */}
      <FeatureCards />

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-20 sm:py-28 px-5">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-2xl sm:text-4xl font-bold text-[#1a1a1a] mb-12">How it works</h2>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-8 sm:gap-6">
            {HOW_STEPS.map((s, i) => (
              <Reveal key={s.num} delay={`${i * 0.1}s`}>
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4"
                    style={{ background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)" }}>
                    {s.num}
                  </div>
                  <h3 className="font-semibold text-[#1a1a1a] text-[16px] mb-1">{s.title}</h3>
                  <p className="text-sm text-[#9ca3af]">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BOTTOM CTA ─── */}
      <section className="py-20 sm:py-28 px-5">
        <div className="mx-auto max-w-md text-center">
          <Reveal>
            <h2 className="text-2xl sm:text-4xl font-bold text-[#1a1a1a] mb-3">Your next trip starts here</h2>
            <p className="text-[15px] text-[#9ca3af] mb-10">Plan smarter. Travel better. No spreadsheets required.</p>
            <ShimmerButton onClick={openBuilder} className="w-full sm:w-auto sm:px-14 mx-auto rounded-2xl py-4 text-[16px]">
              Start planning
            </ShimmerButton>
          </Reveal>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="py-8 px-5 border-t border-[#e5e5e5]">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#9ca3af]">
          <span className="font-bold tracking-[0.2em] uppercase text-[#1a1a1a] text-xs">Junto</span>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="hover:text-[#1a1a1a] transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-[#1a1a1a] transition-colors">Terms</Link>
          </div>
          <span className="text-xs">&copy; {new Date().getFullYear()} Junto</span>
        </div>
      </footer>
    </div>
  );
}

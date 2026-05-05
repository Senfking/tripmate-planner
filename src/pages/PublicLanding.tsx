import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import { stashPendingPrompt } from "@/components/hero/usePendingPrompt";
import { FeatureAIBuilder } from "@/components/landing/FeatureAIBuilder";
import { FeatureTripDashboard } from "@/components/landing/FeatureTripDashboard";
import { TripCarousels } from "@/components/landing/TripCarousel";
import { ShimmerButton } from "@/components/landing/ShimmerButton";
import { AnonTripGenerator } from "@/components/trip-builder/AnonTripGenerator";
import { ContextualSignupModal } from "@/components/auth/ContextualSignupModal";
import { isAnonRateLimited, markAnonRateLimited } from "@/lib/anonSession";

// Scroll-reveal hook (ported from /landing-old). Keeps the dark-section
// + carousels feeling premium on first scroll without bringing in extra
// animation libraries.
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("landing-visible");
          io.unobserve(el);
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`landing-reveal ${className}`}>
      {children}
    </div>
  );
}

// Public landing at /. Hero (atmospheric photo) on top, then the dark
// "Get to know Junto" feature/phone-mockup section (FeatureCards), then
// the destination card carousels (TripCarousels), then footer. Sections
// are ported as-is from /landing-old per the brief.
export default function PublicLanding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [anonPrompt, setAnonPrompt] = useState<string | null>(null);
  const [rateLimitOpen, setRateLimitOpen] = useState(false);

  function handleSubmit(prompt: string) {
    if (user) {
      stashPendingPrompt(prompt);
      navigate("/trips/new");
      return;
    }
    // If this visitor has already burned their free preview today, skip
    // the streaming UI entirely — just pop the signup modal over the
    // (blurred) homepage so they never see a black "generating" screen.
    if (isAnonRateLimited()) {
      setRateLimitOpen(true);
      return;
    }
    setAnonPrompt(prompt);
  }

  if (anonPrompt) {
    return (
      <AnonTripGenerator
        prompt={anonPrompt}
        onCancel={() => setAnonPrompt(null)}
        onRateLimited={() => {
          markAnonRateLimited();
          setAnonPrompt(null);
          setRateLimitOpen(true);
        }}
      />
    );
  }

  return (
    <div className="bg-[#fafaf9] text-[#1a1a1a] min-h-dvh overflow-x-hidden">
      <Hero onSubmit={handleSubmit} variant="public" />

      {/* Feature sections (part 1 of 3) */}
      <FeatureAIBuilder />
      <FeatureTripDashboard />

      {/* Destination card carousels (ported). id used by Hero's
          "Browse trip ideas" chip to smooth-scroll here. */}
      <section id="trip-ideas" className="py-20 sm:py-28 scroll-mt-4">
        <Reveal>
          <TripCarousels />
        </Reveal>
      </section>

      {/* Bottom CTA — re-prompt with shimmer button */}
      <section className="pt-6 pb-16 sm:pt-10 sm:pb-24 px-5">
        <div className="mx-auto max-w-xl">
          <Reveal>
            <div
              className="relative overflow-hidden rounded-3xl px-6 py-12 sm:px-10 sm:py-16 text-center shadow-[0_20px_60px_-30px_rgba(13,148,136,0.5)] border border-[#0D9488]/15"
              style={{
                background:
                  "radial-gradient(120% 120% at 50% 0%, rgba(45,212,191,0.18) 0%, rgba(13,148,136,0.06) 45%, rgba(255,255,255,0) 75%), linear-gradient(180deg, #ffffff 0%, #f5fbfa 100%)",
              }}
            >
              {/* Soft glow blob */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl opacity-60"
                style={{ background: "radial-gradient(circle, #2dd4bf 0%, transparent 70%)" }}
              />
              <h2 className="relative text-3xl sm:text-4xl font-bold text-[#1a1a1a] mb-3 leading-tight tracking-tight">
                Your{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(90deg, #0D9488 0%, #2dd4bf 60%, #0D9488 100%)" }}
                >
                  next trip
                </span>
                {" "}starts here
              </h2>
              <p className="relative text-[15px] text-[#6b7280] mb-8 max-w-sm mx-auto">
                Plan smarter. Travel better. No spreadsheets required.
              </p>
              <ShimmerButton
                onClick={() => navigate(user ? "/trips/new" : "/ref")}
                className="relative w-full sm:w-auto sm:px-14 mx-auto rounded-2xl py-4 text-[16px]"
              >
                Start planning
              </ShimmerButton>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer (ported) */}
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

      {/* Rate-limit signup modal — overlay (Dialog/Drawer) provides a
          backdrop blur so the homepage stays visible behind the modal. */}
      <ContextualSignupModal
        open={rateLimitOpen}
        onOpenChange={setRateLimitOpen}
        trigger="rate_limit"
        fallbackRedirect="/trips/new"
      />
    </div>
  );
}

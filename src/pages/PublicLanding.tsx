import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import { stashPendingPrompt } from "@/components/hero/usePendingPrompt";
import { FeatureCards } from "@/components/landing/FeatureCards";
import { TripCarousels } from "@/components/landing/TripCarousel";

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

  function handleSubmit(prompt: string) {
    stashPendingPrompt(prompt);
    navigate(user ? "/trips/new" : "/ref");
  }

  return (
    <div className="bg-[#fafaf9] text-[#1a1a1a] min-h-dvh overflow-x-hidden">
      <Hero onSubmit={handleSubmit} variant="public" />

      {/* Dark phone-mockup feature section (ported) */}
      <FeatureCards />

      {/* Destination card carousels (ported) */}
      <section className="py-20 sm:py-28">
        <Reveal>
          <TripCarousels />
        </Reveal>
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
    </div>
  );
}

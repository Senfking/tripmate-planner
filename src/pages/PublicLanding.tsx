import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import { stashPendingPrompt } from "@/components/hero/usePendingPrompt";
import { FeatureAIBuilder } from "@/components/landing/FeatureAIBuilder";
import { FeatureTripDashboard } from "@/components/landing/FeatureTripDashboard";
import { FeaturePhoneSection } from "@/components/landing/FeaturePhoneSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FinalCTA } from "@/components/landing/FinalCTA";
import mockupExpenses from "@/assets/mockup-expenses.png";
import mockupBookings from "@/assets/mockup-bookings.png";
import mockupTrips from "@/assets/mockup-trips-page.png";
import { TripCarousels } from "@/components/landing/TripCarousel";
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
      <FeaturePhoneSection
        eyebrow="Expenses"
        headline="Money sorts itself."
        body="Add a receipt, Junto splits it. Multiple currencies, custom shares, live balances. No end-of-trip spreadsheet."
        image={mockupExpenses}
        alt="Junto expenses screen on iPhone showing €255 owed, balances and a list of split expenses"
        imageSide="left"
      />
      <FeaturePhoneSection
        eyebrow="Bookings"
        headline="Bookings and entry requirements, in one place."
        body="Drag in hotel confirmations, flight tickets, visa requirements. Junto keeps them organized, surfaces what needs attention, and reminds the group what to bring."
        image={mockupBookings}
        alt="Junto bookings & docs screen on iPhone showing flight tickets, hotel confirmation and entry document warnings"
        imageSide="right"
      />

      <FeaturePhoneSection
        eyebrow="All your trips"
        headline="Your travel home."
        body="Past trips, current ones, upcoming, drafts. Every trip you've planned with your groups stays in one place, easy to revisit and easy to plan the next one from."
        image={mockupTrips}
        alt="Junto trips home screen on iPhone showing a 'Good evening, Oliver' header, a live Bali trip card, and an upcoming Dubai trip"
        imageSide="left"
      />

      <HowItWorks />

      {/* Destination card carousels — curated slice. id used by Hero's
          "Browse trip ideas" chip to smooth-scroll here. */}
      <section id="trip-ideas" className="py-20 sm:py-28 scroll-mt-4 bg-[#FAFAF9]">
        <Reveal>
          <TripCarousels limit={4} showSeeAllFooter />
        </Reveal>
      </section>

      {/* Final dark teal CTA */}
      <Reveal>
        <FinalCTA
          onPrimary={() => navigate(user ? "/trips/new" : "/ref")}
          onBrowse={() => {
            const el = document.getElementById("trip-ideas");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
        />
      </Reveal>
      {/* Footer (ported) */}
      <footer className="py-10 px-5 border-t border-[#e5e5e5]">
        <div className="mx-auto max-w-5xl grid grid-cols-3 items-center gap-4 text-sm text-[#9ca3af]">
          <span className="text-xs justify-self-start">&copy; {new Date().getFullYear()} Junto</span>
          <span className="font-extrabold tracking-[0.32em] uppercase text-[#1a1a1a] text-base justify-self-center">
            Junto
          </span>
          <div className="flex items-center gap-6 justify-self-end">
            <Link to="/privacy" className="hover:text-[#1a1a1a] transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-[#1a1a1a] transition-colors">Terms</Link>
          </div>
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

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import {
  consumePendingPrompt,
  stashPendingPrompt,
} from "@/components/hero/usePendingPrompt";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";
import { BlankTripModal } from "@/components/trip-builder/BlankTripModal";
import {
  TripCreationSurface,
  StandaloneInfoCards,
} from "@/components/trip-builder/TripCreationSurface";
import { TripCarousels } from "@/components/landing/TripCarousel";

/**
 * /trips/new — single trip-creation entry point.
 *
 * Logged-in: hero-first TripCreationSurface (free-text pill + two text
 *   CTAs). Step-by-step opens StandaloneTripBuilder modal; skip-itinerary
 *   opens BlankTripModal. Sample trips carousel below.
 *
 * Anonymous: full-bleed atmospheric Hero — prompt is stashed and the
 *   visitor is routed to /ref to sign up.
 */
export default function PublicTripBuilder() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pending, setPending] = useState<string | undefined>(() => {
    return consumePendingPrompt() ?? undefined;
  });
  const [builderOpen, setBuilderOpen] = useState(false);
  const [blankOpen, setBlankOpen] = useState(false);

  useEffect(() => {
    if (user && !pending) {
      const v = consumePendingPrompt();
      if (v) {
        setPending(v);
        setBuilderOpen(true);
      }
    } else if (user && pending && !builderOpen) {
      setBuilderOpen(true);
    }
  }, [user, pending, builderOpen]);

  function handlePublicHeroSubmit(prompt: string) {
    stashPendingPrompt(prompt);
    navigate("/ref");
  }

  function handleFreeTextSubmit(prompt: string) {
    setPending(prompt);
    setBuilderOpen(true);
  }

  function handleStepByStep() {
    setPending(undefined);
    setBuilderOpen(true);
  }

  function handleBuilderClose() {
    setBuilderOpen(false);
  }

  // Anonymous visitors get the original public Hero.
  if (!user) {
    return (
      <div className="min-h-dvh bg-background">
        <Hero
          onSubmit={handlePublicHeroSubmit}
          prefill={pending}
          variant="public"
        />
      </div>
    );
  }

  // Logged-in: hero-first TripCreationSurface.
  return (
    <div className="min-h-dvh bg-gray-50">
      <TripCreationSurface
        headline={
          <>
            Plan your next trip,
            <br />
            <span className="text-[#0D9488]">Junto AI does the heavy lifting</span>
          </>
        }
        subtitle="Describe what you have in mind — destination, dates, who's coming. Junto AI builds an itinerary in seconds."
        placeholder="Describe your trip — destination, dates, who's coming"
        ctaLabel="Plan with Junto AI"
        onFreeTextSubmit={handleFreeTextSubmit}
        onStepByStep={handleStepByStep}
        onSkipItinerary={() => setBlankOpen(true)}
        belowHero={<StandaloneInfoCards />}
      />

      <section className="w-full pb-12 pt-2">
        <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">
          <div className="border-t border-gray-200/70 pt-6 mb-6">
            <p className="text-sm text-muted-foreground text-center">
              Or browse a sample trip
            </p>
          </div>
        </div>
        <TripCarousels showHeader={false} />
      </section>

      {builderOpen && (
        <StandaloneTripBuilder
          onClose={handleBuilderClose}
          initialFreeTextPrompt={pending}
        />
      )}

      <BlankTripModal open={blankOpen} onOpenChange={setBlankOpen} />
    </div>
  );
}

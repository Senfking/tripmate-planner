import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import {
  consumePendingPrompt,
  stashPendingPrompt,
} from "@/components/hero/usePendingPrompt";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";
import {
  PremiumTripInput,
  type PremiumInputData,
} from "@/components/trip-builder/PremiumTripInput";
import { BlankTripModal } from "@/components/trip-builder/BlankTripModal";
import { TripCarousels } from "@/components/landing/TripCarousel";

/**
 * /trips/new — single trip-creation entry point.
 *
 * Logged-in:
 *   1. Hero (variant="app") with the prompt pill at the top.
 *   2. The full canonical step-by-step form (PremiumTripInput) inline
 *      below — same form used in the template "Personalize" modal.
 *   3. Sample trips carousel below.
 *   Submitting either the Hero pill OR the inline form opens
 *   StandaloneTripBuilder, which owns the confirmation + generation flow.
 *
 * Anonymous: full-bleed atmospheric Hero, prompt is stashed and the
 * visitor is routed to /ref to sign up.
 */
export default function PublicTripBuilder() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pending, setPending] = useState<string | undefined>(() => {
    return consumePendingPrompt() ?? undefined;
  });
  const [builderOpen, setBuilderOpen] = useState(false);
  const [inlineSubmission, setInlineSubmission] =
    useState<PremiumInputData | null>(null);
  const [blankOpen, setBlankOpen] = useState(false);

  // If the user signs in mid-session and there's a stashed prompt, open
  // the builder with it.
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

  function handleHeroSubmit(prompt: string) {
    if (user) {
      setPending(prompt);
      setInlineSubmission(null);
      setBuilderOpen(true);
    } else {
      stashPendingPrompt(prompt);
      navigate("/ref");
    }
  }

  function handleInlineGenerate(data: PremiumInputData) {
    setPending(undefined);
    setInlineSubmission(data);
    setBuilderOpen(true);
  }

  function handleBuilderClose() {
    setBuilderOpen(false);
    setInlineSubmission(null);
  }

  return (
    <div className={user ? "min-h-dvh bg-gray-50" : "min-h-dvh bg-background"}>
      <Hero
        onSubmit={handleHeroSubmit}
        prefill={pending}
        variant={user ? "app" : "public"}
      />

      {/* Logged-in users get the canonical step-by-step form inline below
          the Hero. Same component used inside the template "Personalize"
          modal — single source of truth for trip-creation inputs. */}
      {user && (
        <section className="w-full pt-6 pb-4">
          <PremiumTripInput
            onGenerate={handleInlineGenerate}
            onStartBlank={() => setBlankOpen(true)}
            hideHero
          />
        </section>
      )}

      {/* Sample trips browse — full TripCarousels reuse from landing page. */}
      {user && (
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
      )}

      {builderOpen && user && (
        <StandaloneTripBuilder
          onClose={handleBuilderClose}
          initialFreeTextPrompt={pending}
          initialInputData={inlineSubmission ?? undefined}
        />
      )}

      <BlankTripModal open={blankOpen} onOpenChange={setBlankOpen} />
    </div>
  );
}

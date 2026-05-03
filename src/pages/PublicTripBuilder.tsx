import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import {
  consumePendingPrompt,
  stashPendingPrompt,
} from "@/components/hero/usePendingPrompt";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";
import { TripCarousels } from "@/components/landing/TripCarousel";

/**
 * /trips/new — single trip-creation entry point.
 *
 * - Anonymous: full-bleed atmospheric Hero (variant="public"). Submitting
 *   the prompt stashes it and routes to /ref so the user can sign up.
 * - Authenticated: clean in-app Hero (variant="app"). Submitting opens
 *   StandaloneTripBuilder with the prompt prefilled in the free-text
 *   field, where the user can refine and Generate.
 *
 * No inline step-by-step form, no "skip the itinerary" path here —
 * StandaloneTripBuilder owns the whole input experience once opened.
 * Templates have their own sticky CTA that opens the same builder
 * with destination locked + defaults applied.
 */
export default function PublicTripBuilder() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pending, setPending] = useState<string | undefined>(() => {
    return consumePendingPrompt() ?? undefined;
  });
  const [builderOpen, setBuilderOpen] = useState(false);

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
      setBuilderOpen(true);
    } else {
      stashPendingPrompt(prompt);
      navigate("/ref");
    }
  }

  return (
    <div className={user ? "min-h-dvh bg-gray-50" : "min-h-dvh bg-background"}>
      <Hero
        onSubmit={handleHeroSubmit}
        prefill={pending}
        variant={user ? "app" : "public"}
      />

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
          onClose={() => setBuilderOpen(false)}
          initialFreeTextPrompt={pending}
        />
      )}
    </div>
  );
}

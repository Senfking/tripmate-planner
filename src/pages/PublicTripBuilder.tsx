import { useEffect, useRef, useState } from "react";
// useNavigate not needed at this layer — anon flow handles its own navigation.
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import {
  consumePendingPrompt,
} from "@/components/hero/usePendingPrompt";
import { BlankTripModal } from "@/components/trip-builder/BlankTripModal";
import {
  TripCreationSurface,
  StandaloneInfoCards,
} from "@/components/trip-builder/TripCreationSurface";
import { PremiumTripInput, type PremiumInputData } from "@/components/trip-builder/PremiumTripInput";
import { TripCarousels } from "@/components/landing/TripCarousel";
import { AnonTripGenerator } from "@/components/trip-builder/AnonTripGenerator";
import { AuthTripGenerator } from "@/components/trip-builder/AuthTripGenerator";

/**
 * /trips/new — single trip-creation entry point.
 *
 * Logged-in: hero-first TripCreationSurface (free-text pill + two
 *   side-by-side outline CTAs).
 *
 * Anonymous: full-bleed atmospheric Hero. On submit we DO NOT redirect
 *   to /ref — we stream a free trip via the anon path and route the
 *   visitor to /trips/anon/[id]. Save / regenerate / second-generation
 *   triggers a contextual signup modal, not a /ref redirect.
 */
export default function PublicTripBuilder() {
  // navigate removed; anon flow handles its own routing.
  const { user } = useAuth();

  const [pending, setPending] = useState<string | undefined>(() => {
    return consumePendingPrompt() ?? undefined;
  });
  
  const [blankOpen, setBlankOpen] = useState(false);
  const [stepExpanded, setStepExpanded] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);
  const [authPayload, setAuthPayload] = useState<Record<string, unknown> | null>(null);
  const [anonPrompt, setAnonPrompt] = useState<string | null>(null);
  /** Last free-text prompt the user submitted. Restored to the hero input
   *  when the generator is cancelled (e.g. after an error) so the user can
   *  edit and retry without retyping. */
  const [restorePrompt, setRestorePrompt] = useState<string | undefined>(undefined);
  const formAnchorRef = useRef<HTMLDivElement | null>(null);

  // Cross-nav resume: signed-in user lands here with a stashed prompt
  // (e.g. from /app/trips empty-state Hero) — kick generation immediately.
  useEffect(() => {
    if (!user) return;
    if (authPrompt) return;
    if (pending) {
      setAuthPrompt(pending);
      setRestorePrompt(pending);
      setPending(undefined);
    }
  }, [user, pending, authPrompt]);

  function handlePublicHeroSubmit(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setAnonPrompt(trimmed);
    setRestorePrompt(trimmed);
  }

  function handleFreeTextSubmit(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setAuthPrompt(trimmed);
    setRestorePrompt(trimmed);
  }

  function handleStepByStep() {
    setStepExpanded((v) => {
      const next = !v;
      if (next) {
        window.requestAnimationFrame(() => {
          formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  }

  function handleInlineGenerate(data: PremiumInputData) {
    const payload: Record<string, unknown> = {
      trip_id: null,
      destination: data.destination,
      surprise_me: false,
      start_date: data.dateRange?.from
        ? data.dateRange.from.toISOString().slice(0, 10)
        : null,
      end_date: data.dateRange?.to
        ? data.dateRange.to.toISOString().slice(0, 10)
        : null,
      flexible: false,
      duration_days: null,
      budget_level: data.budgetLevel || "mid-range",
      vibes: data.vibes,
      pace: data.pace || "balanced",
      dietary: [],
      notes: data.dealBreakers || "",
      free_text: data.freeText || "",
      group_size:
        data.travelParty === "solo" ? 1
        : data.travelParty === "couple" ? 2
        : data.travelParty === "group" ? 6
        : data.travelParty === "family" ? 4
        : data.travelParty === "friends" ? 4
        : 1,
      travel_party: data.travelParty,
      kids_ages: data.kidsAges || undefined,
    };
    setAuthPayload(payload);
  }

  function handleGeneratorCancel() {
    setAuthPrompt(null);
    setAuthPayload(null);
  }

  // Anonymous visitors: Hero → in-place anon stream.
  if (!user) {
    if (anonPrompt) {
      return <AnonTripGenerator prompt={anonPrompt} onCancel={() => setAnonPrompt(null)} />;
    }
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

  // Authenticated: free-text or form submission → in-place auth stream.
  if (authPrompt || authPayload) {
    return (
      <AuthTripGenerator
        prompt={authPrompt ?? undefined}
        payload={authPayload ?? undefined}
        onCancel={handleGeneratorCancel}
      />
    );
  }

  // Logged-in: hero-first TripCreationSurface with optional inline form.
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
        stepByStepExpanded={stepExpanded}
        expandedSlot={
          stepExpanded ? (
            <div ref={formAnchorRef} className="py-6 scroll-mt-4">
              <PremiumTripInput
                onGenerate={handleInlineGenerate}
                initialData={undefined}
                hideHero
                hideFreeText
                inline
              />
            </div>
          ) : null
        }
        belowHero={!stepExpanded ? <StandaloneInfoCards /> : undefined}
      />

      {!stepExpanded && (
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

      <BlankTripModal open={blankOpen} onOpenChange={setBlankOpen} />
    </div>
  );
}

import { useCallback, useRef, useState, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useTripTemplate } from "@/hooks/useTripTemplates";
import { stashIntent } from "@/lib/templateIntent";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";
import { BlankTripModal } from "@/components/trip-builder/BlankTripModal";
import { TripCreationSurface, StandaloneInfoCards } from "@/components/trip-builder/TripCreationSurface";
import { PremiumTripInput, type PremiumInputData } from "@/components/trip-builder/PremiumTripInput";
import { TripCarousels } from "@/components/landing/TripCarousel";

function templateToInputData(
  t: {
    destination: string;
    default_vibes: string[];
    default_pace: string;
    default_budget_tier: string;
  },
  freeText = "",
): PremiumInputData {
  return {
    destination: t.destination,
    dateRange: undefined,
    travelParty: null,
    kidsAges: "",
    budgetLevel: (t.default_budget_tier as PremiumInputData["budgetLevel"]) ?? null,
    pace: (t.default_pace as PremiumInputData["pace"]) ?? null,
    vibes: t.default_vibes ?? [],
    dealBreakers: "",
    freeText,
  };
}

/**
 * /templates/:slug/personalize — looks like /trips/new (same hero, same
 * CTAs) but with a full-image template card next to the hero on desktop.
 * Step-by-step expands the form INLINE below the hero (destination
 * locked + vibes pre-selected). Skip-itinerary opens BlankTripModal.
 */
export default function TemplatePersonalize() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { template, isLoading } = useTripTemplate(slug);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [submittedInputData, setSubmittedInputData] = useState<PremiumInputData | null>(null);
  const [submittedFreeText, setSubmittedFreeText] = useState("");
  const [blankOpen, setBlankOpen] = useState(false);
  const [stepExpanded, setStepExpanded] = useState(false);
  const formAnchorRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    if (slug) navigate(`/templates/${slug}`);
    else navigate("/templates");
  }, [navigate, slug]);

  const seedData = useMemo(
    () => (template ? templateToInputData(template, "") : null),
    [template],
  );

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center text-center px-6">
        <div>
          <p className="text-gray-600 mb-4">Template not found</p>
          <Link to="/templates" className="text-primary font-medium hover:underline">
            Browse all templates
          </Link>
        </div>
      </div>
    );
  }

  // Logged-out: stash intent and route to signup.
  function handleAuthGuard(): boolean {
    if (!user) {
      if (slug) stashIntent("personalize", slug);
      navigate("/ref");
      return false;
    }
    return true;
  }

  function handleFreeTextSubmit(prompt: string) {
    if (!handleAuthGuard()) return;
    setSubmittedFreeText(prompt);
    // Hand off to StandaloneTripBuilder with template defaults + free text.
    setSubmittedInputData(seedData ? { ...seedData, freeText: prompt } : null);
    setBuilderOpen(true);
  }

  function handleStepByStep() {
    if (!handleAuthGuard()) return;
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

  function handleSkipItinerary() {
    if (!handleAuthGuard()) return;
    setBlankOpen(true);
  }

  function handleInlineGenerate(data: PremiumInputData) {
    setSubmittedInputData(data);
    setBuilderOpen(true);
  }

  function handleBuilderClose() {
    setBuilderOpen(false);
    setSubmittedInputData(null);
    setSubmittedFreeText("");
  }

  // Full-image template card (replaces the small horizontal banner).
  const templateCard = (
    <div className="relative h-full min-h-[260px] overflow-hidden rounded-2xl bg-gray-900 shadow-sm md:min-h-[420px]">
      {template.cover_image_url ? (
        <img
          src={template.cover_image_url}
          alt={template.destination}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-primary/10" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 text-white">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/80">
          From template
        </p>
        <h3 className="mt-1 text-[26px] sm:text-[32px] font-semibold leading-tight tracking-tight">
          {template.destination}
        </h3>
        <p className="mt-1 text-[13px] text-white/85">
          {template.duration_days} days
          {template.recommended_season ? ` · ${template.recommended_season}` : ""}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Floating dismiss back to template detail */}
      <button
        onClick={close}
        className="fixed top-[calc(env(safe-area-inset-top,0px)+12px)] left-4 z-40 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/95 backdrop-blur-md text-gray-700 border border-gray-200 shadow-sm hover:bg-white transition"
        aria-label="Back to template"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <TripCreationSurface
        templateCard={templateCard}
        headline={
          <>
            Personalize your{" "}
            <span className="text-[#0D9488]">{template.destination}</span> trip
          </>
        }
        subtitle="Tweak the details — we'll handle the rest."
        placeholder="Tell us more — dates, who's coming, anything to avoid…"
        ctaLabel="Generate my trip"
        onFreeTextSubmit={handleFreeTextSubmit}
        onStepByStep={handleStepByStep}
        onSkipItinerary={handleSkipItinerary}
        stepByStepExpanded={stepExpanded}
        expandedSlot={
          stepExpanded && seedData ? (
            <div ref={formAnchorRef} className="py-6 scroll-mt-4">
              <PremiumTripInput
                onGenerate={handleInlineGenerate}
                initialData={seedData}
                lockedDestination
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

      {builderOpen && submittedInputData && (
        <StandaloneTripBuilder
          onClose={handleBuilderClose}
          initialInputData={submittedInputData}
          initialFreeTextPrompt={submittedFreeText || undefined}
          templateContext={{
            slug: template.slug,
            hero_image_url: template.cover_image_url,
            defaults: {
              destination: template.destination,
              duration_days: template.duration_days,
              vibes: template.default_vibes,
              pace: template.default_pace,
              budget_tier: template.default_budget_tier,
            },
          }}
        />
      )}

      <BlankTripModal
        open={blankOpen}
        onOpenChange={setBlankOpen}
        defaultDestination={template.destination}
      />
    </div>
  );
}

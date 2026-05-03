import { useCallback, useState, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useTripTemplate } from "@/hooks/useTripTemplates";
import { stashIntent } from "@/lib/templateIntent";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";
import { BlankTripModal } from "@/components/trip-builder/BlankTripModal";
import { TripCreationSurface } from "@/components/trip-builder/TripCreationSurface";
import type { PremiumInputData } from "@/components/trip-builder/PremiumTripInput";

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
 * /templates/:slug/personalize — context B for the unified
 * TripCreationSurface. Hosts a destination-locked hero + the same two
 * text CTAs as /trips/new. The detailed step-by-step modal is reused
 * (StandaloneTripBuilder); BlankTripModal is reused with destination
 * pre-filled.
 */
export default function TemplatePersonalize() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { template, isLoading } = useTripTemplate(slug);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderFreeText, setBuilderFreeText] = useState("");
  const [blankOpen, setBlankOpen] = useState(false);

  const close = useCallback(() => {
    if (slug) navigate(`/templates/${slug}`);
    else navigate("/templates");
  }, [navigate, slug]);

  const initialData = useMemo(
    () => (template ? templateToInputData(template, builderFreeText) : null),
    [template, builderFreeText],
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
    setBuilderFreeText(prompt);
    setBuilderOpen(true);
  }

  function handleStepByStep() {
    if (!handleAuthGuard()) return;
    setBuilderFreeText("");
    setBuilderOpen(true);
  }

  function handleSkipItinerary() {
    if (!handleAuthGuard()) return;
    setBlankOpen(true);
  }

  const templateCard = (
    <div className="mb-5 rounded-2xl bg-white border border-gray-100 shadow-sm p-3 flex items-center gap-3">
      {template.cover_image_url ? (
        <img
          src={template.cover_image_url}
          alt=""
          className="h-16 w-16 rounded-xl object-cover shrink-0"
        />
      ) : (
        <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0D9488]">
          From template
        </p>
        <p className="text-[15px] font-semibold text-foreground truncate">
          {template.destination}
        </p>
        <p className="text-[12.5px] text-muted-foreground truncate">
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
      />

      {builderOpen && initialData && (
        <StandaloneTripBuilder
          onClose={() => setBuilderOpen(false)}
          initialInputData={initialData}
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
          forceInputFirst
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

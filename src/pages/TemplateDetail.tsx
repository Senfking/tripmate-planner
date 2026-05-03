import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTripTemplate, type CuratedHighlight } from "@/hooks/useTripTemplates";
import { stashIntent } from "@/lib/templateIntent";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";
import type { PremiumInputData } from "@/components/trip-builder/PremiumTripInput";
import { Button } from "@/components/ui/button";

function templateToInputData(t: {
  destination: string;
  default_vibes: string[];
  default_pace: string;
  default_budget_tier: string;
}): PremiumInputData {
  return {
    destination: t.destination,
    dateRange: undefined,
    travelParty: null,
    kidsAges: "",
    budgetLevel: (t.default_budget_tier as PremiumInputData["budgetLevel"]) ?? null,
    pace: (t.default_pace as PremiumInputData["pace"]) ?? null,
    vibes: t.default_vibes ?? [],
    dealBreakers: "",
    freeText: "",
  };
}

export default function TemplateDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { template, isLoading } = useTripTemplate(slug);
  const [searchParams, setSearchParams] = useSearchParams();

  const [cloning, setCloning] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);

  // Auto-open personalize modal when arriving with ?personalize=1 (post-auth
  // intent drain bounces here). We only trigger once the template is loaded.
  useEffect(() => {
    if (template && user && searchParams.get("personalize") === "1") {
      setPersonalizeOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("personalize");
      setSearchParams(next, { replace: true });
    }
  }, [template, user, searchParams, setSearchParams]);

  const handleClone = useCallback(async () => {
    if (!slug) return;
    if (!user) {
      stashIntent("clone", slug);
      navigate("/ref");
      return;
    }
    setCloning(true);
    try {
      const { data, error } = await (supabase as any).rpc("clone_template_to_user_trip", {
        _slug: slug,
      });
      if (error) throw error;
      const tripId = (data as any)?.trip_id ?? data;
      if (!tripId) throw new Error("Clone returned no trip_id");
      toast.success("Trip created — adjust dates anytime in trip settings");
      navigate(`/app/trips/${tripId}`);
    } catch (err: any) {
      console.error("[TemplateDetail] clone failed", err);
      toast.error(err?.message || "Couldn't create your trip. Please try again.");
    } finally {
      setCloning(false);
    }
  }, [slug, user, navigate]);

  const handlePersonalize = useCallback(() => {
    if (!slug) return;
    if (!user) {
      stashIntent("personalize", slug);
      navigate("/ref");
      return;
    }
    setPersonalizeOpen(true);
  }, [slug, user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Template not found</p>
          <Link to="/templates" className="text-primary font-medium hover:underline">
            Browse all templates
          </Link>
        </div>
      </div>
    );
  }

  const pageTitle = `${template?.destination ?? ""} · ${template?.duration_days ?? ""} days`;
  const pageDescription = template?.description ?? "";

  useEffect(() => {
    if (!template) return;
    const prev = document.title;
    document.title = `${pageTitle} | Junto`;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute("content") ?? null;
    if (meta) meta.setAttribute("content", pageDescription);
    return () => {
      document.title = prev;
      if (meta && prevDesc !== null) meta.setAttribute("content", prevDesc);
    };
  }, [template, pageTitle, pageDescription]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Template not found</p>
          <Link to="/templates" className="text-primary font-medium hover:underline">
            Browse all templates
          </Link>
        </div>
      </div>
    );
  }

  // (pageTitle / pageDescription already computed above)

  // Sticky bottom action bar (rendered in both states)
  const StickyActions = (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-2 sm:justify-end">
        <Button
          variant="outline"
          onClick={handlePersonalize}
          className="rounded-full sm:w-auto h-11"
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          Personalize for me
        </Button>
        <Button
          onClick={handleClone}
          disabled={cloning}
          className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground sm:w-auto sm:px-6 h-11"
        >
          {cloning ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Creating trip…
            </>
          ) : (
            "Use this trip"
          )}
        </Button>
      </div>
    </div>
  );

  // STATE 1: cached result exists — render TripResultsView in readOnly + generic mode
  if (template.cached_result) {
    return (
      <>
        {/* Slim back nav */}
        <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate("/templates")}
              className="text-muted-foreground hover:text-foreground transition"
              aria-label="Back to templates"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-muted-foreground truncate">Trip template</span>
          </div>
        </div>

        <div className="pb-32">
          {template.curated_highlights && template.curated_highlights.length > 0 && (
            <CuratedHighlightsSection
              destination={template.destination}
              highlights={template.curated_highlights}
            />
          )}
          <TripResultsView
            tripId={`template-${template.slug}`}
            planId={null}
            result={template.cached_result}
            onClose={() => navigate("/templates")}
            onRegenerate={() => { /* gated in readOnly */ }}
            standalone
            dateMode="generic"
            readOnly
          />
        </div>

        {StickyActions}

        {personalizeOpen && (
          <StandaloneTripBuilder
            onClose={() => setPersonalizeOpen(false)}
            initialInputData={templateToInputData(template)}
            templateContext={{
              slug: template.slug,
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
      </>
    );
  }

  // STATE 2: no cache — structured "proof of substance" preview that mirrors
  // the shape of a real trip page using only honest, derived metadata.
  const vibes = template.default_vibes?.length ? template.default_vibes : ["Highlights"];
  const curatedPlaces = Math.ceil(template.duration_days * 2.5);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const dayTheme = (n: number) => `${cap(vibes[(n - 1) % vibes.length])} day`;

  const ctaLabel = `Build my ${template.destination} itinerary`;

  return (
    <>
      <div className="min-h-screen bg-background pb-32">
        {/* Slim back nav */}
        <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-2.5">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate("/templates")}
              className="text-muted-foreground hover:text-foreground transition"
              aria-label="Back to templates"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-muted-foreground truncate">Trip template</span>
          </div>
        </div>

        {/* Hero banner */}
        <div className="relative h-[280px] md:h-[400px]">
          {template.cover_image_url ? (
            <img
              src={template.cover_image_url}
              alt={template.destination}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 to-primary/10" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-6 left-5 right-5">
            <div className="max-w-3xl mx-auto">
              <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
                {template.destination}
              </h1>
              <p className="mt-2 text-white/85 text-sm md:text-base">
                {template.duration_days} days
                {template.recommended_season ? ` · ${template.recommended_season}` : ""}
              </p>
              {template.chips?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {template.chips.map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center text-[11px] md:text-xs font-medium px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm border border-white/20"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* "What's inside" section */}
        <section className="max-w-3xl mx-auto px-5 py-8">
          <h2 className="text-xl font-semibold text-foreground mb-3">What's inside this trip</h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-6">
            {template.description}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Length</p>
              <p className="text-base font-semibold text-foreground mt-0.5">
                {template.duration_days} days
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Curated places</p>
              <p className="text-base font-semibold text-foreground mt-0.5">
                ~{curatedPlaces} picks
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Format</p>
              <p className="text-base font-semibold text-foreground mt-0.5">Day-by-day plan</p>
            </div>
          </div>
        </section>

        {/* Highlights — curated, Google-Places-backed venues. Falls back to
            the generic day-by-day teaser if the backfill hasn't run yet. */}
        {template.curated_highlights && template.curated_highlights.length > 0 ? (
          <CuratedHighlightsSection
            destination={template.destination}
            highlights={template.curated_highlights}
          />
        ) : (
          <section className="max-w-3xl mx-auto px-5 pb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">Your day-by-day plan</h2>
            <div className="space-y-3">
              {Array.from({ length: template.duration_days }, (_, i) => i + 1).map((n) => (
                <div
                  key={n}
                  className="rounded-2xl border border-border bg-card px-5 py-4"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-foreground">Day {n}</span>
                    <span className="text-base font-medium text-foreground/80">
                      · {dayTheme(n)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Junto AI will pick the best places in {template.destination} for this day
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Sticky bottom action — single CTA on this state */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <div className="max-w-3xl mx-auto flex sm:justify-end">
          <Button
            onClick={handlePersonalize}
            className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto sm:px-6 h-12 text-base font-semibold"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {ctaLabel}
          </Button>
        </div>
      </div>

      {personalizeOpen && (
        <StandaloneTripBuilder
          onClose={() => setPersonalizeOpen(false)}
          initialInputData={templateToInputData(template)}
          templateContext={{
            slug: template.slug,
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
    </>
  );
}

function CuratedHighlightsSection({
  destination,
  highlights,
}: {
  destination: string;
  highlights: CuratedHighlight[];
}) {
  return (
    <section className="max-w-3xl mx-auto px-5 py-8">
      <h2 className="text-xl font-semibold text-foreground mb-1">
        Highlights you'll actually want to do
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Hand-picked spots in {destination}, sourced from Google Places.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {highlights.map((h) => (
          <li
            key={h.place_id}
            className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col"
          >
            <div className="aspect-[16/10] bg-muted overflow-hidden">
              <img
                src={h.photo_url}
                alt={h.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="px-4 py-3 flex-1 flex flex-col gap-1">
              <p className="text-base font-semibold text-foreground leading-tight">{h.name}</p>
              {h.area && (
                <p className="text-xs text-muted-foreground">{h.area}</p>
              )}
              <p className="text-sm text-foreground/80 leading-snug mt-1">{h.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

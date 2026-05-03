import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTripTemplate } from "@/hooks/useTripTemplates";
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

  const [cloning, setCloning] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);

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

  // STATE 2: no cache — minimal SEO hero with single CTA
  return (
    <>
      <Helmet>
        <title>{pageTitle} | Junto</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={`${window.location.origin}/templates/${template.slug}`} />
      </Helmet>

      <div className="min-h-screen bg-background pb-32">
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

        {template.cover_image_url && (
          <div className="relative h-[240px] sm:h-[320px]">
            <img
              src={template.cover_image_url}
              alt={template.destination}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 max-w-3xl mx-auto">
              <h1 className="text-3xl sm:text-4xl font-bold text-white">{pageTitle}</h1>
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto px-5 py-8">
          {!template.cover_image_url && (
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{pageTitle}</h1>
          )}
          <p className="text-base text-muted-foreground leading-relaxed mb-8">
            {template.description}
          </p>

          <Button
            onClick={handlePersonalize}
            className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 px-6"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Build this trip with Junto AI
          </Button>
        </div>
      </div>

      {/* Sticky bar with both options also available here */}
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

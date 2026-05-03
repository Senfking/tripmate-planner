import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  CalendarDays,
  MapPin,
  Wallet,
  Users,
  Clock,
  Globe2,
  Coins,
  CalendarRange,
  FileText,
  PiggyBank,
  CloudSun,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTripTemplate, type CuratedHighlight } from "@/hooks/useTripTemplates";
import { stashIntent } from "@/lib/templateIntent";
import { getCountryFacts } from "@/lib/countryFacts";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";
import type { PremiumInputData } from "@/components/trip-builder/PremiumTripInput";
import { Button } from "@/components/ui/button";
import { HighlightCard } from "@/components/templates/HighlightCard";

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

  const pageTitle = template ? `${template.destination} · ${template.duration_days} days` : "";
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
          <p className="text-gray-600 mb-4">Template not found</p>
          <Link to="/templates" className="text-primary font-medium hover:underline">
            Browse all templates
          </Link>
        </div>
      </div>
    );
  }

  const ctaLabel = `Build my ${template.destination} itinerary`;

  // Sticky bottom action bar (rendered in both states)
  const StickyActions = (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
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

  // Floating back button shared between both states.
  const FloatingBack = (
    <button
      onClick={() => navigate("/templates")}
      className="fixed top-[calc(env(safe-area-inset-top,0px)+12px)] left-4 z-40 inline-flex items-center justify-center h-10 w-10 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 hover:bg-black/55 transition"
      aria-label="Back to templates"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );

  // STATE 1: cached result exists
  if (template.cached_result) {
    return (
      <>
        {FloatingBack}

        <div className="pb-32">
          <QuickFactsStrip
            countryIso={template.country_iso}
            recommendedSeason={template.recommended_season}
          />
          {template.curated_highlights && template.curated_highlights.length > 0 && (
            <HighlightsSection highlights={template.curated_highlights} />
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
          <TravelEssentialsSection />
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

  // STATE 2: no cache — premium destination guide preview
  return (
    <>
      <div className="min-h-screen bg-white pb-32">
        <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 py-2.5">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate("/templates")}
              className="text-gray-600 hover:text-gray-900 transition"
              aria-label="Back to templates"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-gray-600 truncate">Trip template</span>
          </div>
        </div>

        {/* Hero */}
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
          <div className="absolute bottom-6 left-5 right-5">
            <div className="max-w-3xl mx-auto">
              <h1
                className="text-3xl md:text-5xl font-semibold text-white leading-tight"
                style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
              >
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
                      className="inline-flex items-center text-[11px] md:text-xs font-medium px-2.5 py-1 rounded-full bg-white/15 text-white backdrop-blur-md border border-white/20"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <QuickFactsStrip
          countryIso={template.country_iso}
          recommendedSeason={template.recommended_season}
        />

        {/* Description */}
        <section className="max-w-3xl mx-auto px-5 pt-2 pb-6">
          <p className="text-base text-gray-600 leading-relaxed">{template.description}</p>
        </section>

        {/* What you'll get with Junto AI */}
        <JuntoValueGrid />

        {/* Highlights */}
        {template.curated_highlights && template.curated_highlights.length > 0 && (
          <HighlightsSection highlights={template.curated_highlights} />
        )}

        {/* Travel essentials scaffolding */}
        <TravelEssentialsSection />
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
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

/* ───────────────── Sub-sections ───────────────── */

function QuickFactsStrip({
  countryIso,
  recommendedSeason,
}: {
  countryIso: string | null;
  recommendedSeason: string | null;
}) {
  const facts = getCountryFacts(countryIso);
  const items: Array<{ icon: typeof Clock; label: string; value: string }> = [];

  if (recommendedSeason) {
    items.push({ icon: CalendarRange, label: "Best time", value: recommendedSeason });
  }
  if (facts?.currency) {
    items.push({ icon: Coins, label: "Currency", value: facts.currency });
  }
  if (facts?.language) {
    items.push({ icon: Globe2, label: "Language", value: facts.language });
  }
  if (facts?.timezone) {
    items.push({ icon: Clock, label: "Time zone", value: facts.timezone });
  }

  if (items.length === 0) return null;

  return (
    <section className="max-w-3xl mx-auto px-5 pt-6">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none sm:flex-wrap sm:overflow-visible">
        {items.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex items-center gap-2 shrink-0 rounded-full border border-gray-200 bg-white px-3.5 py-2 shadow-sm"
          >
            <Icon className="h-4 w-4 text-primary" />
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
              <p className="text-sm font-medium text-gray-800">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function JuntoValueGrid() {
  const items = [
    {
      icon: CalendarDays,
      title: "Day-by-day itinerary",
      copy: "A full plan timed to your dates and pace.",
    },
    {
      icon: MapPin,
      title: "Curated venues & bookings",
      copy: "Hand-picked stays, food, and activities.",
    },
    {
      icon: Wallet,
      title: "Group expense splitting",
      copy: "Track costs and settle up effortlessly.",
    },
    {
      icon: Users,
      title: "Real-time collaboration",
      copy: "Plan together, vote, and decide as a group.",
    },
  ];
  return (
    <section className="max-w-3xl mx-auto px-5 py-6">
      <h2
        className="text-xl font-semibold text-gray-900 mb-4"
        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
      >
        What you'll get with Junto AI
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map(({ icon: Icon, title, copy }) => (
          <div
            key={title}
            className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 flex flex-col gap-2"
          >
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-semibold text-gray-900 leading-snug">{title}</p>
            <p className="text-xs text-gray-600 leading-snug">{copy}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HighlightsSection({ highlights }: { highlights: CuratedHighlight[] }) {
  return (
    <section className="max-w-3xl mx-auto px-5 py-6">
      <h2
        className="text-xl font-semibold text-gray-900 mb-1"
        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
      >
        Highlights
      </h2>
      <p className="text-sm text-gray-600 mb-5 leading-relaxed">
        A taste of what your itinerary will include. Junto AI builds the full plan around your
        dates, pace, and group.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {highlights.map((h) => (
          <HighlightCard key={h.place_id} highlight={h} />
        ))}
      </div>
    </section>
  );
}

function TravelEssentialsSection() {
  const items = [
    {
      icon: FileText,
      title: "Visa & entry",
      copy: "Personalized entry requirements based on your nationality.",
    },
    {
      icon: PiggyBank,
      title: "Budget guide",
      copy: "Cost breakdown tailored to your travel style and group size.",
    },
    {
      icon: CloudSun,
      title: "Packing & weather",
      copy: "Smart packing list and forecast for your travel window.",
    },
  ];
  return (
    <section className="max-w-3xl mx-auto px-5 py-6">
      <h2
        className="text-xl font-semibold text-gray-900 mb-1"
        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
      >
        Travel essentials
      </h2>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
        Unlocked when you build your trip.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {items.map(({ icon: Icon, title, copy }) => (
          <div
            key={title}
            className="rounded-2xl bg-gray-50 border border-gray-200 p-4 flex flex-col gap-1.5"
          >
            <Icon className="h-4 w-4 text-gray-500" />
            <p className="text-sm font-semibold text-gray-700 leading-snug">{title}</p>
            <p className="text-xs text-gray-500 leading-snug">{copy}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

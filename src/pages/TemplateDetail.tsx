import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  CalendarDays,
  Wallet,
  Vote,
  Clock,
  Globe2,
  Coins,
  CalendarRange,
  FileText,
  PiggyBank,
  CloudSun,
  FileArchive,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTripTemplate } from "@/hooks/useTripTemplates";
import { useSmartBack } from "@/hooks/useSmartBack";
import { stashIntent } from "@/lib/templateIntent";
import { getCountryFacts } from "@/lib/countryFacts";
import { formatTimezone } from "@/lib/timezoneFormat";
import { getDestinationGuide, resolvePhoto, type ThemeCard } from "@/lib/destinationGuides";
import { UnsplashAttribution } from "@/components/templates/UnsplashAttribution";
import { TemplateSEO } from "@/components/seo/TemplateSEO";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import { Button } from "@/components/ui/button";

export default function TemplateDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const goBack = useSmartBack("/templates");
  const { user } = useAuth();
  const { template, isLoading } = useTripTemplate(slug);
  const [searchParams, setSearchParams] = useSearchParams();

  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    if (template && user && slug && searchParams.get("personalize") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("personalize");
      setSearchParams(next, { replace: true });
      navigate(`/templates/${slug}/personalize`, { replace: true });
    }
  }, [template, user, slug, searchParams, setSearchParams, navigate]);

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
    navigate(`/templates/${slug}/personalize`);
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
          <p className="text-gray-600 mb-4">Template not found</p>
          <Link to="/templates" className="text-primary font-medium hover:underline">
            Browse all templates
          </Link>
        </div>
      </div>
    );
  }

  const ctaLabel = `Build my ${template.destination} itinerary`;

  const guide = getDestinationGuide(template.slug, {
    hero: template.cover_image_url,
    tagline: template.description,
    chips: template.chips ?? [],
    countryIso: template.country_iso,
  });
  const heroResolved = resolvePhoto(guide.hero);

  // Floating back button
  const FloatingBack = (
    <button
      onClick={goBack}
      className="fixed top-[calc(env(safe-area-inset-top,0px)+12px)] left-4 z-40 inline-flex items-center justify-center h-10 w-10 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 hover:bg-black/55 transition"
      aria-label="Back to templates"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );

  // Sticky CTA — single primary CTA on the no-cache state, dual on cached
  const StickyCTA = (
    <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      {/* Soft top gradient so the bar visually separates on desktop */}
      <div className="h-8 bg-gradient-to-t from-white/95 to-transparent" />
      <div className="bg-white/95 backdrop-blur-md border-t border-gray-200 px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pointer-events-auto shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.18)]">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-2 sm:justify-center">
          {template.cached_result && (
            <Button
              variant="outline"
              onClick={handlePersonalize}
              className="rounded-full sm:w-auto h-12"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Personalize for me
            </Button>
          )}
          <Button
            onClick={template.cached_result ? handleClone : handlePersonalize}
            disabled={cloning}
            className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto sm:px-8 h-12 text-base font-semibold"
          >
            {cloning ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Creating trip…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {template.cached_result ? "Use this trip" : ctaLabel}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <TemplateSEO
        slug={template.slug}
        destination={template.destination}
        country={template.country}
        durationDays={template.duration_days}
        description={template.description ?? guide.tagline}
        heroImage={heroResolved.url}
        recommendedSeason={template.recommended_season}
        chips={template.chips ?? []}
      />
      {FloatingBack}
      <div className="min-h-screen bg-white pb-36">
        <CinematicHero
          destination={template.destination}
          durationDays={template.duration_days}
          recommendedSeason={template.recommended_season}
          chips={template.chips ?? []}
          heroPhoto={heroResolved.url}
          heroMeta={heroResolved.meta}
        />

        <QuickFactsStrip
          countryIso={template.country_iso}
          recommendedSeason={template.recommended_season}
        />

        {/* Tagline */}
        <section className="max-w-6xl mx-auto px-5 pt-4 pb-2">
          <p className="max-w-3xl text-base md:text-lg text-gray-700 leading-relaxed">
            {guide.tagline}
          </p>
        </section>

        <ThemesSection destination={template.destination} themes={guide.themes} />

        <AboutSection destination={template.destination} longForm={guide.longForm} />

        {/* Cached itinerary preview, when available */}
        {template.cached_result && (
          <TripResultsView
            tripId={`template-${template.slug}`}
            planId={null}
            result={template.cached_result}
            onClose={goBack}
            onRegenerate={() => { /* gated in readOnly */ }}
            standalone
            dateMode="generic"
            readOnly
          />
        )}

        <JuntoFeatureBlocks />
      </div>

      {StickyCTA}
    </>
  );
}

/* ───────────────── Sub-sections ───────────────── */

function CinematicHero({
  destination,
  durationDays,
  recommendedSeason,
  chips,
  heroPhoto,
  heroMeta,
}: {
  destination: string;
  durationDays: number;
  recommendedSeason: string | null;
  chips: string[];
  heroPhoto: string;
  heroMeta: import("@/lib/unsplashAttribution").UnsplashPhotoMeta | null;
}) {
  return (
    <div className="relative w-full h-[60vh] min-h-[420px] md:h-[75vh] md:min-h-[560px] md:max-h-[760px] overflow-hidden">
      <img
        src={heroPhoto}
        alt={`${destination} skyline — ${durationDays}-day itinerary on Junto`}
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/20" />
      <div className="absolute inset-x-0 bottom-0 px-5 pb-10 md:pb-14">
        <div className="max-w-4xl mx-auto">
          <h1
            className="text-white font-semibold leading-[1.05] tracking-tight text-[2.5rem] sm:text-5xl md:text-6xl lg:text-7xl"
            style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
          >
            {destination}
          </h1>
          <p className="mt-3 text-white/90 text-base md:text-lg font-medium">
            {durationDays} days
            {recommendedSeason ? ` · ${recommendedSeason}` : ""}
          </p>
          {chips?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center text-[10px] md:text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/15 text-white/90 backdrop-blur-md border border-white/20"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {heroMeta && (
        <div className="absolute bottom-2 right-3 z-10">
          <UnsplashAttribution photo={heroMeta} variant="light" />
        </div>
      )}
    </div>
  );
}

function QuickFactsStrip({
  countryIso,
  recommendedSeason,
}: {
  countryIso: string | null;
  recommendedSeason: string | null;
}) {
  const facts = getCountryFacts(countryIso);
  const tz = formatTimezone(facts?.timezone);
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
  if (tz) {
    items.push({ icon: Clock, label: "Time zone", value: tz });
  }

  if (items.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-5 pt-5">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none sm:flex-wrap sm:overflow-visible">
        {items.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex items-center gap-2 shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm"
          >
            <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
            <div className="leading-tight">
              <p className="text-[9px] uppercase tracking-wide text-gray-500 font-medium">{label}</p>
              <p className="text-[13px] font-medium text-gray-800">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ThemesSection({
  destination,
  themes,
}: {
  destination: string;
  themes: ThemeCard[];
}) {
  if (!themes || themes.length === 0) return null;
  return (
    <section className="max-w-6xl mx-auto px-5 py-10">
      <div className="max-w-3xl">
        <h2
          className="text-2xl md:text-3xl font-semibold text-gray-900 leading-tight"
          style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
        >
          What's waiting for you in {destination}
        </h2>
        <p className="text-[15px] text-gray-600 mt-2 leading-relaxed">
          Junto AI builds your full itinerary around your dates, your group and the way you like to travel.
        </p>
      </div>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {themes.map((t) => (
          <ThemeCardView key={t.title} theme={t} />
        ))}
      </div>
    </section>
  );
}

function AboutSection({ destination, longForm }: { destination: string; longForm?: string }) {
  const trimmed = longForm?.trim();
  if (!trimmed) return null;
  const paragraphs = trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;
  return (
    <section className="max-w-6xl mx-auto px-5 py-10">
      <h2
        className="text-2xl md:text-3xl font-semibold text-gray-900 leading-tight"
        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
      >
        About {destination}
      </h2>
      <div className="mt-4 space-y-4">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[15px] md:text-base text-gray-700 leading-relaxed">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}

function ThemeCardView({ theme }: { theme: ThemeCard }) {
  const { url, meta } = resolvePhoto(theme.photo);
  return (
    <article className="group relative rounded-2xl overflow-hidden shadow-sm bg-gray-100 h-[340px] md:h-[380px]">
      <img
        src={url}
        alt={`${theme.title} — ${theme.description}`}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <h3
          className="text-white text-xl md:text-[22px] font-semibold leading-tight"
          style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
        >
          {theme.title}
        </h3>
        <p className="mt-2 text-[13.5px] md:text-sm text-white/85 leading-snug">
          {theme.description}
        </p>
      </div>
      {meta && (
        <div className="absolute top-2 right-3 z-10">
          <UnsplashAttribution photo={meta} variant="light" />
        </div>
      )}
    </article>
  );
}

function JuntoFeatureBlocks() {
  const heroBlocks = [
    {
      title: "A day-by-day plan, built around your group",
      copy: "Junto AI maps every day to your pace, dates and the people you're with — with venues, timings and a real route.",
      icon: CalendarDays,
      mockupBg: "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary) / 0.04))",
      visual: <ItineraryMockup />,
    },
    {
      title: "Settle up effortlessly",
      copy: "Track every shared expense and let Junto figure out who owes what. No spreadsheets, no awkward Venmos.",
      icon: Wallet,
      mockupBg: "linear-gradient(135deg, hsl(var(--primary) / 0.16), hsl(var(--primary) / 0.04))",
      visual: <ExpensesMockup />,
    },
    {
      title: "Decide together, in real time",
      copy: "Polls and shared ideas keep the whole group in sync — so the loudest voice doesn't win by default.",
      icon: Vote,
      mockupBg: "linear-gradient(135deg, hsl(var(--primary) / 0.16), hsl(var(--primary) / 0.04))",
      visual: <DecisionsMockup />,
    },
  ];

  const chipFeatures = [
    { icon: FileText, label: "Visa & entry" },
    { icon: PiggyBank, label: "Budget guide" },
    { icon: CloudSun, label: "Packing & weather" },
    { icon: FileArchive, label: "Trip docs & receipts" },
  ];

  return (
    <section className="max-w-6xl mx-auto px-5 py-12">
      <div className="max-w-3xl">
        <h2
          className="text-2xl md:text-3xl font-semibold text-gray-900 leading-tight"
          style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
        >
          One tool for the whole trip
        </h2>
        <p className="text-[15px] text-gray-600 mt-2 leading-relaxed">
          From the first idea to settling up at the end — Junto handles the planning so you don't have to be the group's travel agent.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {heroBlocks.map(({ title, copy, icon: Icon, mockupBg, visual }) => (
          <div
            key={title}
            className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden flex flex-col"
          >
            <div
              className="relative h-44 flex items-center justify-center"
              style={{ background: mockupBg }}
            >
              {visual}
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <h3
                  className="text-[15px] font-semibold text-gray-900 leading-snug"
                  style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
                >
                  {title}
                </h3>
              </div>
              <p className="mt-2 text-sm text-gray-600 leading-snug">{copy}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {chipFeatures.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] text-gray-700 shadow-sm"
          >
            <Icon className="h-3.5 w-3.5 text-primary" />
            {label}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────── Lightweight in-card mockups (no real screenshots) ───────────── */

function ItineraryMockup() {
  return (
    <div className="w-[78%] rounded-xl bg-white shadow-md border border-gray-100 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-900">Day 2 · Tulum</span>
        <span className="text-[9px] text-gray-400">3 stops</span>
      </div>
      {[
        { time: "9:00", t: "Cenote Dos Ojos", w: "w-3/4" },
        { time: "13:00", t: "Lunch at Hartwood", w: "w-2/3" },
        { time: "18:00", t: "Sunset at Papaya Playa", w: "w-1/2" },
      ].map((row) => (
        <div key={row.time} className="flex items-center gap-2">
          <span className="text-[9px] font-medium text-primary w-7 shrink-0">{row.time}</span>
          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full bg-primary/40 ${row.w}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExpensesMockup() {
  const rows = [
    { who: "Sara paid", amt: "€84", you: "+€21" },
    { who: "Marcos paid", amt: "€42", you: "+€10.50" },
    { who: "You paid", amt: "€120", you: "−€90" },
  ];
  return (
    <div className="w-[78%] rounded-xl bg-white shadow-md border border-gray-100 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-900">Group balance</span>
        <span className="text-[10px] font-semibold text-primary">−€58.50</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.who} className="flex items-center justify-between text-[10px]">
            <span className="text-gray-700">{r.who}</span>
            <span className="text-gray-400">{r.amt}</span>
            <span className="font-medium text-gray-900 w-12 text-right">{r.you}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionsMockup() {
  const opts = [
    { name: "Beach club Sunday", pct: 75 },
    { name: "Cenote tour", pct: 50 },
    { name: "Mayan ruins day", pct: 25 },
  ];
  return (
    <div className="w-[78%] rounded-xl bg-white shadow-md border border-gray-100 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-900">Pick a Sunday</span>
        <span className="text-[9px] text-gray-400">4 votes</span>
      </div>
      {opts.map((o) => (
        <div key={o.name}>
          <div className="flex items-center justify-between text-[10px] mb-0.5">
            <span className="text-gray-700">{o.name}</span>
            <span className="text-gray-400">{o.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full bg-primary/50" style={{ width: `${o.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

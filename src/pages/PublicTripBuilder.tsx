import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListChecks, FileText, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import {
  consumePendingPrompt,
  stashPendingPrompt,
} from "@/components/hero/usePendingPrompt";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";
import { BlankTripModal } from "@/components/trip-builder/BlankTripModal";
import { InlineStepFields } from "@/components/trip-builder/InlineStepFields";
import type { PremiumInputData } from "@/components/trip-builder/PremiumTripInput";
import { TripCarousels } from "@/components/landing/TripCarousel";

// Public trip-builder route at /trips/new. Hero on top.
//
// Authed users get an inline experience: free-text pill above, plus a
// collapsible "Fill in details step by step" panel that expands beneath
// the hero card with structured fields (destination, dates, party,
// budget, pace, vibes). Either-or — when step mode is open and the user
// has typed in the free-text pill, we show a banner clarifying which
// input wins.
//
// On submit (free-text or inline form), we open StandaloneTripBuilder as
// the AI generation surface. For inline, we skip its input phase by
// passing initialInputData so the user goes straight to confirm/generate.
//
// "Start without an itinerary" opens BlankTripModal directly.
//
// Unauth Hero submit: stash to sessionStorage and route to /ref. After
// signup, the builder consumes the stashed prompt on mount.
export default function PublicTripBuilder() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pending, setPending] = useState<string | undefined>(() => {
    return consumePendingPrompt() ?? undefined;
  });
  const [builderOpen, setBuilderOpen] = useState(false);
  const [blankOpen, setBlankOpen] = useState(false);
  const [stepMode, setStepMode] = useState(false);
  const [inlineData, setInlineData] = useState<PremiumInputData | null>(null);

  // If the user signs in mid-session, re-check the stash so we still pick
  // up the prompt. Auto-open the builder if there's a pending prompt.
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
      // Free-text wins when the user submits the pill — drop any inline data.
      setInlineData(null);
      setPending(prompt);
      setBuilderOpen(true);
    } else {
      stashPendingPrompt(prompt);
      navigate("/ref");
    }
  }

  function handleInlineGenerate(data: PremiumInputData) {
    // Inline-form submit wins — drop any free-text prompt that was typed.
    setPending(undefined);
    setInlineData(data);
    setBuilderOpen(true);
  }

  // Two stacked secondary actions for authed users; single white link
  // (gates to /ref) for the public/atmospheric variant. The OR divider
  // above this slot is rendered by the Hero's app-variant card itself.
  const secondaryAction = user ? (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="flex flex-col md:flex-row md:justify-center items-stretch md:items-center gap-2 md:gap-3 w-full">
        <button
          type="button"
          onClick={() => setStepMode((v) => !v)}
          aria-expanded={stepMode}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white border border-gray-200 hover:border-gray-300 px-5 py-2.5 text-sm text-gray-700 hover:text-gray-900 transition-colors shadow-sm"
        >
          <ListChecks className="h-4 w-4 text-gray-500" />
          <span>Plan step by step instead</span>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${stepMode ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={() => setBlankOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white border border-gray-200 hover:border-gray-300 px-5 py-2.5 text-sm text-gray-700 hover:text-gray-900 transition-colors shadow-sm"
        >
          <FileText className="h-4 w-4 text-gray-500" />
          <span>Skip the itinerary for now</span>
        </button>
      </div>

      {stepMode && (
        <div className="w-full pt-3 space-y-3">
          <p className="text-[12px] text-muted-foreground text-center leading-snug">
            Step-by-step mode is on. The fields below will be used to plan your trip — anything typed in the box above will be ignored.
          </p>
          <InlineStepFields onGenerate={handleInlineGenerate} />
        </div>
      )}
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setBuilderOpen(true)}
      className="underline-offset-4 hover:underline text-white/85 hover:text-white transition-colors"
    >
      Prefer to fill in details step by step?
    </button>
  );

  return (
    <div className={user ? "min-h-dvh bg-gray-50" : "min-h-dvh bg-background"}>
      <Hero
        onSubmit={handleHeroSubmit}
        prefill={pending}
        variant={user ? "app" : "public"}
        secondaryAction={secondaryAction}
      />

      {/* Sample trips browse — full TripCarousels reuse from landing page.
          Same component, same data, no fork. */}
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
          onClose={() => {
            setBuilderOpen(false);
            setInlineData(null);
          }}
          initialFreeTextPrompt={inlineData ? undefined : pending}
          initialInputData={inlineData ?? undefined}
        />
      )}

      {/* Blank trip path */}
      {user && (
        <BlankTripModal open={blankOpen} onOpenChange={setBlankOpen} />
      )}
    </div>
  );
}

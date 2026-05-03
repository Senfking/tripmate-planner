import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ListChecks, PencilLine } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import {
  consumePendingPrompt,
  stashPendingPrompt,
} from "@/components/hero/usePendingPrompt";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";
import { BlankTripModal } from "@/components/trip-builder/BlankTripModal";

// Public trip-builder route at /trips/new. Hero on top; StandaloneTripBuilder
// (which is itself a fixed-position fullscreen modal) opens as an overlay
// only when explicitly triggered — either by the secondary "Prefer to fill
// in details step by step?" link, or by an authed Hero submission.
//
// Authed Hero submit: open the modal with the prompt seeded.
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
      setPending(prompt);
      setBuilderOpen(true);
    } else {
      stashPendingPrompt(prompt);
      navigate("/ref");
    }
  }

  // Two stacked secondary links for authed users; single white link
  // (gates to /ref) for the public/atmospheric variant.
  const secondaryAction = user ? (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-center gap-2 w-full max-w-md mx-auto">
      <button
        type="button"
        onClick={() => setBuilderOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[13.5px] font-medium text-foreground shadow-sm transition-all hover:border-foreground/30 hover:bg-muted/40 active:scale-[0.98] flex-1"
      >
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        Fill in step by step
      </button>
      <button
        type="button"
        onClick={() => setBlankOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[13.5px] font-medium text-foreground shadow-sm transition-all hover:border-foreground/30 hover:bg-muted/40 active:scale-[0.98] flex-1"
      >
        <PencilLine className="h-4 w-4 text-muted-foreground" />
        Build it manually
      </button>
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
    <div className="min-h-dvh bg-background">
      <Hero
        onSubmit={handleHeroSubmit}
        prefill={pending}
        variant={user ? "app" : "public"}
        secondaryAction={secondaryAction}
      />

      {builderOpen && user && (
        <StandaloneTripBuilder
          onClose={() => setBuilderOpen(false)}
          initialFreeTextPrompt={pending}
        />
      )}

      {/* Blank trip path — opened directly from the Hero's "build it
          manually" link, no intermediary StandaloneTripBuilder needed. */}
      {user && (
        <BlankTripModal open={blankOpen} onOpenChange={setBlankOpen} />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import {
  consumePendingPrompt,
  stashPendingPrompt,
} from "@/components/hero/usePendingPrompt";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";

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
      // Stash already consumed at mount and user is authed → open builder.
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
    <div className="min-h-dvh bg-background">
      <Hero
        onSubmit={handleHeroSubmit}
        prefill={pending}
        secondaryAction={
          <button
            type="button"
            onClick={() => setBuilderOpen(true)}
            className="underline-offset-4 hover:underline text-white/85 hover:text-white transition-colors"
          >
            Prefer to fill in details step by step?
          </button>
        }
      />

      {builderOpen && user && (
        <StandaloneTripBuilder
          onClose={() => setBuilderOpen(false)}
          initialFreeTextPrompt={pending}
        />
      )}
    </div>
  );
}

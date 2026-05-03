import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import {
  consumePendingPrompt,
  stashPendingPrompt,
} from "@/components/hero/usePendingPrompt";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";

// Public trip-builder route at /trips/new. Hero on top; when authed,
// the existing StandaloneTripBuilder renders below it.
//
// Authed submission: in-page handoff via React state — no sessionStorage.
// We pass `initialFreeTextPrompt` down to the builder, which seeds the
// PremiumTripInput's freeText. We DO NOT auto-submit; the user clicks
// Plan in the builder themselves.
//
// Unauth submission: stash to sessionStorage and route to /ref. After
// signup, the builder consumes the stashed prompt on mount.
export default function PublicTripBuilder() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Resolve any cross-nav stashed prompt once on mount. Done eagerly so
  // the Hero renders pre-filled on the same paint as the page.
  const [pending, setPending] = useState<string | undefined>(() => {
    return consumePendingPrompt() ?? undefined;
  });

  // If the user signs in mid-session (e.g. opens /trips/new logged-out,
  // signs up in another tab, comes back), re-check the stash so we still
  // pick up the prompt.
  useEffect(() => {
    if (user && !pending) {
      const v = consumePendingPrompt();
      if (v) setPending(v);
    }
  }, [user, pending]);

  function handleHeroSubmit(prompt: string) {
    if (user) {
      // Same-page handoff — push into local state, the builder reads it
      // via the initialFreeTextPrompt prop.
      setPending(prompt);
    } else {
      stashPendingPrompt(prompt);
      navigate("/ref");
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <Hero onSubmit={handleHeroSubmit} prefill={pending} />

      {user && (
        <div className="border-t border-border">
          <StandaloneTripBuilder
            onClose={() => navigate("/app/trips")}
            initialFreeTextPrompt={pending}
          />
        </div>
      )}
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/hero/Hero";
import { stashPendingPrompt } from "@/components/hero/usePendingPrompt";

// Public landing at /. Hero on top, plus a minimal placeholder marketing
// strip below — the real marketing sections come in a separate prompt.
//
// Submission flow: stash the prompt to sessionStorage and route the user
// to the right place. Authed users go straight to /trips/new (which
// consumes the stash on mount). Unauth users go to /ref (existing
// signup form), which post-signup will land them somewhere from which
// they can return to /trips/new and pick up where they left off.
export default function PublicLanding() {
  const navigate = useNavigate();
  const { user } = useAuth();

  function handleSubmit(prompt: string) {
    stashPendingPrompt(prompt);
    navigate(user ? "/trips/new" : "/ref");
  }

  return (
    <div className="min-h-dvh bg-background">
      <Hero onSubmit={handleSubmit} />

      {/* Placeholder marketing strip — three feature pills only. Real
          marketing sections will land in a follow-up prompt. */}
      <section
        aria-label="Junto features"
        className="border-t border-border bg-card/40"
      >
        <div className="mx-auto max-w-3xl px-5 sm:px-8 py-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
          <span className="font-medium">AI trip planning</span>
          <span aria-hidden className="opacity-40">·</span>
          <span className="font-medium">Group decisions</span>
          <span aria-hidden className="opacity-40">·</span>
          <span className="font-medium">Expense splitting</span>
        </div>
      </section>
    </div>
  );
}

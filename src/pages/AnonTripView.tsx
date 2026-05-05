import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import type { AITripResult } from "@/components/trip-results/useResultsState";
import { ContextualSignupModal, type SignupTrigger } from "@/components/auth/ContextualSignupModal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface LocationState {
  result?: AITripResult;
}

/**
 * /trips/anon/:id — read-only render of an anonymous trip generation.
 *
 * Source priority for the trip data:
 *   1. router state passed by PublicTripBuilder right after generation
 *      (no network round-trip needed).
 *   2. fall back to the public get-anonymous-trip Edge Function on refresh
 *      / direct visit.
 *
 * If the row has been claimed (claimed_at != null), we render a "trip moved"
 * notice instead of leaking the now-owned content.
 *
 * Save / Regenerate are intercepted to open the contextual signup modal
 * — no /ref redirect.
 */
export default function AnonTripView() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const initialFromState = (location.state as LocationState | null)?.result;

  const [result, setResult] = useState<AITripResult | null>(initialFromState ?? null);
  const [loading, setLoading] = useState(!initialFromState);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupTrigger, setSignupTrigger] = useState<SignupTrigger>("save");

  useEffect(() => {
    // Logged-in users landing here directly should be moved to their app
    // surface; we leave anon view to anonymous visitors.
    if (user) {
      navigate("/app/trips", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (initialFromState) return;
    let cancelled = false;
    (async () => {
      try {
        const url = `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "")}/functions/v1/get-anonymous-trip`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string}`,
          },
          body: JSON.stringify({ id }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json?.success) {
          setError(json?.error ?? "not_found");
        } else if (json.claimed) {
          setClaimed(true);
        } else {
          setResult(json.payload as AITripResult);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message ?? "Failed to load trip");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, initialFromState]);

  function openSignup(trigger: SignupTrigger) {
    setSignupTrigger(trigger);
    setSignupOpen(true);
  }

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share && window.matchMedia("(max-width: 767px)").matches) {
      try {
        await navigator.share({ title: "My trip plan from Junto", url });
      } catch {
        // Native share cancel is not an error state for the user.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center bg-background">
        <h1 className="text-2xl font-bold text-foreground mb-2">This trip has moved</h1>
        <p className="text-muted-foreground mb-6 max-w-md">
          The owner has saved it to their account. Plan your own trip with Junto AI.
        </p>
        <Button onClick={() => navigate("/trips/new")}>Plan a new trip</Button>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center bg-background">
        <h1 className="text-2xl font-bold text-foreground mb-2">Trip not found</h1>
        <p className="text-muted-foreground mb-6">This anonymous trip link is no longer available.</p>
        <Button onClick={() => navigate("/trips/new")}>Plan a new trip</Button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Persistent signup banner pinned to top of viewport. */}
      <div
        className="fixed top-0 left-0 right-0 z-[110] flex items-center justify-between gap-2 px-4 py-2.5 text-sm"
        style={{
          background: "linear-gradient(90deg,#0D9488 0%,#0F766E 100%)",
          color: "white",
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        }}
      >
        <span className="truncate">
          <span className="font-semibold">Sign up</span> to save this trip and plan more like it
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 text-white font-semibold px-3 py-1.5 text-[13px] active:opacity-80"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
          <button
            type="button"
            onClick={() => openSignup("save")}
            className="rounded-full bg-white text-[#0F766E] font-semibold px-4 py-1.5 text-[13px] active:opacity-80"
          >
            Sign up
          </button>
        </div>
      </div>

      <div style={{ paddingTop: 44 }}>
        <TripResultsView
          tripId={`anon-${id}`}
          planId={null}
          result={result}
          onClose={() => navigate("/trips/new")}
          onRegenerate={() => openSignup("regenerate")}
          standalone
          onCreateTrip={() => openSignup("save")}
          onSaveDraft={() => openSignup("save")}
          readOnly
        />
      </div>

      <ContextualSignupModal
        open={signupOpen}
        onOpenChange={setSignupOpen}
        trigger={signupTrigger}
        fallbackRedirect="/app/trips"
      />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import {
  useStreamingTripGeneration,
  buildPartialResult,
  getSkeletonDayNumbers,
} from "@/hooks/useStreamingTripGeneration";
import { ContextualSignupModal } from "@/components/auth/ContextualSignupModal";
import { getAnonSessionId } from "@/lib/anonSession";

interface Props {
  prompt: string;
  onCancel: () => void;
}

/**
 * Anonymous-mode trip generation surface. Streams generate-trip-itinerary
 * with `anon_session_id` (no JWT), renders TripResultsView mid-stream just
 * like the authenticated path, and on completion navigates to
 * /trips/anon/[id] with the result handed off via router state so the next
 * page paints instantly without a refetch.
 *
 * 429 from the server triggers the contextual signup modal (rate-limit copy)
 * — the visitor has already used their free generation today.
 */
export function AnonTripGenerator({ prompt, onCancel }: Props) {
  const navigate = useNavigate();
  const streaming = useStreamingTripGeneration();
  const startedRef = useRef(false);
  const navigatedRef = useRef(false);
  const [rateLimitOpen, setRateLimitOpen] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const sessionId = getAnonSessionId();
    void streaming.start(
      {
        trip_id: null,
        anon_session_id: sessionId,
        free_text: prompt,
        surprise_me: true,
        flexible: true,
        budget_level: "mid-range",
        vibes: [],
        pace: "balanced",
        dietary: [],
        notes: "",
        group_size: 2,
        travel_party: "couple",
      },
      { anon: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  // 429 -> rate-limit signup modal.
  useEffect(() => {
    if (
      streaming.state.stage === "error" &&
      (streaming.state.errorCode === "rate_limited" ||
        /rate.?limit|too many|429/i.test(streaming.state.error ?? ""))
    ) {
      setRateLimitOpen(true);
    }
  }, [streaming.state.stage, streaming.state.error, streaming.state.errorCode]);

  // On successful complete with an anon_trip_id, navigate to /trips/anon/[id]
  // and hand the assembled result through router state to avoid a refetch.
  useEffect(() => {
    if (navigatedRef.current) return;
    if (streaming.state.stage !== "complete") return;
    const id = streaming.state.anonTripId;
    const result = streaming.state.result;
    if (!id || !result) return;
    navigatedRef.current = true;
    navigate(`/trips/anon/${id}`, { replace: true, state: { result } });
  }, [streaming.state, navigate]);

  if (streaming.state.stage === "error") {
    const isRateLimit =
      streaming.state.errorCode === "rate_limited" ||
      streaming.state.errorCode === "anon_limit" ||
      /anon_limit|signup_required|free trip preview|rate.?limit|too many|429/i.test(streaming.state.error ?? "");

    if (isRateLimit) {
      // No error UI — just the celebratory signup takeover. Dim teal backdrop
      // hints at the trip they generated previously fading behind the unlock.
      return (
        <>
          <div
            className="min-h-dvh"
            style={{
              background:
                "radial-gradient(120% 80% at 50% 0%, rgba(13,148,136,0.18) 0%, rgba(10,10,10,0) 55%), #0a0a0a",
            }}
          />
          <ContextualSignupModal
            open={rateLimitOpen}
            onOpenChange={(o) => { setRateLimitOpen(o); if (!o) onCancel(); }}
            trigger="rate_limit"
            fallbackRedirect="/trips/new"
          />
        </>
      );
    }

    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-card shadow-2xl p-6 text-center space-y-3">
          <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
          <p className="text-sm font-semibold text-foreground">Couldn't finish your trip</p>
          <p className="text-xs text-muted-foreground">
            {streaming.state.error ?? "Unknown error"}
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Back
            </Button>
            <Button onClick={() => { startedRef.current = false; streaming.reset(); }} className="flex-1">
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const partial = buildPartialResult(streaming.state);
  const skeletonNums = getSkeletonDayNumbers(streaming.state);
  const isStreaming = streaming.state.stage !== "complete";

  if (!partial) {
    return (
      <div className="fixed inset-0 z-[100] overflow-hidden bg-background">
        <div className="relative h-[36vh] min-h-[260px] lg:h-[42vh] bg-gradient-to-br from-muted/70 to-muted/20">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0.85) 12%, hsl(var(--background) / 0.55) 28%, transparent 75%)",
            }}
          />
        </div>
        <div className="mx-auto max-w-[700px] px-4 pt-5 lg:pl-[76px]">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card px-3 py-1.5 shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-xs font-medium text-foreground">Crafting your trip…</span>
          </div>
          <div className="space-y-3">
            <div className="h-3 w-20 rounded bg-primary/20" />
            <div className="h-8 w-4/5 max-w-[520px] rounded bg-muted animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            <div className="mt-5 overflow-hidden rounded-3xl bg-[hsl(180_25%_10%)] p-6 shadow-[0_20px_50px_-20px_rgba(13,148,136,0.45)]">
              <div className="mb-5 h-3 w-44 rounded bg-white/15 animate-pulse" />
              <div className="h-11 w-36 rounded bg-white/20 animate-pulse" />
              <div className="mt-5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-primary/80 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <TripResultsView
        tripId="anon-streaming"
        planId={null}
        result={partial}
        onClose={onCancel}
        onRegenerate={() => { /* gated during stream */ }}
        standalone
        streaming={isStreaming}
        streamingDayNumbers={skeletonNums}
        streamingMessage="Crafting your trip…"
        readOnly
      />
    </div>
  );
}

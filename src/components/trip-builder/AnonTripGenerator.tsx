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
    return (
      <>
        <div className="min-h-dvh flex items-center justify-center bg-background p-6">
          <div className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-card shadow-2xl p-6 text-center space-y-3">
            <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
            <p className="text-sm font-semibold text-foreground">Couldn't finish your trip</p>
            <p className="text-xs text-muted-foreground">
              {streaming.state.errorCode === "rate_limited"
                ? "You've hit the free generation limit."
                : streaming.state.error ?? "Unknown error"}
            </p>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                Back
              </Button>
              {streaming.state.errorCode !== "rate_limited" && (
                <Button onClick={() => { startedRef.current = false; streaming.reset(); }} className="flex-1">
                  Try again
                </Button>
              )}
            </div>
          </div>
        </div>
        <ContextualSignupModal
          open={rateLimitOpen}
          onOpenChange={setRateLimitOpen}
          trigger="rate_limit"
          fallbackRedirect="/trips/new"
        />
      </>
    );
  }

  const partial = buildPartialResult(streaming.state);
  const skeletonNums = getSkeletonDayNumbers(streaming.state);
  const isStreaming = streaming.state.stage !== "complete";

  if (!partial) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Crafting your trip…</p>
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

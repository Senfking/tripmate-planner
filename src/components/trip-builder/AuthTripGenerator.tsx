import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import {
  useStreamingTripGeneration,
  buildPartialResult,
  getSkeletonDayNumbers,
} from "@/hooks/useStreamingTripGeneration";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { stripEmoji } from "@/lib/stripEmoji";
import type { AITripResult } from "@/components/trip-results/useResultsState";

interface Props {
  /** Free-text prompt — used when there's no structured form data. */
  prompt?: string;
  /** Pre-built generation payload (e.g. from PremiumTripInput). Takes
   *  precedence over `prompt`. */
  payload?: Record<string, unknown>;
  onCancel: () => void;
}

const DEFAULT_FREE_TEXT_PAYLOAD = (prompt: string): Record<string, unknown> => ({
  trip_id: null,
  free_text: prompt,
  surprise_me: false,
  flexible: true,
  budget_level: "mid-range",
  vibes: [],
  pace: "balanced",
  dietary: [],
  notes: "",
  group_size: 2,
  travel_party: "couple",
});

/**
 * Authenticated trip generation. Mirrors AnonTripGenerator's UX (streams
 * TripResultsView mid-flight) but on completion persists a draft trip to
 * the signed-in user's account and routes to /app/trips/[id].
 *
 * Replaces the legacy StandaloneTripBuilder modal for the free-text
 * submission path and the step-by-step inline form path.
 */
export function AuthTripGenerator({ prompt, payload: payloadProp, onCancel }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const streaming = useStreamingTripGeneration();
  const startedRef = useRef(false);
  const persistedRef = useRef(false);
  const [persisting, setPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  const payloadRef = useRef<Record<string, unknown>>(
    payloadProp ?? DEFAULT_FREE_TEXT_PAYLOAD(prompt ?? ""),
  );
  const payload = payloadRef.current;

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void streaming.start(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  // On stream complete: persist draft trip + navigate.
  useEffect(() => {
    if (persistedRef.current) return;
    if (streaming.state.stage !== "complete") return;
    const result = streaming.state.result;
    if (!result) return;
    if (!user) {
      toast.error("You need to be signed in to save a trip.");
      return;
    }
    persistedRef.current = true;
    setPersisting(true);

    (async () => {
      try {
        const firstDest = result.destinations[0];
        const lastDest = result.destinations[result.destinations.length - 1];
        const destination = result.destinations.map((d) => d.name).join(", ");
        const title = stripEmoji(result.trip_title) || "Your Trip";

        const { data: trip, error: tripError } = await (supabase
          .from("trips")
          .insert({
            name: title,
            trip_name: title,
            itinerary_title: title,
            status: "draft",
            destination,
            tentative_start_date: firstDest?.start_date || null,
            tentative_end_date: lastDest?.end_date || null,
            destination_image_url: result.destination_image_url ?? null,
            destination_country_iso: result.destination_country_iso ?? null,
          } as any)
          .select("id")
          .single());

        if (tripError || !trip) throw tripError ?? new Error("trip insert returned no row");

        const { error: planError } = await (supabase
          .from("ai_trip_plans" as any)
          .insert({
            trip_id: trip.id,
            created_by: user.id,
            prompt: payload,
            result,
          })
          .select("id")
          .single() as any);

        if (planError) throw planError;

        trackEvent("ai_trip_generated", {
          standalone: true,
          streamed: true,
          draft_trip_id: trip.id,
          source: "auth_free_text",
        });

        navigate(`/app/trips/${trip.id}`, { replace: true });
      } catch (err: any) {
        console.error("[AuthTripGenerator] Failed to persist draft trip:", err);
        setPersistError(err?.message || "Couldn't save your trip.");
        persistedRef.current = false;
      } finally {
        setPersisting(false);
      }
    })();
  }, [streaming.state.stage, streaming.state.result, user, navigate, payload]);

  // Stream error
  if (streaming.state.stage === "error") {
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
            <Button
              onClick={() => {
                startedRef.current = false;
                streaming.reset();
              }}
              className="flex-1"
            >
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Persist error after successful stream
  if (persistError) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-card shadow-2xl p-6 text-center space-y-3">
          <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
          <p className="text-sm font-semibold text-foreground">Couldn't save your trip</p>
          <p className="text-xs text-muted-foreground">{persistError}</p>
          <Button variant="outline" onClick={onCancel} className="w-full">
            Close
          </Button>
        </div>
      </div>
    );
  }

  const partial = buildPartialResult(streaming.state);
  const skeletonNums = getSkeletonDayNumbers(streaming.state);
  const isStreaming = streaming.state.stage !== "complete" || persisting;

  if (!partial) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Crafting your trip…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <TripResultsView
        tripId="auth-streaming"
        planId={null}
        result={partial}
        onClose={onCancel}
        onRegenerate={() => { /* gated during stream */ }}
        standalone
        streaming={isStreaming}
        streamingDayNumbers={skeletonNums}
        streamingMessage="Crafting your trip"
        streamingStatusMessages={streaming.state.statusMessages}
        streamingStage={streaming.state.currentStage}
        streamingCompletedDays={streaming.state.completedDays}
        readOnly
      />
    </div>
  );
}

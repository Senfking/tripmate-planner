import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { stripEmoji } from "@/lib/stripEmoji";

import { PremiumTripInput, type PremiumInputData } from "./PremiumTripInput";
import { ConfirmationCard } from "./ConfirmationCard";
import { StreamingGeneratingScreen } from "./StreamingGeneratingScreen";
import { BlankTripModal } from "./BlankTripModal";
import { NameTripModal } from "./NameTripModal";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import type { AITripResult } from "@/components/trip-results/useResultsState";
import { useStreamingTripGeneration } from "@/hooks/useStreamingTripGeneration";

function normalizeAIResponse(raw: Record<string, any>): AITripResult {
  const destinations = Array.isArray(raw.destinations) ? raw.destinations : [];
  const safeDestinations = destinations.map((dest: any) => ({
    name: dest?.name || "Unknown destination",
    start_date: dest?.start_date || "",
    end_date: dest?.end_date || dest?.start_date || "",
    intro: dest?.intro || "",
    days: Array.isArray(dest?.days)
      ? dest.days.map((day: any) => ({
          date: day?.date || "",
          day_number: day?.day_number || 0,
          theme: day?.theme || "",
          activities: Array.isArray(day?.activities) ? day.activities : [],
        }))
      : [],
    accommodation: dest?.accommodation || undefined,
    transport_to_next: dest?.transport_to_next || undefined,
    cost_profile: dest?.cost_profile || undefined,
  }));

  let mapCenter = raw.map_center;
  if (!mapCenter || typeof mapCenter.lat !== "number") {
    for (const dest of safeDestinations) {
      for (const day of dest.days) {
        for (const act of day.activities) {
          if (act.latitude != null && act.longitude != null) {
            mapCenter = { lat: act.latitude, lng: act.longitude };
            break;
          }
        }
        if (mapCenter?.lat != null) break;
      }
      if (mapCenter?.lat != null) break;
    }
  }
  if (!mapCenter || typeof mapCenter.lat !== "number") {
    mapCenter = { lat: 0, lng: 0 };
  }

  return {
    trip_title: stripEmoji(raw.trip_title || raw.title || "Your Trip"),
    trip_summary: raw.trip_summary || raw.summary || "",
    destinations: safeDestinations,
    map_center: mapCenter,
    map_zoom: typeof raw.map_zoom === "number" ? raw.map_zoom : 6,
    daily_budget_estimate: typeof raw.daily_budget_estimate === "number" ? raw.daily_budget_estimate : 0,
    currency: raw.currency || "USD",
    packing_suggestions: Array.isArray(raw.packing_suggestions) ? raw.packing_suggestions : [],
    total_activities: typeof raw.total_activities === "number" ? raw.total_activities : 0,
    budget_tier: raw.budget_tier,
    destination_image_url:
      typeof raw.destination_image_url === "string" && raw.destination_image_url.length > 0
        ? raw.destination_image_url
        : null,
    destination_country_iso:
      typeof raw.destination_country_iso === "string" && raw.destination_country_iso.length === 2
        ? raw.destination_country_iso.toUpperCase()
        : null,
  };
}

type Phase = "input" | "confirming" | "generating" | "opening" | "open-error" | "results";

interface Props {
  onClose: () => void;
  initialDestination?: string;
  draftPlanId?: string;
  draftResult?: AITripResult;
}

export function StandaloneTripBuilder({ onClose, initialDestination, draftPlanId, draftResult }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>(draftResult ? "results" : "input");
  const [inputData, setInputData] = useState<PremiumInputData | null>(null);
  const [results, setResults] = useState<AITripResult | null>(draftResult ?? null);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(draftPlanId ?? null);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [blankModalOpen, setBlankModalOpen] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingNormalized, setPendingNormalized] = useState<AITripResult | null>(null);
  const streaming = useStreamingTripGeneration();

  const handleStartBlank = useCallback(() => {
    setBlankModalOpen(true);
  }, []);

  const handleInputComplete = useCallback((data: PremiumInputData) => {
    setInputData(data);
    setPhase("confirming");
  }, []);

  const buildPayload = useCallback((data: PremiumInputData) => ({
    trip_id: null,
    destination: data.destination,
    surprise_me: false,
    start_date: data.dateRange?.from?.toISOString().split("T")[0] || null,
    end_date: data.dateRange?.to?.toISOString().split("T")[0] || null,
    flexible: false,
    duration_days: null,
    budget_level: data.budgetLevel || "mid-range",
    vibes: data.vibes,
    pace: data.pace || "balanced",
    dietary: [],
    notes: data.dealBreakers || "",
    free_text: data.freeText || "",
    group_size:
      data.travelParty === "solo" ? 1
      : data.travelParty === "couple" ? 2
      : data.travelParty === "group" ? 6
      : data.travelParty === "family" ? 4
      : data.travelParty === "friends" ? 4
      : 1,
    travel_party: data.travelParty,
    kids_ages: data.kidsAges || undefined,
  }), []);

  const handleConfirm = useCallback(async () => {
    if (!inputData) return;
    const payload = buildPayload(inputData);
    setPendingPayload(payload);
    setPhase("generating");
    streaming.reset();
    await streaming.start(payload);
  }, [inputData, buildPayload, streaming]);

  // When streaming completes, persist the trip as a `draft` row and navigate
  // to its canonical /app/trips/[id] URL. TripHome owns the draft results UI.
  //
  // We deliberately do NOT fall back to rendering TripResultsView in-component
  // anymore — that caused a visible flash between stream completion and
  // navigation. Instead we show a brief "Opening your trip…" state, and on
  // failure show a small error with a retry CTA.
  const persistAndOpen = useCallback(async (normalized: AITripResult, payload: Record<string, unknown>) => {
    if (!user) {
      toast.error("You need to be signed in to save a trip.");
      setPhase("open-error");
      return;
    }

    try {
      const firstDest = normalized.destinations[0];
      const lastDest = normalized.destinations[normalized.destinations.length - 1];
      const destination = normalized.destinations.map((d) => d.name).join(", ");
      const title = stripEmoji(normalized.trip_title) || "Your Trip";

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
          destination_image_url: normalized.destination_image_url ?? null,
          destination_country_iso: normalized.destination_country_iso ?? null,
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
          result: normalized,
        }) as any);

      if (planError) throw planError;

      trackEvent("ai_trip_generated", {
        standalone: true,
        destination: inputData?.destination,
        streamed: true,
        draft_trip_id: trip.id,
      });

      navigate(`/app/trips/${trip.id}`, { replace: true });
    } catch (saveErr) {
      console.error("[StandaloneBuilder] Failed to persist draft trip:", saveErr);
      setPhase("open-error");
    }
  }, [user, inputData, navigate]);

  const handleStreamComplete = useCallback(async (normalized: AITripResult) => {
    if (!pendingPayload) return;
    setPendingNormalized(normalized);
    setPhase("opening");
    await persistAndOpen(normalized, pendingPayload);
  }, [pendingPayload, persistAndOpen]);

  const handleRetryOpen = useCallback(async () => {
    if (!pendingNormalized || !pendingPayload) {
      setPhase("input");
      return;
    }
    setPhase("opening");
    await persistAndOpen(pendingNormalized, pendingPayload);
  }, [pendingNormalized, pendingPayload, persistAndOpen]);

  // Step 1: open the "Name your trip" modal (always shown before save).
  const handleCreateTrip = useCallback(() => {
    if (!results) {
      toast.error("Plan isn't ready yet — please wait a moment.");
      return;
    }
    if (!user) {
      toast.error("You need to be signed in to save a trip.");
      return;
    }
    setNameModalOpen(true);
  }, [results, user]);

  // Step 2: actually persist the trip with the user-confirmed name. The
  // AI-generated `trip_title` becomes `itinerary_title` (the descriptive
  // subtitle); the user-chosen name becomes `trip_name` (the primary
  // identifier). We mirror to the legacy `name` column during the
  // transition so unmigrated reads keep working.
  const persistTrip = useCallback(async (tripName: string) => {
    if (!results || !user) return;
    setCreatingTrip(true);
    try {
      const firstDest = results.destinations[0];
      const lastDest = results.destinations[results.destinations.length - 1];
      const destination = results.destinations.map((d) => d.name).join(", ");
      const itineraryTitle = stripEmoji(results.trip_title) || tripName;

      const { data: trip, error: tripError } = await supabase
        .from("trips")
        .insert({
          name: tripName,
          trip_name: tripName,
          itinerary_title: itineraryTitle,
          destination,
          tentative_start_date: firstDest?.start_date || null,
          tentative_end_date: lastDest?.end_date || null,
          destination_image_url: results.destination_image_url ?? null,
          destination_country_iso: results.destination_country_iso ?? null,
        } as any)
        .select()
        .single();

      if (tripError) throw tripError;

      if (savedPlanId) {
        await supabase.from("ai_trip_plans" as any).update({ trip_id: trip.id } as any).eq("id", savedPlanId);
      }

      trackEvent("trip_created_from_ai", { trip_id: trip.id, plan_id: savedPlanId });
      toast.success("Trip created!");
      setNameModalOpen(false);
      navigate(`/app/trips/${trip.id}`, { replace: true });
    } catch (err: any) {
      console.error("[StandaloneBuilder] create trip failed:", err);
      toast.error(err?.message || "Couldn't save your trip. Please try again.");
    } finally {
      setCreatingTrip(false);
    }
  }, [results, savedPlanId, user, navigate]);

  const handleSaveDraft = useCallback(() => {
    toast.success("Draft saved! Find it on your trips page.");
    onClose();
  }, [onClose]);

  // Brief transition shown after stream completes while we INSERT the draft
  // trip and navigate to /app/trips/[id]. Prevents a flash of TripResultsView.
  if (phase === "opening") {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Opening your trip…</p>
      </div>
    );
  }

  // Persist/navigate failed — give the user a way to retry without re-running
  // the full AI generation.
  if (phase === "open-error") {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">Couldn't open your trip</p>
          <p className="text-sm text-muted-foreground">Something went wrong saving your draft. Please try again.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleRetryOpen}>Try again</Button>
        </div>
      </div>
    );
  }

  // Results view (legacy: only reachable when the component is opened with a
  // pre-existing draft via the `draftResult` prop). The post-stream-complete
  // path no longer routes here — TripHome owns draft results rendering.

  if (phase === "results" && results) {
    return (
      <div className="fixed inset-0 z-[100]">
        <TripResultsView
          tripId="standalone"
          planId={savedPlanId}
          result={results}
          onClose={onClose}
          onRegenerate={(prompt) => {
            setResults(null);
            setSavedPlanId(null);
            if (prompt && inputData) {
              setInputData({ ...inputData, freeText: prompt });
            }
            setPhase("generating");
            handleConfirm();
          }}
          onAdjust={() => {
            setResults(null);
            setSavedPlanId(null);
            setPhase("input");
          }}
          standalone
          onCreateTrip={handleCreateTrip}
          onSaveDraft={handleSaveDraft}
          creatingTrip={creatingTrip}
        />
        <NameTripModal
          open={nameModalOpen}
          onOpenChange={(o) => {
            if (!creatingTrip) setNameModalOpen(o);
          }}
          defaultName={stripEmoji(results.trip_title)}
          submitting={creatingTrip}
          onConfirm={persistTrip}
        />
      </div>
    );
  }

  // Generating view (live SSE streaming)
  if (phase === "generating") {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <StreamingGeneratingScreen
          destination={inputData?.destination || ""}
          state={streaming.state}
          onRetry={handleConfirm}
          onComplete={handleStreamComplete}
        />
      </div>
    );
  }

  // Confirmation card overlay
  if (phase === "confirming" && inputData) {
    return (
      <>
        <div className="fixed inset-0 z-[100] bg-background flex flex-col overflow-y-auto">
          <div className="flex items-center justify-end px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2 max-w-lg mx-auto w-full">
            <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-muted transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
          <PremiumTripInput
            onGenerate={handleInputComplete}
            onStartBlank={handleStartBlank}
            initialDestination={initialDestination}
          />
        </div>
        <ConfirmationCard
          data={inputData}
          onConfirm={handleConfirm}
          onEdit={() => setPhase("input")}
        />
      </>
    );
  }

  // Input view
  return (
    <>
      <div className="fixed inset-0 z-[100] bg-background flex flex-col overflow-y-auto">
        <div className="flex items-center justify-end px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2 max-w-lg mx-auto w-full">
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <PremiumTripInput
          onGenerate={handleInputComplete}
          onStartBlank={handleStartBlank}
          initialDestination={initialDestination}
        />
      </div>
      <BlankTripModal open={blankModalOpen} onOpenChange={setBlankModalOpen} />
    </>
  );
}

import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { X, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";
import { stripEmoji } from "@/lib/stripEmoji";

import { PremiumTripInput, type PremiumInputData } from "./PremiumTripInput";
import { ConfirmationCard } from "./ConfirmationCard";
// StreamingGeneratingScreen retired — TripResultsView is now the streaming surface.
import { BlankTripModal } from "./BlankTripModal";
import { NameTripModal } from "./NameTripModal";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import type { AITripResult } from "@/components/trip-results/useResultsState";
import {
  useStreamingTripGeneration,
  buildPartialResult,
  getSkeletonDayNumbers,
} from "@/hooks/useStreamingTripGeneration";
import { consumePendingPrompt } from "@/components/hero/usePendingPrompt";

const STAGE_LABELS: Record<string, string> = {
  starting: "Connecting…",
  parsing_intent: "Reading your preferences…",
  picking_destination: "Picking your surprise destination…",
  destination_picked: "Destination locked in",
  geocoding: "Locating your destination…",
  searching_venues: "Finding venues that match your vibe…",
  hydrating_finalists: "Looking up venue details…",
  ranking: "Composing your day-by-day itinerary…",
  complete: "Your trip is ready!",
  error: "Something went wrong",
};

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

interface TemplateContext {
  slug: string;
  defaults: {
    destination: string;
    duration_days: number;
    vibes: string[];
    pace: string;
    budget_tier: string;
  };
}

interface Props {
  onClose: () => void;
  initialDestination?: string;
  draftPlanId?: string;
  draftResult?: AITripResult;
  /** Pre-fills the free-text prompt in the builder's input. Used by the
   *  shared Hero on /trips/new and /. We do NOT auto-submit — the user
   *  clicks Generate themselves once the field is populated. */
  initialFreeTextPrompt?: string;
  /** When provided, opens the builder directly into the confirmation
   *  phase with this data prefilled. Used by the inline step-by-step
   *  panel on /trips/new so the user doesn't see a separate input page. */
  initialInputData?: PremiumInputData;
  /** Template-driven personalization context. When set with !isModified at
   *  submit time, we'll back-fill the template cache after generation. */
  templateContext?: TemplateContext;
  /** When true, override the default-derived initial phase and always start
   *  on the input editor (so a user with prefilled template defaults can
   *  still tweak before submitting). */
  forceInputFirst?: boolean;
}

export function StandaloneTripBuilder({ onClose, initialDestination, draftPlanId, draftResult, initialFreeTextPrompt, initialInputData, templateContext, forceInputFirst }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>(
    draftResult ? "results" : initialInputData && !forceInputFirst ? "confirming" : "input"
  );
  const [inputData, setInputData] = useState<PremiumInputData | null>(initialInputData ?? null);
  const [results, setResults] = useState<AITripResult | null>(draftResult ?? null);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(draftPlanId ?? null);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [blankModalOpen, setBlankModalOpen] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingNormalized, setPendingNormalized] = useState<AITripResult | null>(null);
  const streaming = useStreamingTripGeneration();

  // Resolve the effective initial free-text prompt exactly once on mount.
  // Priority: explicit prop (in-page Hero handoff on /trips/new) > stashed
  // sessionStorage value (cross-nav resume after signup). Consuming the
  // stash here clears it so subsequent mounts don't keep auto-filling.
  // We do NOT auto-submit — the user clicks Generate themselves.
  const effectiveInitialFreeText = useMemo(
    () => initialFreeTextPrompt ?? consumePendingPrompt() ?? undefined,
    // Mount-only on purpose. If the host swaps the prop later (e.g. user
    // submits the Hero a second time on /trips/new), they'll get a new
    // value via PublicTripBuilder re-rendering with a new key if needed.
    // For our current flows the mount-only behavior is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
    start_date: data.dateRange?.from ? format(data.dateRange.from, "yyyy-MM-dd") : null,
    end_date: data.dateRange?.to ? format(data.dateRange.to, "yyyy-MM-dd") : null,
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

      const { data: planRow, error: planError } = await (supabase
        .from("ai_trip_plans" as any)
        .insert({
          trip_id: trip.id,
          created_by: user.id,
          prompt: payload,
          result: normalized,
        })
        .select("id")
        .single() as any);

      if (planError) throw planError;

      trackEvent("ai_trip_generated", {
        standalone: true,
        destination: inputData?.destination,
        streamed: true,
        draft_trip_id: trip.id,
      });

      // If this generation came from a template and the user didn't tweak
      // the defaults, back-fill the template cache (fire-and-forget).
      if (templateContext && inputData && planRow?.id) {
        const d = templateContext.defaults;
        const isModified =
          inputData.destination.trim().toLowerCase() !== d.destination.trim().toLowerCase() ||
          (inputData.pace ?? "") !== d.pace ||
          (inputData.budgetLevel ?? "") !== d.budget_tier ||
          JSON.stringify([...(inputData.vibes ?? [])].sort()) !==
            JSON.stringify([...(d.vibes ?? [])].sort());
        if (!isModified) {
          void (supabase as any).rpc("update_template_cache", {
            _slug: templateContext.slug,
            _plan_id: planRow.id,
          });
        }
      }

      navigate(`/app/trips/${trip.id}`, { replace: true });
    } catch (saveErr) {
      console.error("[StandaloneBuilder] Failed to persist draft trip:", saveErr);
      setPhase("open-error");
    }
  }, [user, inputData, navigate, templateContext]);

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
      navigate(`/app/trips/${trip.id}?invite=1`, { replace: true });
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
  // trip and navigate to /app/trips/[id]. Per the streaming-UI refactor,
  // TripResultsView IS the final state — there is no separate "Creating
  // your trip" overlay. We render the same surface with streaming=false so
  // the transition from streaming-end to navigation is invisible (the
  // streaming pill disappears, budget appears, Create Trip enables). The
  // persist+navigate runs in the background; if it fails we drop into the
  // open-error state below.
  if (phase === "opening" && pendingNormalized) {
    return (
      <div className="fixed inset-0 z-[100]">
        <TripResultsView
          tripId="standalone-opening"
          planId={null}
          result={pendingNormalized}
          onClose={onClose}
          onRegenerate={() => { /* gated during open */ }}
          standalone
          onCreateTrip={handleCreateTrip}
          onSaveDraft={handleSaveDraft}
          creatingTrip={creatingTrip}
        />
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

  // Generating view (live SSE streaming) — render TripResultsView with the
  // partial result so the user sees the SAME surface during streaming and
  // after completion. Day cards stream in; un-streamed days render as
  // skeletons. The transition to "complete" is just one status pill
  // disappearing — no layout swap.
  if (phase === "generating") {
    const partial = buildPartialResult(streaming.state);
    const skeletonNums = getSkeletonDayNumbers(streaming.state);
    const isStreaming = streaming.state.stage !== "complete" && streaming.state.stage !== "error";
    const stageMsg = STAGE_LABELS[streaming.state.stage] ?? "Crafting your trip…";

    // Once trip_complete fires we get a fully-assembled `result`. Persist +
    // navigate (existing behavior). Until then, render TripResultsView with
    // whatever we have.
    if (streaming.state.stage === "complete" && streaming.state.result) {
      // Defer to the existing handoff (persists draft + navigates). We still
      // render the results view underneath so there's no flash while the
      // INSERT round-trips.
      // Fire-and-forget — handleStreamComplete is idempotent on pendingPayload.
      void handleStreamComplete(streaming.state.result);
    }

    // Error state — small overlay, retry CTA. Mirrors the prior screen.
    if (streaming.state.stage === "error") {
      return (
        <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-card shadow-2xl p-6 text-center space-y-3">
            <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
            <p className="text-sm font-semibold text-foreground">Couldn't finish your trip</p>
            <p className="text-xs text-muted-foreground">{streaming.state.error ?? "Unknown error"}</p>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
              <Button onClick={handleConfirm} className="flex-1">Try again</Button>
            </div>
          </div>
        </div>
      );
    }

    // Pre-meta: nothing to render yet in the results surface. Show a brief
    // centered loading state — disappears within ~1s once meta arrives.
    if (!partial) {
      return (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">{stageMsg}</p>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[100]">
        <TripResultsView
          tripId="standalone-streaming"
          planId={null}
          result={partial}
          onClose={onClose}
          onRegenerate={() => { /* gated during stream */ }}
          standalone
          onCreateTrip={handleCreateTrip}
          onSaveDraft={handleSaveDraft}
          creatingTrip={creatingTrip}
          streaming={isStreaming}
          streamingDayNumbers={skeletonNums}
          streamingMessage={stageMsg}
        />
      </div>
    );
  }

  // Template-aware UI props for the input form. When opened from a template,
  // we lock destination, swap the title, and hide the free-text shortcut.
  const templateInputProps = templateContext
    ? {
        lockedDestination: true,
        title: `Personalize your ${templateContext.defaults.destination} trip`,
        subtitle: "Tweak any of these to make it yours.",
        hideFreeText: true,
        initialData: initialInputData ?? undefined,
      }
    : ({} as const);

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
            initialFreeText={effectiveInitialFreeText}
            {...templateInputProps}
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
          initialFreeText={effectiveInitialFreeText}
          {...templateInputProps}
        />
      </div>
      <BlankTripModal open={blankModalOpen} onOpenChange={setBlankModalOpen} />
    </>
  );
}

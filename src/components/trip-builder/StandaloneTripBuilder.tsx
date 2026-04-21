import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";

import { PremiumTripInput, type PremiumInputData } from "./PremiumTripInput";
import { ConfirmationCard } from "./ConfirmationCard";
import { GeneratingScreen } from "./GeneratingScreen";
import { BlankTripModal } from "./BlankTripModal";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import type { AITripResult } from "@/components/trip-results/useResultsState";

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
    trip_title: raw.trip_title || raw.title || "Your Trip",
    trip_summary: raw.trip_summary || raw.summary || "",
    destinations: safeDestinations,
    map_center: mapCenter,
    map_zoom: typeof raw.map_zoom === "number" ? raw.map_zoom : 6,
    daily_budget_estimate: typeof raw.daily_budget_estimate === "number" ? raw.daily_budget_estimate : 0,
    currency: raw.currency || "USD",
    packing_suggestions: Array.isArray(raw.packing_suggestions) ? raw.packing_suggestions : [],
    total_activities: typeof raw.total_activities === "number" ? raw.total_activities : 0,
  };
}

type Phase = "input" | "confirming" | "generating" | "results";

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
  const [genError, setGenError] = useState<string | null>(null);
  const [results, setResults] = useState<AITripResult | null>(draftResult ?? null);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(draftPlanId ?? null);
  const [creatingTrip, setCreatingTrip] = useState(false);
  const [blankModalOpen, setBlankModalOpen] = useState(false);

  const handleStartBlank = useCallback(() => {
    setBlankModalOpen(true);
  }, []);

  const handleInputComplete = useCallback((data: PremiumInputData) => {
    setInputData(data);
    setPhase("confirming");
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!inputData) return;
    setPhase("generating");
    setGenError(null);

    try {
      const payload = {
        trip_id: null,
        destination: inputData.destination,
        surprise_me: false,
        start_date: inputData.dateRange?.from?.toISOString().split("T")[0] || null,
        end_date: inputData.dateRange?.to?.toISOString().split("T")[0] || null,
        flexible: false,
        duration_days: null,
        budget_level: inputData.budgetLevel || "mid-range",
        vibes: inputData.vibes,
        pace: "balanced",
        dietary: [],
        notes: inputData.dealBreakers || "",
        free_text: inputData.freeText || "",
        group_size: inputData.travelParty === "solo" ? 1
          : inputData.travelParty === "couple" ? 2
          : inputData.travelParty === "group" ? 6
          : inputData.travelParty === "family" ? 4
          : inputData.travelParty === "friends" ? 4
          : 1,
        travel_party: inputData.travelParty,
        kids_ages: inputData.kidsAges || undefined,
      };

      const { data, error } = await supabase.functions.invoke("generate-trip-itinerary", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data) throw new Error("No data returned");

      const normalized = normalizeAIResponse(data);

      let planId: string | null = null;
      try {
        const userId = user?.id;
        if (userId) {
          const { data: inserted, error: insertError } = await (supabase
            .from("ai_trip_plans" as any)
            .insert({ trip_id: null, created_by: userId, prompt: payload, result: normalized }) as any)
            .select("id")
            .single();
          if (!insertError) planId = inserted?.id ?? null;
        }
      } catch (saveErr) {
        console.error("[StandaloneBuilder] Failed to save plan:", saveErr);
      }

      setSavedPlanId(planId);
      setResults(normalized);
      setPhase("results");
      trackEvent("ai_trip_generated", { standalone: true, destination: inputData.destination });
    } catch (err: any) {
      console.error("[StandaloneBuilder] Generation failed:", err);
      setGenError(err?.message || "Failed to generate itinerary. Please try again.");
    }
  }, [inputData, user]);

  const handleCreateTrip = useCallback(async () => {
    if (!results || !user) return;
    setCreatingTrip(true);
    try {
      const firstDest = results.destinations[0];
      const lastDest = results.destinations[results.destinations.length - 1];
      const destination = results.destinations.map((d) => d.name).join(", ");

      const { data: trip, error: tripError } = await supabase
        .from("trips")
        .insert({
          name: results.trip_title,
          destination,
          tentative_start_date: firstDest?.start_date || null,
          tentative_end_date: lastDest?.end_date || null,
        } as any)
        .select()
        .single();

      if (tripError) throw tripError;

      if (savedPlanId) {
        await supabase.from("ai_trip_plans" as any).update({ trip_id: trip.id } as any).eq("id", savedPlanId);
      }

      trackEvent("trip_created_from_ai", { trip_id: trip.id, plan_id: savedPlanId });
      toast.success("Trip created!");
      navigate(`/app/trips/${trip.id}`, { replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Failed to create trip");
    } finally {
      setCreatingTrip(false);
    }
  }, [results, savedPlanId, user, navigate]);

  const handleSaveDraft = useCallback(() => {
    toast.success("Draft saved! Find it on your trips page.");
    onClose();
  }, [onClose]);

  // Results view
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
      </div>
    );
  }

  // Generating view
  if (phase === "generating" || genError) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <GeneratingScreen
          destination={inputData?.destination || ""}
          error={genError}
          onRetry={handleConfirm}
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

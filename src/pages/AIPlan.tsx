import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import type { AITripResult } from "@/components/trip-results/useResultsState";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AIPlan() {
  const { tripId, planId } = useParams<{ tripId: string; planId: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<AITripResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!planId || !tripId) return;

    (async () => {
      const { data, error } = await supabase
        .from("ai_trip_plans")
        .select("result")
        .eq("id", planId)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        setResult(data.result as unknown as AITripResult);
      }
      setLoading(false);
    })();
  }, [planId, tripId]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !result || !tripId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center flex-col gap-4">
        <p className="text-lg text-muted-foreground">Plan not found</p>
        <Button
          onClick={() => navigate(tripId ? `/app/trips/${tripId}` : "/app/trips")}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {tripId ? "Start a new plan" : "Go to trips"}
        </Button>
      </div>
    );
  }

  return (
    <TripResultsView
      tripId={tripId}
      planId={planId || null}
      result={result}
      onClose={() => navigate(`/app/trips/${tripId}`)}
      onRegenerate={() => {
        const dest = result.destinations[0]?.name ?? "";
        const qs = dest ? `?initialDestination=${encodeURIComponent(dest)}` : "";
        navigate(`/app/trips/new${qs}`);
      }}
    />
  );
}

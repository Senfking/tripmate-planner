import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TripResultsView } from "@/components/trip-results/TripResultsView";
import type { AITripResult } from "@/components/trip-results/useResultsState";
import { format } from "date-fns";

interface AnonItineraryData {
  trip: {
    name: string;
    emoji: string | null;
    tentative_start_date: string | null;
    tentative_end_date: string | null;
    destination_image_url: string | null;
  };
  result: AITripResult;
  last_updated: string;
}

/**
 * /share/:token/itinerary — read-only public view of a trip's full AI plan.
 * Reuses TripResultsView with readOnly=true. Excludes expenses, comments,
 * decisions, edit affordances, member attribution, and any auth-only
 * affordances (TripResultsView readOnly path already gates these).
 */
export default function AnonItineraryView() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AnonItineraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const projId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projId}.supabase.co/functions/v1/public-trip-share-itinerary`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
              authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string}`,
            },
            body: JSON.stringify({ token }),
          },
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json?.error || "not_found");
        } else {
          setData(json as AnonItineraryData);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 space-y-6 bg-white">
        <MapPin className="h-16 w-16 text-gray-300" />
        <div>
          <p className="text-xl font-semibold text-gray-900">
            This itinerary is unavailable
          </p>
          <p className="text-gray-500 mt-1">
            The share link may have been revoked or expired.
          </p>
        </div>
        <Button asChild>
          <Link to="/ref">Plan your own with Junto →</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative bg-white min-h-screen">
      <TripResultsView
        tripId={`share-${token}`}
        planId={null}
        result={data.result}
        onClose={() => navigate(`/share/${token}`)}
        onRegenerate={() => navigate("/ref")}
        readOnly
        standalone
      />

      {/* Footer CTA + last updated */}
      <div className="border-t border-gray-100 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-8 text-center space-y-4">
          <p className="text-sm text-gray-500">Inspired? Build your own group trip.</p>
          <Button asChild size="lg" className="bg-teal-600 hover:bg-teal-700">
            <Link to="/ref">Plan your own with Junto →</Link>
          </Button>
          <p className="text-xs text-gray-400">
            Last updated {format(new Date(data.last_updated), "MMM d, yyyy 'at' HH:mm")}
          </p>
        </div>
      </div>
    </div>
  );
}

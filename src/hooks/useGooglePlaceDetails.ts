import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PlaceDetails {
  photos: string[];
  reviews: { author: string; rating: number; text: string; time: string }[];
  rating: number | null;
  totalRatings: number | null;
  googleMapsUrl: string | null;
  address: string | null;
  cached?: boolean;
}

export function useGooglePlaceDetails(activityName: string, location: string) {
  const query = `${activityName} ${location}`.trim();
  const enabled = query.length > 2;

  const { data, isLoading } = useQuery<PlaceDetails>({
    queryKey: ["place-details", activityName, location],
    enabled,
    staleTime: 24 * 60 * 60 * 1000, // 24h
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-place-details", {
        body: { query },
      });
      if (error) throw error;
      return data as PlaceDetails;
    },
  });

  return {
    photos: data?.photos ?? [],
    reviews: data?.reviews ?? [],
    rating: data?.rating ?? null,
    totalRatings: data?.totalRatings ?? null,
    googleMapsUrl: data?.googleMapsUrl ?? null,
    isLoading: enabled && isLoading,
  };
}

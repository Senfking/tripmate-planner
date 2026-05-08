import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GooglePriceLevel =
  | "PRICE_LEVEL_FREE"
  | "PRICE_LEVEL_INEXPENSIVE"
  | "PRICE_LEVEL_MODERATE"
  | "PRICE_LEVEL_EXPENSIVE"
  | "PRICE_LEVEL_VERY_EXPENSIVE";

interface PlaceDetails {
  photos: string[];
  reviews: { author: string; rating: number; text: string; time: string }[];
  rating: number | null;
  totalRatings: number | null;
  googleMapsUrl: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  priceLevel: GooglePriceLevel | null;
}

/**
 * Optional flags so callers can opt out of the runtime `get-place-details`
 * fetch when the data is already on the activity record. Keeps trip-card
 * renders cheap by avoiding a round-trip + Google Places quota burn for
 * every visible activity.
 */
export interface UseGooglePlaceDetailsOptions {
  /**
   * When false, the underlying React Query is disabled (no fetch, no cache
   * read). Defaults to true to preserve callers that didn't pass anything.
   * Set to false from cards that have already resolved a hero from
   * `activity.photos[0]` via `hasBackendActivityPhoto`.
   */
  enabled?: boolean;
}

export function useGooglePlaceDetails(
  activityName: string,
  location: string,
  options: UseGooglePlaceDetailsOptions = {},
) {
  const query = `${activityName} ${location}`.trim();
  const optEnabled = options.enabled ?? true;
  const enabled = optEnabled && !!activityName && activityName.length > 2;

  const { data, isLoading } = useQuery<PlaceDetails>({
    queryKey: ["place-details", activityName, location],
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
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
    latitude: data?.latitude ?? null,
    longitude: data?.longitude ?? null,
    priceLevel: (data?.priceLevel as GooglePriceLevel) ?? null,
    isLoading: enabled && isLoading,
  };
}

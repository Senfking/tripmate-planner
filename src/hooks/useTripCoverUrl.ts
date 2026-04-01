import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds
const STALE_TIME = 6 * 24 * 60 * 60 * 1000; // 6 days in ms
const GC_TIME = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

export const tripCoverUrlKey = (tripId: string, path: string | null) =>
  ["trip-cover-url", tripId, path] as const;

/**
 * Fetches and caches a signed URL for a trip's custom cover image.
 * Uses a long staleTime so the URL (and thus the browser's image cache) stays stable.
 */
export function useTripCoverUrl(tripId: string | undefined, coverImagePath: string | null) {
  return useQuery({
    queryKey: tripCoverUrlKey(tripId ?? "", coverImagePath),
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("trip-attachments")
        .createSignedUrl(coverImagePath!, SIGNED_URL_EXPIRY);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!tripId && !!coverImagePath,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}

/**
 * Seed the React Query cache with signed URLs fetched in a batch.
 * Call this after bulk-fetching signed URLs in the trip list query.
 */
export function useSeedTripCoverUrls() {
  const qc = useQueryClient();

  return (entries: { tripId: string; coverImagePath: string; signedUrl: string }[]) => {
    for (const { tripId, coverImagePath, signedUrl } of entries) {
      qc.setQueryData(tripCoverUrlKey(tripId, coverImagePath), signedUrl, {
        updatedAt: Date.now(),
      });
    }
  };
}

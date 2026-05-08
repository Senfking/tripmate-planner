// Activity hero photo resolution helper.
//
// Background: trip-generation already mirrors a Google Place photo into
// Supabase Storage and writes the public URL to `activity.photos[0]`
// (see supabase/functions/generate-trip-itinerary/index.ts hydrateActivity).
// Cards previously ignored that field and re-fetched photos at render time
// via `useGooglePlaceDetails(activity.title, activity.location_name)` — a
// `get-place-details` edge function call that does a Google Text Search on
// the activity TITLE. Long descriptive titles ("BLING — Exclusive Night
// Club at FIVE Palm Jumeirah") miss the title search and the edge function
// caches the empty miss for 30 days, leaving the card with no hero photo.
//
// Fix: prefer the backend-mirrored Storage URL (place_id-correct,
// deterministic, free to render) and only fall back to the runtime hook
// when the activity record has no photos. Exposed as a tiny pure helper
// so ActivityCard, DaySection, and ResultsMap can share the resolution
// rule and stay in lockstep.

export interface PhotoLikeActivity {
  photos?: string[] | null;
}

/**
 * Returns the URL of the backend-mirrored hero photo if present, else null.
 * Tolerant of nullish inputs so callers don't need to gate on `activity?`.
 */
export function backendActivityPhoto(activity: PhotoLikeActivity | null | undefined): string | null {
  if (!activity) return null;
  const photos = activity.photos;
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const first = photos[0];
  return typeof first === "string" && first.length > 0 ? first : null;
}

/**
 * True iff the backend-mirrored hero photo is present. Use this to gate
 * `useGooglePlaceDetails` so we don't fire the runtime `get-place-details`
 * edge function (and incur Google Places quota) when we already have a
 * usable hero. The hook still runs when this is false, so we keep the
 * fallback for older trips that pre-date the photo-mirror code path.
 */
export function hasBackendActivityPhoto(activity: PhotoLikeActivity | null | undefined): boolean {
  return backendActivityPhoto(activity) !== null;
}

/**
 * Affiliate link helpers.
 *
 * Frontend-only — these don't touch any backend cache or stored plan data.
 * The CTA is computed at render time per activity, so changes here take effect
 * for every existing trip on next load (no regeneration required).
 */

/**
 * Categories where a GetYourGuide CTA makes sense — paid attractions, tours,
 * and outdoor experiences GYG actually sells inventory for.
 *
 * The spec lists `culture | experience | nature_outdoor`, but the live
 * category enum (see categoryColors.ts) uses more granular values. Map the
 * spec's intent onto the real values: cultural sites, attractions, nature/
 * outdoor activities, and adventure sports.
 *
 * Explicitly excluded: food / restaurant / cafe / bar / nightlife / shopping
 * / transport / accommodation / wellness / spa — GYG isn't the right channel
 * for those.
 */
const GYG_ELIGIBLE_CATEGORIES = new Set([
  "culture",
  "museum",
  "history",
  "attraction",
  "nature",
  "park",
  "adventure",
  "sport",
  "activity",
  // Spec values — kept in case the category enum evolves to include these.
  "experience",
  "nature_outdoor",
]);

interface GygEligibilityInput {
  category?: string | null;
  estimated_cost_per_person?: number | null;
  // Spec asks for place_id; the AIActivity type doesn't expose one, so we
  // accept any of the "real place" signals the backend hydrates.
  place_id?: string | null;
  google_maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function isGetYourGuideEligible(activity: GygEligibilityInput): boolean {
  const category = (activity.category || "").toLowerCase();
  if (!GYG_ELIGIBLE_CATEGORIES.has(category)) return false;

  const cost = activity.estimated_cost_per_person ?? 0;
  if (!(cost > 0)) return false;

  // "Real place" signal — at least one of place_id, a Google Maps URL, or
  // resolved coordinates. Without this we'd be sending the user off to a GYG
  // search for a name the LLM made up.
  const hasPlaceSignal =
    !!activity.place_id ||
    !!activity.google_maps_url ||
    (typeof activity.latitude === "number" && typeof activity.longitude === "number");
  return hasPlaceSignal;
}

/**
 * Build a GetYourGuide search URL for an activity.
 *
 * partner_id is read from VITE_GYG_PARTNER_ID at build time. It's an affiliate
 * ID, not a secret, so exposing it in the client bundle is fine. When the env
 * var is unset (local dev without affiliate config), the param is omitted —
 * the link still works, it just doesn't attribute clicks.
 */
export function buildGetYourGuideUrl(activityTitle: string, destinationName?: string | null): string {
  const partnerId = import.meta.env.VITE_GYG_PARTNER_ID as string | undefined;
  const query = [activityTitle, destinationName].filter(Boolean).join(" ").trim();
  const params = new URLSearchParams();
  params.set("q", query);
  if (partnerId) params.set("partner_id", partnerId);
  return `https://www.getyourguide.com/s/?${params.toString()}`;
}

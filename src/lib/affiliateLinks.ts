/**
 * Affiliate link helpers.
 *
 * Frontend-only — these don't touch any backend cache or stored plan data.
 * The CTA is computed at render time per activity, so changes here take effect
 * for every existing trip on next load (no regeneration required).
 */

/**
 * Categories where a GetYourGuide CTA makes sense — paid attractions and
 * museums GYG actually sells inventory for.
 *
 * Used only as a legacy fallback for stored trips that pre-date the
 * backend's `booking_partner` field. New trips defer entirely to the
 * backend's place_types-based decision (see
 * supabase/functions/generate-trip-itinerary/affiliate-partner.ts).
 *
 * Explicitly excluded categories for legacy trips: food / restaurant / cafe
 * / bar / nightlife / shopping / transport / accommodation / wellness / spa,
 * plus the loose buckets `activity`, `sport`, `experience`, `nature`,
 * `nature_outdoor`, `park`, `adventure` — GYG sells almost nothing in those
 * buckets and they were the cause of beach/pool/lounge venues showing a
 * wrong "Book on GetYourGuide" CTA in production.
 */
const GYG_ELIGIBLE_CATEGORIES = new Set([
  "culture",
  "museum",
  "history",
  "attraction",
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
  // Backend-assigned partner from generate-trip-itinerary's partnerForPlace().
  // When present, it is the source of truth — the category fallback is only
  // consulted for legacy trips generated before the field existed.
  booking_partner?: string | null;
}

export function isGetYourGuideEligible(activity: GygEligibilityInput): boolean {
  // Trust the backend when it has spoken. partnerForPlace() applies the
  // strict place_types rules (museum/aquarium/etc. AND no food/drink/lodging
  // overlap); overriding it here is what caused beach clubs and pool clubs
  // to show a GYG CTA despite the backend correctly assigning google_maps.
  const partner = (activity.booking_partner ?? "").toLowerCase();
  if (partner) return partner === "getyourguide";

  // Legacy fallback for trips stored before booking_partner was emitted.
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

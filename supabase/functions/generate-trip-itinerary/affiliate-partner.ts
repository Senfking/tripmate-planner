// Affiliate-partner routing for Places-backed activities.
//
// GetYourGuide only sells inventory for paid attractions: museums, aquariums,
// theme/amusement/water parks, observation decks, art galleries, zoos, and
// genuine "tourist_attraction" sites. It does NOT sell beach clubs, pool
// clubs, restaurants, bars, lounges, nightclubs, spas, or hotels — sending
// users to a GYG search for those venues lands on an irrelevant results page
// and breaks trust. Google Places routinely tags hybrid venues (e.g. a beach
// club whose primary draw is its restaurant + pool) with attraction-adjacent
// types like sports_activity_location, so a venue must (a) carry an explicit
// GYG-eligible type AND (b) lack any food/drink/lodging/wellness type before
// we route it to GYG. Everything else falls through to Google Maps with the
// venue's googleMapsUri — never an LLM-built link.

export type AffiliatePartner =
  | "booking"
  | "viator"
  | "getyourguide"
  | "google_maps"
  | "event_direct";

export const LODGING_TYPES: ReadonlySet<string> = new Set([
  "lodging",
  "hotel",
  "resort_hotel",
  "motel",
  "guest_house",
  "bed_and_breakfast",
  "hostel",
  "extended_stay_hotel",
]);

// Place types where GYG genuinely sells bookable inventory. Conservative by
// design — anything not on this list falls through to google_maps.
export const GYG_INCLUDE_TYPES: ReadonlySet<string> = new Set([
  "tourist_attraction",
  "museum",
  "aquarium",
  "amusement_park",
  "water_park",
  "zoo",
  "art_gallery",
  "historical_landmark",
  "observation_deck",
  "theme_park",
]);

// Disqualifying types: even if a place also carries a GYG-eligible type, the
// presence of any of these means GYG isn't the right channel. Hotels with
// attached restaurants are handled separately by the LODGING_TYPES gate
// (lodging wins outright).
export const GYG_EXCLUDE_TYPES: ReadonlySet<string> = new Set([
  "restaurant",
  "food",
  "cafe",
  "bakery",
  "bar",
  "night_club",
  "lounge_bar",
  "swimming_pool",
  "beach_club",
  "spa",
  "gym",
  "shopping_mall",
  "lodging",
  "hotel",
  "resort_hotel",
]);

export interface PartnerLookupPlace {
  types?: string[] | null;
  googleMapsUri?: string | null;
}

// Decision precedence:
//   1. Any LODGING_TYPES match -> "booking" (hotels with restaurants attached
//      stay with Booking — lodging wins outright).
//   2. Any GYG_INCLUDE_TYPES match AND no GYG_EXCLUDE_TYPES match -> "getyourguide".
//   3. Otherwise -> "google_maps" (food/drink/nightlife/wellness venues, plus
//      anything we can't confidently route to a paid affiliate).
export function partnerForPlace(place: PartnerLookupPlace): AffiliatePartner {
  const types = place.types ?? [];
  for (const t of types) if (LODGING_TYPES.has(t)) return "booking";

  let hasGygInclude = false;
  let hasGygExclude = false;
  for (const t of types) {
    if (GYG_INCLUDE_TYPES.has(t)) hasGygInclude = true;
    if (GYG_EXCLUDE_TYPES.has(t)) hasGygExclude = true;
  }
  if (hasGygInclude && !hasGygExclude) return "getyourguide";

  return "google_maps";
}

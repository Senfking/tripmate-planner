// Realistic-experience cost bands and the non-lodging clamp.
//
// Background: clampCostPerPerson used to live entirely inside index.ts and
// kept these tables locked behind the Deno.serve module load. Phase-1.1
// production had three pricing problems specific to premium-tier trips
// in expensive markets (Dubai/Ibiza/NYC):
//   1. The realistic-floor adjustment had a 15% slack (`floor * 0.85`)
//      that let LLM under-quotes squeak through unbumped.
//   2. tierMultiplier was applied to ceilings only, leaving the floor
//      pinned to "neighborhood" values even when the trip was premium.
//   3. Beach clubs (typed `swimming_pool` by Google for Cove Beach et al.)
//      had no dedicated band and fell through to `restaurant` [22, 55].
// Fix 4 extracted the pure tables + math here for unit testing.
//
// Phase-1.2 ("city engine") layered three structural additions on top:
//   ADD-1: CITY_COST_MULTIPLIER — relative cost of operating in a city.
//          Applied to BOTH floor and ceiling BEFORE tier multiplier.
//   ADD-2: VENUE_NAME_PRICE_SIGNALS — venue-name regex → minimum EUR floor
//          (post-city-multiplier). Lifts the floor when the place_type
//          band is too generic (a "Beach Club" typed as restaurant).
//   ADD-3: DURATION scaling — activities longer than the category-typical
//          duration scale the LLM-emitted cost up (capped at 2.0x).
//
// The lodging path stays in index.ts — it depends on hotel-estimate
// Haiku calls and destination baselines that don't fit in a pure module.

export type BudgetTier = "budget" | "mid-range" | "premium";

// EUR experience cost ranges per Google place_type. Resolution order
// inside lookupExperienceBandEur:
//   1. Place type (more specific — wine_bar in a nightlife slot uses
//      the wine_bar band, not the generic nightlife band).
//   2. Slot type (used for meal slots and downtime where the place_type
//      gives no extra signal).
//   3. null (caller skips floor/ceiling adjustment).
//
// FIX 4-C: beach_club / swimming_pool added at the top of the table.
// Cove Beach (Dubai) and similar venues type as `swimming_pool` in
// Google's data; without a dedicated band they cascade to restaurant
// [22, 55]. The new band [80, 220] reflects real beach-club brunch +
// dayclub spend (€80 entry on a quiet day; €200+ on a marquee Saturday
// with Champagne service).
export const EXPERIENCE_COST_BAND_EUR_PLACE: ReadonlyArray<{ match: RegExp; range: readonly [number, number] }> = [
  { match: /beach_club|swimming_pool/i,                      range: [80, 220] },
  { match: /night_club/i,                                    range: [35, 90] },
  { match: /wine_bar|cocktail/i,                             range: [30, 60] },
  { match: /bar(?!ber)/i,                                    range: [18, 40] },
  { match: /spa|hair_care|beauty_salon/i,                    range: [50, 200] },
  { match: /museum|art_gallery/i,                            range: [12, 35] },
  { match: /amusement_park|aquarium|zoo/i,                   range: [25, 60] },
  { match: /tourist_attraction|landmark|church|mosque|temple|historical_landmark/i,
                                                              range: [8, 30] },
  { match: /park|natural_feature/i,                          range: [0, 10] },
  { match: /cafe|bakery|coffee/i,                            range: [4, 12] },
  { match: /restaurant/i,                                    range: [22, 55] },
];

export const EXPERIENCE_COST_BAND_EUR_SLOT: Readonly<Record<string, readonly [number, number]>> = {
  breakfast: [6, 18],
  lunch: [18, 45],
  dinner: [30, 80],
  rest: [0, 0],
  arrival: [0, 15],
  departure: [0, 15],
  transit_buffer: [0, 10],
};

// Resolves the EUR (floor, ceiling) tuple for a (slot, placeTypes) combo.
// Returns null when no entry matches (caller skips the floor/ceiling
// adjustment and accepts the LLM value as-is).
export function lookupExperienceBandEur(
  slotType: string,
  placeTypes: ReadonlyArray<string> | null | undefined,
): readonly [number, number] | null {
  if (placeTypes && placeTypes.length > 0) {
    const joined = placeTypes.join(" ");
    for (const e of EXPERIENCE_COST_BAND_EUR_PLACE) {
      if (e.match.test(joined)) return e.range;
    }
  }
  return EXPERIENCE_COST_BAND_EUR_SLOT[slotType] ?? null;
}

// ---------------------------------------------------------------------------
// ADD-1: City cost-of-living multipliers
// ---------------------------------------------------------------------------
// Multiplier vs. EUR baseline of operating costs in a city. Applied to BOTH
// floor and ceiling BEFORE tier multiplier — represents what a venue COSTS
// to run, independent of whether the trip is budget/mid/premium.
//
// Numbers are deliberately discrete (5 tiers + default) so we can audit and
// reason about them. Default 1.0 for unknown cities preserves legacy
// behavior on destinations the map doesn't cover.
export const CITY_COST_MULTIPLIER: Readonly<Record<string, number>> = {
  // Tier 4 — most expensive global cities.
  "zurich": 2.2, "geneva": 2.2, "monaco": 2.5, "oslo": 2.0,
  // Tier 3 — major luxury / financial hubs.
  "dubai": 1.7, "london": 1.7, "new york": 1.7, "san francisco": 1.7,
  "tokyo": 1.5, "paris": 1.5, "sydney": 1.5, "copenhagen": 1.6, "reykjavik": 1.7,
  // Tier 2 — high cost-of-living western cities.
  "berlin": 1.2, "barcelona": 1.2, "amsterdam": 1.3, "los angeles": 1.4,
  "miami": 1.4, "milan": 1.3, "vienna": 1.2,
  // Tier 1 — EUR baseline.
  "madrid": 1.0, "lisbon": 1.0, "rome": 1.1, "prague": 0.9, "athens": 0.9, "krakow": 0.7,
  // Tier 0 — cheap markets.
  "bangkok": 0.5, "ho chi minh city": 0.5, "mexico city": 0.7, "marrakech": 0.7, "bali": 0.5,
};

// Pre-sort by length descending so longer keys ("ho chi minh city") win
// over shorter substrings ("city"). Stable order — built once at module
// load.
const CITY_KEYS_BY_LENGTH = Object.keys(CITY_COST_MULTIPLIER).sort((a, b) => b.length - a.length);

// Resolve a city name (e.g. "Dubai", "Dubai, UAE", "Tokyo, Japan") to a
// multiplier. Exact match first, then substring. Returns 1.0 for unknown
// or empty inputs — never throws, so callers don't have to guard.
export function lookupCityMultiplier(cityName: string | null | undefined): number {
  if (!cityName) return 1.0;
  const lower = cityName.toLowerCase().trim();
  if (lower.length === 0) return 1.0;
  if (lower in CITY_COST_MULTIPLIER) return CITY_COST_MULTIPLIER[lower];
  for (const key of CITY_KEYS_BY_LENGTH) {
    if (lower.includes(key)) return CITY_COST_MULTIPLIER[key];
  }
  return 1.0;
}

// ---------------------------------------------------------------------------
// ADD-2: Venue-name pattern signals
// ---------------------------------------------------------------------------
// A Google place_type alone is too coarse: "Bohemia Beach Club" types as
// restaurant + beach_club, but a venue named only "restaurant" with
// "Caesars" or "Marriott Resort" in the title is operating at hotel-grade
// pricing. These regex patterns lift the floor when the venue name carries
// a stronger price signal than the place_type alone.
//
// minFloorEur is the EUR base; lookups multiply by the city multiplier, so
// a beach-club minimum of 100 in Dubai becomes 170, in Bangkok 50.
//
// minLodgingFloorEur applies only when the slot is lodging — luxury hotel
// chains ("Aman", "Four Seasons") imply a much higher per-night floor than
// the same brand operating an in-house restaurant or bar.
export interface VenueNamePriceSignal {
  match: RegExp;
  minFloorEur: number;
  // Optional override applied on the lodging clamp path. Falls back to
  // minFloorEur when omitted.
  minLodgingFloorEur?: number;
}

export const VENUE_NAME_PRICE_SIGNALS: ReadonlyArray<VenueNamePriceSignal> = [
  // Beach-club / day-club brunches and pool dayparties — anchor experiences.
  { match: /\bbeach club\b|\bday club\b/i, minFloorEur: 100 },
  // Rooftop / sky bars carry a view premium even when typed as plain bar.
  { match: /\brooftop bar\b|\bsky bar\b|\bsky lounge\b/i, minFloorEur: 40 },
  // Fine-dining signals — Michelin / chef's-table / tasting-menu / omakase.
  { match: /\bmichelin\b|chef.s table|tasting menu|omakase/i, minFloorEur: 120 },
  // Speakeasy / cocktail bar — slightly elevated vs the generic bar band.
  { match: /\bspeakeasy\b|\bcocktail bar\b/i, minFloorEur: 30 },
  // Luxury hotel chain names — venues at these hotels run premium even when
  // typed as restaurant/bar; the hotel itself uses the lodging floor.
  {
    match: /five palm|atlantis|burj al arab|caesars|marriott resort|four seasons|fairmont|st\.?\s*regis|\baman\b|\britz\b/i,
    minFloorEur: 80,
    minLodgingFloorEur: 180,
  },
  // Pool / cabana / day-pass language — same anchor-experience signal as
  // beach club, even when the place_type is generic.
  { match: /infinity pool|private cabana|day pass/i, minFloorEur: 100 },
];

// Returns the highest matching minFloor (EUR) for venueTitle, or null when
// no pattern matches. Iterates all entries and takes the max so a venue
// like "Caesars Beach Club" that hits two patterns lifts to the more
// expensive of the two.
export function lookupVenueNameFloorEur(
  venueTitle: string | null | undefined,
  isLodging: boolean = false,
): number | null {
  if (!venueTitle) return null;
  let max: number | null = null;
  for (const e of VENUE_NAME_PRICE_SIGNALS) {
    if (e.match.test(venueTitle)) {
      const v = isLodging && e.minLodgingFloorEur !== undefined ? e.minLodgingFloorEur : e.minFloorEur;
      if (max === null || v > max) max = v;
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// ADD-3: Duration scaling
// ---------------------------------------------------------------------------
// A category band is calibrated to the typical visit length (90 min for
// restaurant, 180 min for nightclub, etc.). Anchor experiences — 4-hour
// beach-club brunches, all-day spa retreats — outrun those defaults and
// the LLM tends to quote the "typical visit" price even when the slot
// allocation is double the typical.
//
// Scaling kicks in only above 1.5x typical (so a 1-hour bar visit at a 90-
// min typical category stays at base). Capped at 2.0x to avoid runaway
// prices on genuinely all-day activities (which usually have explicit
// pricing the LLM emits directly).
export const DURATION_TYPICAL_BY_PLACE: ReadonlyArray<{ match: RegExp; typicalMinutes: number }> = [
  { match: /night_club/i,                                 typicalMinutes: 180 },
  { match: /beach_club|swimming_pool/i,                   typicalMinutes: 90 },
  { match: /wine_bar|cocktail/i,                          typicalMinutes: 90 },
  { match: /bar(?!ber)/i,                                 typicalMinutes: 90 },
  { match: /spa|hair_care|beauty_salon/i,                 typicalMinutes: 60 },
  { match: /restaurant|cafe|bakery|coffee/i,              typicalMinutes: 90 },
  { match: /museum|art_gallery|tourist_attraction|landmark|amusement_park|aquarium|zoo|park|natural_feature/i,
                                                          typicalMinutes: 90 },
];

// Slot-type fallback when no place_type matches.
const DURATION_TYPICAL_BY_SLOT: Readonly<Record<string, number>> = {
  nightlife: 180,
  breakfast: 60,
  lunch: 90,
  dinner: 90,
};

export function lookupTypicalDurationMinutes(
  slotType: string,
  placeTypes: ReadonlyArray<string> | null | undefined,
): number {
  if (placeTypes && placeTypes.length > 0) {
    const joined = placeTypes.join(" ");
    for (const e of DURATION_TYPICAL_BY_PLACE) {
      if (e.match.test(joined)) return e.typicalMinutes;
    }
  }
  return DURATION_TYPICAL_BY_SLOT[slotType] ?? 90;
}

// Compute the duration scale factor for the LLM-emitted cost.
//   <= 1.5x typical → 1.0 (no change).
//   > 1.5x typical → 1 + (extra / typical) * 0.5, capped at 2.0.
// extra = duration - typical (NOT duration - 1.5*typical).
export function durationScale(
  typicalMinutes: number,
  durationMinutes: number | null | undefined,
): number {
  if (
    typicalMinutes <= 0
    || !durationMinutes
    || !Number.isFinite(durationMinutes)
    || durationMinutes <= 0
  ) {
    return 1.0;
  }
  if (durationMinutes <= typicalMinutes * 1.5) return 1.0;
  const extra = durationMinutes - typicalMinutes;
  const scale = 1 + (extra / typicalMinutes) * 0.5;
  return Math.min(scale, 2.0);
}

// Google priceLevel enum → multiplier on top of the EUR band's ceiling.
export function priceLevelMultiplier(priceLevel: string | null): number {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":           return 0;
    case "PRICE_LEVEL_INEXPENSIVE":    return 0.7;
    case "PRICE_LEVEL_MODERATE":       return 1.0;
    case "PRICE_LEVEL_EXPENSIVE":      return 1.5;
    case "PRICE_LEVEL_VERY_EXPENSIVE": return 2.5;
    default:                           return 1.0;
  }
}

// Trip-level tier multiplier. Used for both ceiling AND floor on premium
// (FIX 4-B); historical behavior left floor unmultiplied which pinned
// premium-tier floors to neighborhood values.
export function tierMultiplier(tier: BudgetTier): number {
  if (tier === "budget") return 0.75;
  if (tier === "premium") return 1.4;
  return 1.0;
}

// Compute the realistic floor + ceiling in trip currency. Returns null
// when the (slot, types) combo has no band entry — caller skips the
// floor/ceiling adjustment.
//
// Application order (Phase-1.2):
//   1. eurBand from place_type / slot.
//   2. cityMul applied to BOTH floor and ceiling.
//   3. venueNameFloorEur (if any) lifts floor: max(cityFloor, venueMin * cityMul).
//   4. priceLevel multiplier on ceiling (existing).
//   5. tier multiplier on ceiling (always) and on floor (premium only,
//      FIX 4-B).
//   6. fxToLocal converts to trip currency.
export interface RealisticBandInput {
  slotType: string;
  placeTypes: ReadonlyArray<string> | null | undefined;
  priceLevel: string | null;
  budgetTier: BudgetTier;
  fxToLocal: number;
  cityName?: string | null;
  venueTitle?: string | null;
}

export function realisticCostBand(
  inputOrSlot: RealisticBandInput | string,
  // Legacy positional signature kept for backwards compatibility with
  // existing callers and tests. New callers should prefer the
  // RealisticBandInput object form above.
  placeTypes?: ReadonlyArray<string> | null | undefined,
  priceLevel?: string | null,
  budgetTier?: BudgetTier,
  fxToLocal?: number,
): { floor: number; ceiling: number } | null {
  const input: RealisticBandInput = typeof inputOrSlot === "string"
    ? {
      slotType: inputOrSlot,
      placeTypes: placeTypes ?? null,
      priceLevel: priceLevel ?? null,
      budgetTier: budgetTier ?? "mid-range",
      fxToLocal: fxToLocal ?? 1,
    }
    : inputOrSlot;

  const eurBand = lookupExperienceBandEur(input.slotType, input.placeTypes);
  if (!eurBand) return null;
  const [eurFloor, eurCeiling] = eurBand;
  if (eurCeiling === 0) return { floor: 0, ceiling: 0 };

  const cityMul = lookupCityMultiplier(input.cityName);
  let adjFloorEur = eurFloor * cityMul;
  let adjCeilingEur = eurCeiling * cityMul;

  // ADD-2: venue-name floor lift (post city-multiplier).
  const venueMin = lookupVenueNameFloorEur(input.venueTitle, false);
  if (venueMin !== null) {
    const venueFloorEur = venueMin * cityMul;
    if (venueFloorEur > adjFloorEur) adjFloorEur = venueFloorEur;
    // If venue-name lift pushed floor above ceiling (rare — happens when a
    // luxury name lands on a generic museum/bar place_type in a Tier-4 city),
    // raise ceiling to keep the band ordered.
    if (adjCeilingEur < adjFloorEur) adjCeilingEur = adjFloorEur * 1.5;
  }

  const plMul = priceLevelMultiplier(input.priceLevel);
  const tierMul = tierMultiplier(input.budgetTier);
  // Premium tier: floor lifted by tierMul too. Other tiers keep the legacy
  // "wide band" behavior (floor unmultiplied) so we don't accidentally
  // over-clamp legitimate budget surprises.
  const floorTierMul = input.budgetTier === "premium" ? tierMul : 1;
  return {
    floor: Math.round(adjFloorEur * input.fxToLocal * floorTierMul),
    ceiling: Math.round(adjCeilingEur * input.fxToLocal * plMul * tierMul),
  };
}

// Re-implementation of clampCostPerPerson's non-lodging realistic-band
// path as a pure function. The full clampCostPerPerson in index.ts still
// owns the lodging branch, the destination-baseline branch, and the
// priceLevel ceiling-band step; it delegates THIS step to the helper
// below so the maths is testable without spinning up Deno.serve.
//
// FIX 4-A: the floor-tolerance slack (`floor * 0.85`) is dropped on
// premium tier. Premium-tier under-quotes get bumped to mid-band even
// when only ~15% under floor.
//
// ADD-2 interaction: when a venue-name signal fired, the lifted floor is
// the binding minimum — slack is dropped regardless of tier so the bump
// fires cleanly. Without this, a non-premium "Bohemia Beach Club" with
// the LLM 14% under the lifted floor would still slip through.
//
// ADD-3: durationScale multiplies the LLM-emitted cost BEFORE the
// floor/ceiling comparison. A 4-hour beach club with an in-band LLM
// quote scales up; an out-of-band quote still gets bumped to mid-band of
// the (un-scaled) realistic band. Keeps the bumped-target deterministic
// while letting reasonable LLM emits scale with the actual time spent.
export interface ClampNonLodgingInput {
  llmCost: number;
  slotType: string;
  placeTypes: ReadonlyArray<string> | null | undefined;
  priceLevel: string | null;
  budgetTier: BudgetTier;
  fxToLocal: number;
  cityName?: string | null;
  venueTitle?: string | null;
  durationMinutes?: number | null;
}

export interface ClampNonLodgingResult {
  cost: number;
  // For test/observability: which adjustment fired.
  action: "passthrough" | "floor_bumped" | "ceiling_capped" | "skip_floor_safe";
}

export function clampNonLodgingExperienceCost(input: ClampNonLodgingInput): ClampNonLodgingResult {
  let { llmCost } = input;
  if (!Number.isFinite(llmCost) || llmCost < 0) llmCost = 0;
  const {
    slotType, placeTypes, priceLevel, budgetTier, fxToLocal,
    cityName, venueTitle, durationMinutes,
  } = input;

  const realistic = realisticCostBand({
    slotType, placeTypes, priceLevel, budgetTier, fxToLocal, cityName, venueTitle,
  });
  if (!realistic || realistic.ceiling <= 0) {
    return { cost: Math.max(0, Math.round(llmCost)), action: "passthrough" };
  }

  // ADD-3: scale the LLM cost by duration before comparing to the band.
  const typical = lookupTypicalDurationMinutes(slotType, placeTypes);
  const dScale = durationScale(typical, durationMinutes ?? null);
  const scaledLlm = llmCost * dScale;

  // Free-coded place types with unknown priceLevel skip the floor bump
  // (mirrors the in-place `skipFloor` guard in clampCostPerPerson).
  const idx = priceLevelToIndex(priceLevel);
  const skipFloor = idx < 0 && /park|natural_feature|tourist_attraction|landmark|church|mosque|temple|historical_landmark/i.test(
    (placeTypes ?? []).join(" "),
  );

  // Slack rules:
  //   - premium tier: drop slack entirely (FIX 4-A).
  //   - venue-name match: drop slack — the lifted floor is the binding
  //     minimum and we want sub-floor LLM emits bumped cleanly.
  //   - otherwise: keep legacy 0.85 slack so honest budget surprises
  //     don't get over-clamped.
  const venueNameMatched = lookupVenueNameFloorEur(venueTitle, false) !== null;
  const tolerated = (budgetTier === "premium" || venueNameMatched)
    ? realistic.floor
    : realistic.floor * 0.85;

  if (!skipFloor && scaledLlm < tolerated) {
    const target = Math.round((realistic.floor + realistic.ceiling) / 2);
    return { cost: Math.max(0, target), action: "floor_bumped" };
  }
  if (scaledLlm > realistic.ceiling * 1.5) {
    return { cost: Math.max(0, Math.round(realistic.ceiling)), action: "ceiling_capped" };
  }
  if (skipFloor && scaledLlm < realistic.floor * 0.85) {
    return { cost: Math.max(0, Math.round(scaledLlm)), action: "skip_floor_safe" };
  }
  return { cost: Math.max(0, Math.round(scaledLlm)), action: "passthrough" };
}

function priceLevelToIndex(level: string | null): number {
  switch (level) {
    case "PRICE_LEVEL_FREE":           return 0;
    case "PRICE_LEVEL_INEXPENSIVE":    return 1;
    case "PRICE_LEVEL_MODERATE":       return 2;
    case "PRICE_LEVEL_EXPENSIVE":      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE": return 4;
    default:                           return -1;
  }
}

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
// This module is the surgical fix: extract the pure tables + math into
// something unit-testable, and apply Fix 4's three sub-fixes (A, B, C)
// in one place. clampCostPerPerson in index.ts now delegates the
// non-lodging realistic-band path to clampNonLodgingExperienceCost here.
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
// FIX 4-B: tierMultiplier now applies to floor as well as ceiling on
// premium tier. A "moderate" floor of €22 for restaurant becomes €31 on a
// premium trip, raising the floor of the LLM-emit clamp range so
// premium-tier dinners don't read as neighborhood spend.
export function realisticCostBand(
  slotType: string,
  placeTypes: ReadonlyArray<string> | null | undefined,
  priceLevel: string | null,
  budgetTier: BudgetTier,
  fxToLocal: number,
): { floor: number; ceiling: number } | null {
  const eurBand = lookupExperienceBandEur(slotType, placeTypes);
  if (!eurBand) return null;
  const [eurFloor, eurCeiling] = eurBand;
  if (eurCeiling === 0) return { floor: 0, ceiling: 0 };
  const plMul = priceLevelMultiplier(priceLevel);
  const tierMul = tierMultiplier(budgetTier);
  // Premium tier: floor lifted by tierMul too. Other tiers keep the
  // legacy "wide band" behavior (floor unmultiplied) so we don't
  // accidentally over-clamp legitimate budget surprises.
  const floorTierMul = budgetTier === "premium" ? tierMul : 1;
  return {
    floor: Math.round(eurFloor * fxToLocal * floorTierMul),
    ceiling: Math.round(eurCeiling * fxToLocal * plMul * tierMul),
  };
}

// Re-implementation of clampCostPerPerson's non-lodging realistic-band
// path (Steps 1 + 2 inside the existing function) as a pure function.
// The full clampCostPerPerson in index.ts still owns the lodging branch,
// the destination-baseline branch, and the priceLevel ceiling-band step;
// it delegates THIS step to the helper below so the maths is testable
// without spinning up Deno.serve.
//
// FIX 4-A: the floor-tolerance slack (`floor * 0.85`) is dropped on
// premium tier. Premium-tier under-quotes get bumped to mid-band even
// when only ~15% under floor, so €18 lunch / €33 nightlife get
// repaired up rather than slipping through.
export interface ClampNonLodgingInput {
  llmCost: number;
  slotType: string;
  placeTypes: ReadonlyArray<string> | null | undefined;
  priceLevel: string | null;
  budgetTier: BudgetTier;
  fxToLocal: number;
}

export interface ClampNonLodgingResult {
  cost: number;
  // For test/observability: which adjustment fired.
  action: "passthrough" | "floor_bumped" | "ceiling_capped" | "skip_floor_safe";
}

export function clampNonLodgingExperienceCost(input: ClampNonLodgingInput): ClampNonLodgingResult {
  let { llmCost } = input;
  if (!Number.isFinite(llmCost) || llmCost < 0) llmCost = 0;
  const { slotType, placeTypes, priceLevel, budgetTier, fxToLocal } = input;
  const realistic = realisticCostBand(slotType, placeTypes, priceLevel, budgetTier, fxToLocal);
  if (!realistic || realistic.ceiling <= 0) {
    return { cost: Math.max(0, Math.round(llmCost)), action: "passthrough" };
  }
  // Free-coded place types with unknown priceLevel skip the floor bump
  // (mirrors the in-place `skipFloor` guard in clampCostPerPerson).
  const idx = priceLevelToIndex(priceLevel);
  const skipFloor = idx < 0 && /park|natural_feature|tourist_attraction|landmark|church|mosque|temple|historical_landmark/i.test(
    (placeTypes ?? []).join(" "),
  );

  // FIX 4-A: drop the 15% slack on premium tier so under-quotes that sit
  // ≤ floor still get bumped.
  const tolerated = budgetTier === "premium" ? realistic.floor : realistic.floor * 0.85;

  if (!skipFloor && llmCost < tolerated) {
    const target = Math.round((realistic.floor + realistic.ceiling) / 2);
    return { cost: Math.max(0, target), action: "floor_bumped" };
  }
  if (llmCost > realistic.ceiling * 1.5) {
    return { cost: Math.max(0, Math.round(realistic.ceiling)), action: "ceiling_capped" };
  }
  if (skipFloor && llmCost < realistic.floor * 0.85) {
    return { cost: Math.max(0, Math.round(llmCost)), action: "skip_floor_safe" };
  }
  return { cost: Math.max(0, Math.round(llmCost)), action: "passthrough" };
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

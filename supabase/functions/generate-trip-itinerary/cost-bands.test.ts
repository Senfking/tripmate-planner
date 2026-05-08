// Run with:
//   deno test supabase/functions/generate-trip-itinerary/cost-bands.test.ts
//
// Covers Fix 4 (premium pricing) — A/B/C sub-fixes:
//   A. Tighter floor slack on premium tier (drop 0.85 multiplier)
//   B. Apply tierMultiplier to BOTH floor and ceiling on premium
//   C. Add beach_club / swimming_pool band [80, 220] EUR
//
// EUR is the canonical band currency; the FX multiplier converts to
// the trip's local currency. Tests use fxToLocal=1 (EUR-quoted trip)
// for readability and EUR PRICE_BANDS values match index.ts.

import {
  EXPERIENCE_COST_BAND_EUR_PLACE,
  clampNonLodgingExperienceCost,
  lookupExperienceBandEur,
  priceLevelMultiplier,
  realisticCostBand,
  tierMultiplier,
} from "./cost-bands.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

function assertEqual<T>(a: T, b: T, msg: string): void {
  if (a !== b) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
  }
}

const FX_EUR = 1; // EUR-quoted trip; numbers stay readable.

// ---------------------------------------------------------------------------
// FIX 4-C — beach_club / swimming_pool band
// ---------------------------------------------------------------------------

Deno.test("FIX 4-C: beach_club entry exists at the top of EXPERIENCE_COST_BAND_EUR_PLACE", () => {
  // Order matters — beach_club must come BEFORE restaurant so a venue
  // typed as both ("restaurant", "beach_club") matches beach_club first.
  const bcIdx = EXPERIENCE_COST_BAND_EUR_PLACE.findIndex((e) => e.match.test("beach_club"));
  const restIdx = EXPERIENCE_COST_BAND_EUR_PLACE.findIndex((e) => e.match.test("restaurant"));
  assert(bcIdx >= 0, "beach_club entry exists");
  assert(restIdx >= 0, "restaurant entry exists");
  assert(bcIdx < restIdx, `beach_club (idx ${bcIdx}) must come before restaurant (idx ${restIdx})`);
});

Deno.test("FIX 4-C: swimming_pool place_type matches the beach_club band", () => {
  // Cove Beach (Dubai) types as swimming_pool — the canonical case.
  const band = lookupExperienceBandEur("afternoon_major", ["swimming_pool", "establishment"]);
  assert(band !== null, "swimming_pool returns a band");
  assertEqual(band![0], 80, "floor=80 EUR");
  assertEqual(band![1], 220, "ceiling=220 EUR");
});

Deno.test("FIX 4-C: explicit beach_club tag also matches the band", () => {
  const band = lookupExperienceBandEur("lunch", ["beach_club"]);
  assertEqual(band![0], 80, "floor=80");
  assertEqual(band![1], 220, "ceiling=220");
});

// ---------------------------------------------------------------------------
// FIX 4-B — tierMultiplier applies to floor on premium tier
// ---------------------------------------------------------------------------

Deno.test("FIX 4-B: premium tier lifts the floor by tierMultiplier (1.4x)", () => {
  // restaurant band [22, 55] EUR. Premium tier should produce a floor of
  // round(22 * 1 * 1.4) = 31, not 22.
  const band = realisticCostBand("dinner", ["restaurant"], null, "premium", FX_EUR);
  assert(band !== null, "band returned");
  assertEqual(band!.floor, Math.round(22 * 1.4), "premium floor lifted");
});

Deno.test("FIX 4-B: mid-range tier keeps the legacy un-lifted floor", () => {
  const band = realisticCostBand("dinner", ["restaurant"], null, "mid-range", FX_EUR);
  assert(band !== null, "band returned");
  assertEqual(band!.floor, 22, "mid-range floor stays at base");
});

Deno.test("FIX 4-B: budget tier keeps un-lifted floor (no over-clamp regression)", () => {
  const band = realisticCostBand("lunch", ["restaurant"], null, "budget", FX_EUR);
  assert(band !== null, "band returned");
  assertEqual(band!.floor, 22, "budget floor stays at base (no regression)");
});

Deno.test("FIX 4-B: premium ceiling continues to be lifted by both priceLevel and tier", () => {
  // Existing behavior — ceiling: eurCeiling * fx * plMul * tierMul.
  // night_club band [35, 90] EUR; PRICE_LEVEL_VERY_EXPENSIVE plMul=2.5;
  // premium tierMul=1.4. Ceiling = round(90 * 1 * 2.5 * 1.4) = 315.
  const band = realisticCostBand("nightlife", ["night_club"], "PRICE_LEVEL_VERY_EXPENSIVE", "premium", FX_EUR);
  assert(band !== null, "band returned");
  assertEqual(band!.ceiling, 315, "ceiling lifted by both modifiers");
});

// ---------------------------------------------------------------------------
// FIX 4-A — tighter floor slack on premium tier
// ---------------------------------------------------------------------------

Deno.test("FIX 4-A: premium nightclub with €33 LLM emit gets clamped UP (production case)", () => {
  // The exact production failure: BLING (Dubai) emitted at €33 — under
  // the night_club band's premium-lifted floor. Pre-fix, 0.85 slack let
  // it slip through. Post-fix, no slack on premium → bump to mid-band.
  // night_club band [35, 90]; premium floor = round(35 * 1.4) = 49.
  // Premium ceiling (priceLevel null → plMul=1.0) = round(90 * 1 * 1.4) = 126.
  // Mid = round((49 + 126) / 2) = 88.
  const out = clampNonLodgingExperienceCost({
    llmCost: 33,
    slotType: "nightlife",
    placeTypes: ["night_club"],
    priceLevel: null,
    budgetTier: "premium",
    fxToLocal: FX_EUR,
  });
  assertEqual(out.action, "floor_bumped", "floor bump fired");
  assert(out.cost > 33, `cost lifted above 33 (got ${out.cost})`);
  assertEqual(out.cost, Math.round((49 + 126) / 2), "cost is mid-band");
});

Deno.test("FIX 4-A: premium restaurant with €18 emit gets clamped UP", () => {
  // Bohemia Beach Club brunch shipped at €18; should bump even though
  // the LLM value is only ~18% under the lifted floor (would have
  // squeaked through under the legacy 15% slack).
  // restaurant band [22, 55]; premium floor = round(22 * 1.4) = 31.
  // Premium ceiling (priceLevel null) = round(55 * 1 * 1.4) = 77.
  // Mid = round((31 + 77) / 2) = 54.
  const out = clampNonLodgingExperienceCost({
    llmCost: 18,
    slotType: "lunch",
    placeTypes: ["restaurant"],
    priceLevel: null,
    budgetTier: "premium",
    fxToLocal: FX_EUR,
  });
  assertEqual(out.action, "floor_bumped", "floor bump fired");
  assert(out.cost > 18, `cost lifted above 18 (got ${out.cost})`);
  assertEqual(out.cost, Math.round((31 + 77) / 2), "cost is mid-band");
});

Deno.test("FIX 4-A: standard-tier restaurant in band [22, 55] still passes through unmodified", () => {
  // Regression guard: mid-range trips with normal LLM emits stay
  // unchanged. The 0.85 slack still applies — €22 (exactly floor) and
  // anything above passes through.
  const passthrough = (cost: number) =>
    clampNonLodgingExperienceCost({
      llmCost: cost,
      slotType: "dinner",
      placeTypes: ["restaurant"],
      priceLevel: null,
      budgetTier: "mid-range",
      fxToLocal: FX_EUR,
    });
  for (const c of [22, 30, 45, 55]) {
    const out = passthrough(c);
    assertEqual(out.action, "passthrough", `${c} passthrough action`);
    assertEqual(out.cost, c, `${c} unmodified`);
  }
});

Deno.test("FIX 4-A: standard-tier restaurant under 0.85*floor still gets bumped", () => {
  // Regression guard: the legacy floor bump still fires for standard
  // tier under-quotes (mid-range, budget). 0.85 * 22 = 18.7; €15 bumps.
  const out = clampNonLodgingExperienceCost({
    llmCost: 15,
    slotType: "dinner",
    placeTypes: ["restaurant"],
    priceLevel: null,
    budgetTier: "mid-range",
    fxToLocal: FX_EUR,
  });
  assertEqual(out.action, "floor_bumped", "still bumps under legacy slack");
});

// ---------------------------------------------------------------------------
// FIX 4-C in action: beach_club LLM emit gets the new band
// ---------------------------------------------------------------------------

Deno.test("FIX 4-C: premium beach_club at €18 lifts to mid-band of new [80, 220] band", () => {
  // Bohemia "Beach Club Brunch" types as restaurant + beach_club. Beach
  // club rule fires first (it's at the top of the table). Premium floor =
  // round(80 * 1.4) = 112. Premium ceiling = round(220 * 1 * 1.4) = 308.
  // Mid = round((112 + 308) / 2) = 210.
  const out = clampNonLodgingExperienceCost({
    llmCost: 18,
    slotType: "lunch",
    placeTypes: ["beach_club", "restaurant"],
    priceLevel: null,
    budgetTier: "premium",
    fxToLocal: FX_EUR,
  });
  assertEqual(out.action, "floor_bumped", "floor bump fired");
  assert(out.cost >= 120 && out.cost <= 220, `cost in realistic beach-club range (got ${out.cost})`);
});

Deno.test("FIX 4-C: swimming_pool premium gets lifted to beach_club band, not restaurant cascade", () => {
  // Cove Beach typed as swimming_pool only. Pre-fix this fell to the
  // generic restaurant band; post-fix it hits the dedicated beach_club
  // entry.
  const out = clampNonLodgingExperienceCost({
    llmCost: 25,
    slotType: "afternoon_major",
    placeTypes: ["swimming_pool"],
    priceLevel: null,
    budgetTier: "premium",
    fxToLocal: FX_EUR,
  });
  assertEqual(out.action, "floor_bumped", "floor bump fired");
  // Mid-band of premium [112, 308] = 210.
  assertEqual(out.cost, Math.round((Math.round(80 * 1.4) + Math.round(220 * 1 * 1.4)) / 2), "mid of beach_club band");
});

// ---------------------------------------------------------------------------
// Multipliers — quick guard tests so future drift is caught.
// ---------------------------------------------------------------------------

Deno.test("priceLevelMultiplier: known levels round-trip correctly", () => {
  assertEqual(priceLevelMultiplier("PRICE_LEVEL_FREE"), 0, "FREE");
  assertEqual(priceLevelMultiplier("PRICE_LEVEL_INEXPENSIVE"), 0.7, "INEXPENSIVE");
  assertEqual(priceLevelMultiplier("PRICE_LEVEL_MODERATE"), 1.0, "MODERATE");
  assertEqual(priceLevelMultiplier("PRICE_LEVEL_EXPENSIVE"), 1.5, "EXPENSIVE");
  assertEqual(priceLevelMultiplier("PRICE_LEVEL_VERY_EXPENSIVE"), 2.5, "VERY_EXPENSIVE");
  assertEqual(priceLevelMultiplier(null), 1.0, "null defaults to 1");
});

Deno.test("tierMultiplier: budget=0.75, mid-range=1, premium=1.4", () => {
  assertEqual(tierMultiplier("budget"), 0.75, "budget");
  assertEqual(tierMultiplier("mid-range"), 1.0, "mid-range");
  assertEqual(tierMultiplier("premium"), 1.4, "premium");
});

// ---------------------------------------------------------------------------
// Skip-floor safety guard (free-coded landmarks shouldn't get bumped).
// ---------------------------------------------------------------------------

Deno.test("skip-floor: tourist_attraction with unknown priceLevel and €5 LLM emit stays unbumped", () => {
  // Without this safety, "Jemaa el-Fnaa" (free) would be bumped from €5
  // to mid-band. The guard requires both: priceLevel null AND types
  // matching free-coded place pattern. We test with tourist_attraction
  // because its band is [8, 30] — non-zero floor — so the bump WOULD fire
  // without the guard. (park has floor=0 which never triggers the bump.)
  const out = clampNonLodgingExperienceCost({
    llmCost: 5,
    slotType: "afternoon_major",
    placeTypes: ["tourist_attraction"],
    priceLevel: null,
    budgetTier: "mid-range",
    fxToLocal: FX_EUR,
  });
  assertEqual(out.action, "skip_floor_safe", "skipped floor safely");
  assertEqual(out.cost, 5, "preserved LLM value");
});

Deno.test("skip-floor: park with €5 LLM emit passes through (floor=0 never triggers bump)", () => {
  // park band is [0, 10] EUR — the floor of 0 means the floor bump
  // structurally can't fire regardless of slack. Verify the passthrough.
  const out = clampNonLodgingExperienceCost({
    llmCost: 5,
    slotType: "afternoon_major",
    placeTypes: ["park", "natural_feature"],
    priceLevel: null,
    budgetTier: "premium",
    fxToLocal: FX_EUR,
  });
  assertEqual(out.action, "passthrough", "park with floor=0 passes through");
  assertEqual(out.cost, 5, "preserved LLM value");
});

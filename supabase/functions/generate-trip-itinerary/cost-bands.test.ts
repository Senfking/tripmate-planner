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
  CITY_COST_MULTIPLIER,
  EXPERIENCE_COST_BAND_EUR_PLACE,
  VENUE_NAME_PRICE_SIGNALS,
  clampNonLodgingExperienceCost,
  durationScale,
  lookupCityMultiplier,
  lookupExperienceBandEur,
  lookupTypicalDurationMinutes,
  lookupVenueNameFloorEur,
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

// ===========================================================================
// Phase-1.2 "city engine" — ADD-1, ADD-2, ADD-3
// ===========================================================================

// ---------------------------------------------------------------------------
// ADD-1: City cost-of-living multiplier — lookup behavior
// ---------------------------------------------------------------------------

Deno.test("ADD-1: lookupCityMultiplier hits exact lowercase keys", () => {
  assertEqual(lookupCityMultiplier("Dubai"), 1.7, "Dubai → 1.7");
  assertEqual(lookupCityMultiplier("Bangkok"), 0.5, "Bangkok → 0.5");
  assertEqual(lookupCityMultiplier("Lisbon"), 1.0, "Lisbon → 1.0 baseline");
  assertEqual(lookupCityMultiplier("Krakow"), 0.7, "Krakow → 0.7");
  assertEqual(lookupCityMultiplier("Zurich"), 2.2, "Zurich → 2.2");
});

Deno.test("ADD-1: lookupCityMultiplier resolves substring matches (e.g. 'Dubai, UAE')", () => {
  assertEqual(lookupCityMultiplier("Dubai, UAE"), 1.7, "trailing country");
  assertEqual(lookupCityMultiplier("Tokyo, Japan"), 1.5, "Tokyo with country");
  // Multi-word key wins over a shorter substring it contains.
  assertEqual(lookupCityMultiplier("Ho Chi Minh City, Vietnam"), 0.5, "longer key wins");
});

Deno.test("ADD-1: lookupCityMultiplier defaults to 1.0 for unknown / empty input", () => {
  assertEqual(lookupCityMultiplier(null), 1.0, "null defaults to 1.0");
  assertEqual(lookupCityMultiplier(undefined), 1.0, "undefined defaults to 1.0");
  assertEqual(lookupCityMultiplier(""), 1.0, "empty string defaults to 1.0");
  assertEqual(lookupCityMultiplier("Smallville, USA"), 1.0, "unknown city defaults to 1.0");
});

Deno.test("ADD-1: CITY_COST_MULTIPLIER covers the canonical Tier 0-4 set", () => {
  // Quick sanity that the data table includes one canonical entry per tier
  // — guards against accidental deletion in future edits.
  for (const k of ["zurich", "dubai", "berlin", "lisbon", "bangkok"]) {
    assert(k in CITY_COST_MULTIPLIER, `${k} present`);
  }
});

// ---------------------------------------------------------------------------
// ADD-2: Venue-name floor lift — lookup behavior
// ---------------------------------------------------------------------------

Deno.test("ADD-2: VENUE_NAME_PRICE_SIGNALS includes the canonical patterns", () => {
  // Smoke test: every regex from the spec is present.
  const titles = [
    "Bohemia Beach Club",
    "Cé La Vi Sky Bar",
    "Sukiyabashi Jiro Michelin",
    "Buck and Breck Cocktail Bar",
    "BLING at FIVE Palm Jumeirah",
    "Atlantis Royal Infinity Pool",
  ];
  for (const t of titles) {
    const matched = VENUE_NAME_PRICE_SIGNALS.some((s) => s.match.test(t));
    assert(matched, `pattern matches "${t}"`);
  }
});

Deno.test("ADD-2: lookupVenueNameFloorEur returns max when multiple patterns match", () => {
  // "Caesars Beach Club" → matches both "beach club" (100) and "caesars" (80).
  // Floor must lift to the higher of the two.
  const v = lookupVenueNameFloorEur("Caesars Beach Club", false);
  assertEqual(v, 100, "max of 100 (beach club) and 80 (caesars)");
});

Deno.test("ADD-2: lookupVenueNameFloorEur returns the lodging override when isLodging=true", () => {
  // Hotel-chain pattern: 80 EUR for non-lodging (venue at the hotel) vs
  // 180 EUR for the hotel itself.
  assertEqual(lookupVenueNameFloorEur("Four Seasons Resort", false), 80, "non-lodging branch");
  assertEqual(lookupVenueNameFloorEur("Four Seasons Resort", true), 180, "lodging branch");
});

Deno.test("ADD-2: lookupVenueNameFloorEur returns null when no pattern matches", () => {
  assertEqual(lookupVenueNameFloorEur("Joe's Diner", false), null, "no match → null");
  assertEqual(lookupVenueNameFloorEur(null, false), null, "null title → null");
  assertEqual(lookupVenueNameFloorEur("", false), null, "empty title → null");
});

// ---------------------------------------------------------------------------
// ADD-3: Duration scaling — pure helper
// ---------------------------------------------------------------------------

Deno.test("ADD-3: durationScale returns 1.0 below the 1.5x typical threshold", () => {
  // 90-min typical: anything ≤ 135 stays at 1.0.
  assertEqual(durationScale(90, 60), 1.0, "1h vs 90min typical → no scaling");
  assertEqual(durationScale(90, 90), 1.0, "exactly typical → no scaling");
  assertEqual(durationScale(90, 135), 1.0, "exactly 1.5x typical → no scaling");
});

Deno.test("ADD-3: durationScale formula matches spec for 4-hour beach club", () => {
  // typical 90, duration 240: extra=150, scale=1+(150/90)*0.5=1.833
  const s = durationScale(90, 240);
  assert(Math.abs(s - (1 + (150 / 90) * 0.5)) < 1e-9, `scale ≈ 1.833 (got ${s})`);
});

Deno.test("ADD-3: durationScale caps at 2.0x for all-day activities", () => {
  // Without the cap, a 6-hour beach club would scale 2.5x; spec caps at 2.
  assertEqual(durationScale(90, 360), 2.0, "6h beach club capped");
  assertEqual(durationScale(90, 600), 2.0, "10h spa capped");
});

Deno.test("ADD-3: lookupTypicalDurationMinutes resolves nightclub/beach-club correctly", () => {
  assertEqual(lookupTypicalDurationMinutes("nightlife", ["night_club"]), 180, "nightclub typical");
  assertEqual(lookupTypicalDurationMinutes("lunch", ["beach_club"]), 90, "beach club typical");
  assertEqual(lookupTypicalDurationMinutes("dinner", ["restaurant"]), 90, "restaurant typical");
  assertEqual(lookupTypicalDurationMinutes("nightlife", null), 180, "slot fallback for nightlife");
  assertEqual(lookupTypicalDurationMinutes("afternoon_major", null), 90, "default fallback 90");
});

// ---------------------------------------------------------------------------
// End-to-end clamp behavior — the 10 production-driven cases.
// ---------------------------------------------------------------------------

// 1. Dubai mid-range beach club brunch, 4hr.
Deno.test("E2E: Dubai mid-range beach-club brunch (4hr) lifts well above 120 EUR", () => {
  // Reproduces the failing production case (Bohemia €18 brunch in Dubai
  // that shipped at €18). Pre-fix bands ignored city + venue-name.
  // Post-fix: city 1.7, venue-name "beach club" → 100 EUR floor lift,
  // cityFloor=max(80*1.7, 100*1.7)=170, mid-range tier mul=1.
  // Floor=170, ceiling=374. 4hr scaling on LLM: 18*1.833=33; below floor
  // → bump to mid = (170+374)/2 = 272.
  const out = clampNonLodgingExperienceCost({
    llmCost: 18,
    slotType: "lunch",
    placeTypes: ["beach_club", "restaurant"],
    priceLevel: null,
    budgetTier: "mid-range",
    fxToLocal: FX_EUR,
    cityName: "Dubai",
    venueTitle: "Bohemia Beach Club",
    durationMinutes: 240,
  });
  assertEqual(out.action, "floor_bumped", "floor bump fired");
  assert(out.cost >= 120, `cost ≥ 120 EUR (got ${out.cost})`);
  assert(out.cost >= 170, `cost ≥ venue-name lifted floor 170 (got ${out.cost})`);
});

// 2. Dubai PREMIUM beach club brunch.
Deno.test("E2E: Dubai premium beach-club brunch lifts well above 180 EUR", () => {
  // Premium tier mul 1.4 on both floor + ceiling. Floor=round(170*1.4)=238,
  // ceiling=round(374*1.4)=524. Mid=381. Real Bohemia premium ~€200-380.
  const out = clampNonLodgingExperienceCost({
    llmCost: 18,
    slotType: "lunch",
    placeTypes: ["beach_club", "restaurant"],
    priceLevel: null,
    budgetTier: "premium",
    fxToLocal: FX_EUR,
    cityName: "Dubai",
    venueTitle: "Bohemia Beach Club",
    durationMinutes: 240,
  });
  assertEqual(out.action, "floor_bumped", "floor bump fired");
  assert(out.cost >= 180, `cost ≥ 180 EUR for premium (got ${out.cost})`);
});

// 3. Bangkok premium beach club brunch — city makes it cheaper.
Deno.test("E2E: Bangkok premium beach-club brunch is meaningfully cheaper than Dubai", () => {
  // City 0.5 → cityFloor=max(80*0.5, 100*0.5)=50. Premium: floor=round(50*1.4)=70,
  // ceiling=round(110*1.4)=154. An LLM emit at the in-range €70 passes through.
  const bangkok = clampNonLodgingExperienceCost({
    llmCost: 75,
    slotType: "lunch",
    placeTypes: ["beach_club"],
    priceLevel: null,
    budgetTier: "premium",
    fxToLocal: FX_EUR,
    cityName: "Bangkok",
    venueTitle: "Tigerlily Beach Club",
    durationMinutes: 90,
  });
  assert(bangkok.cost >= 40, `Bangkok premium ≥ 40 (got ${bangkok.cost})`);
  assert(bangkok.cost <= 200, `Bangkok premium ≤ 200, city-appropriate (got ${bangkok.cost})`);
  // Cross-city: Bangkok must come in below Dubai for the same shape input.
  const dubai = clampNonLodgingExperienceCost({
    llmCost: 75,
    slotType: "lunch",
    placeTypes: ["beach_club"],
    priceLevel: null,
    budgetTier: "premium",
    fxToLocal: FX_EUR,
    cityName: "Dubai",
    venueTitle: "Bohemia Beach Club",
    durationMinutes: 90,
  });
  assert(bangkok.cost < dubai.cost, `Bangkok (${bangkok.cost}) < Dubai (${dubai.cost})`);
});

// 4. Tokyo Michelin tasting menu.
Deno.test("E2E: Tokyo Michelin tasting menu lifts to ≥ 180 EUR", () => {
  // city Tokyo 1.5; venue "Michelin" → 120 EUR; cityFloor=max(22*1.5, 120*1.5)=180.
  // Premium: floor=round(180*1.4)=252.
  const out = clampNonLodgingExperienceCost({
    llmCost: 50,
    slotType: "dinner",
    placeTypes: ["restaurant"],
    priceLevel: null,
    budgetTier: "premium",
    fxToLocal: FX_EUR,
    cityName: "Tokyo",
    venueTitle: "Sukiyabashi Jiro Michelin",
    durationMinutes: 120,
  });
  assertEqual(out.action, "floor_bumped", "floor bump fired");
  assert(out.cost >= 180, `cost ≥ 180 EUR (got ${out.cost})`);
});

// 5. Berlin cocktail bar mid-range — modest cost.
Deno.test("E2E: Berlin mid-range cocktail bar lands in 25-80 EUR range", () => {
  // city Berlin 1.2; cocktail band [30, 60] → cityFloor=36, cityCeiling=72.
  // Mid-range: floor=36, ceiling=72. LLM in-band passthrough at 45.
  const out = clampNonLodgingExperienceCost({
    llmCost: 45,
    slotType: "nightlife",
    placeTypes: ["cocktail", "bar"],
    priceLevel: null,
    budgetTier: "mid-range",
    fxToLocal: FX_EUR,
    cityName: "Berlin",
    venueTitle: "Buck and Breck Cocktail Bar",
    durationMinutes: 90,
  });
  assert(out.cost >= 25 && out.cost <= 80, `cost in 25-80 EUR (got ${out.cost})`);
});

// 6. Krakow restaurant budget tier — city 0.7, cheaper.
Deno.test("E2E: Krakow budget restaurant lands in 12-35 EUR range", () => {
  // city 0.7; restaurant [22,55] → [15.4, 38.5]; budget tier mul 0.75 on
  // ceiling only → floor=15, ceiling=29. LLM=20 passes through.
  const out = clampNonLodgingExperienceCost({
    llmCost: 20,
    slotType: "dinner",
    placeTypes: ["restaurant"],
    priceLevel: null,
    budgetTier: "budget",
    fxToLocal: FX_EUR,
    cityName: "Krakow",
    venueTitle: "Pierogarnia Krakowiacy",
    durationMinutes: 90,
  });
  assert(out.cost >= 12 && out.cost <= 35, `cost in 12-35 EUR (got ${out.cost})`);
});

// 7. Lisbon mid-range — regression: city mul = 1.0, behavior unchanged.
Deno.test("E2E: Lisbon mid-range restaurant matches legacy behavior (city mul 1.0)", () => {
  // Lisbon multiplier is 1.0 — no city-side scaling. Mid-range, no venue-name,
  // no duration scaling → identical to pre-Phase-1.2 passthrough.
  const out = clampNonLodgingExperienceCost({
    llmCost: 30,
    slotType: "dinner",
    placeTypes: ["restaurant"],
    priceLevel: null,
    budgetTier: "mid-range",
    fxToLocal: FX_EUR,
    cityName: "Lisbon",
    venueTitle: "Tasca da Esquina",
    durationMinutes: 90,
  });
  assertEqual(out.action, "passthrough", "passthrough");
  assertEqual(out.cost, 30, "unchanged");
});

// 8. 6-hour beach club scales up significantly.
Deno.test("E2E: 6-hour beach club scales the LLM cost by the cap (2.0x)", () => {
  // Duration 360 vs typical 90 → scale capped at 2.0. Mid-range, no city
  // multiplier, no venue-name match — isolates duration scaling.
  const sixHour = clampNonLodgingExperienceCost({
    llmCost: 100,
    slotType: "afternoon_major",
    placeTypes: ["beach_club"],
    priceLevel: null,
    budgetTier: "mid-range",
    fxToLocal: FX_EUR,
    durationMinutes: 360,
  });
  const ninetyMin = clampNonLodgingExperienceCost({
    llmCost: 100,
    slotType: "afternoon_major",
    placeTypes: ["beach_club"],
    priceLevel: null,
    budgetTier: "mid-range",
    fxToLocal: FX_EUR,
    durationMinutes: 90,
  });
  assert(sixHour.cost > ninetyMin.cost * 1.5, `6h (${sixHour.cost}) > 1.5x base 90min (${ninetyMin.cost})`);
  assert(sixHour.cost <= ninetyMin.cost * 2 + 1, `6h capped at 2.0x base (got ${sixHour.cost})`);
});

// 9. 1-hour bar visit — no scaling.
Deno.test("E2E: 1-hour bar visit stays at the LLM base cost", () => {
  // Typical 90 for bar; 60 < 1.5x typical → scale=1.0. LLM passthrough.
  const out = clampNonLodgingExperienceCost({
    llmCost: 25,
    slotType: "nightlife",
    placeTypes: ["bar"],
    priceLevel: null,
    budgetTier: "mid-range",
    fxToLocal: FX_EUR,
    durationMinutes: 60,
  });
  assertEqual(out.action, "passthrough", "passthrough");
  assertEqual(out.cost, 25, "no duration scaling");
});

// 10. Premium-tier Dubai night club at FIVE Palm.
Deno.test("E2E: Premium Dubai nightclub at FIVE Palm lands in realistic 150-350 EUR range", () => {
  // city 1.7; night_club [35, 90]; venue "five palm" non-lodging → 80 EUR;
  // cityFloor=max(35*1.7, 80*1.7)=136. Premium: floor=round(136*1.4)=190,
  // ceiling=round(153*1.4)=214. 3hr at typical 180 → no duration scale.
  // LLM=50 → bump to mid=(190+214)/2=202.
  const out = clampNonLodgingExperienceCost({
    llmCost: 50,
    slotType: "nightlife",
    placeTypes: ["night_club"],
    priceLevel: null,
    budgetTier: "premium",
    fxToLocal: FX_EUR,
    cityName: "Dubai",
    venueTitle: "BLING Nightclub at FIVE Palm Jumeirah",
    durationMinutes: 180,
  });
  assert(out.cost >= 150 && out.cost <= 350, `cost in 150-350 EUR (got ${out.cost})`);
});

// ---------------------------------------------------------------------------
// realisticCostBand — input-object form picks up city + venue inputs.
// ---------------------------------------------------------------------------

Deno.test("realisticCostBand object-form: city multiplier applied before tier", () => {
  // Dubai mid-range beach_club: cityMul 1.7 on both ends; mid-range tier
  // leaves floor unmultiplied. floor=round(80*1.7)=136, ceiling=round(220*1.7)=374.
  const band = realisticCostBand({
    slotType: "lunch",
    placeTypes: ["beach_club"],
    priceLevel: null,
    budgetTier: "mid-range",
    fxToLocal: FX_EUR,
    cityName: "Dubai",
  });
  assert(band !== null, "band returned");
  assertEqual(band!.floor, Math.round(80 * 1.7), "floor=80*1.7");
  assertEqual(band!.ceiling, Math.round(220 * 1.7), "ceiling=220*1.7");
});

Deno.test("realisticCostBand object-form: venue-name lifts floor post-city multiplier", () => {
  // Dubai mid-range beach_club + "Beach Club" name. Venue-name=100 EUR;
  // cityFloor=max(80*1.7, 100*1.7)=170.
  const band = realisticCostBand({
    slotType: "lunch",
    placeTypes: ["beach_club"],
    priceLevel: null,
    budgetTier: "mid-range",
    fxToLocal: FX_EUR,
    cityName: "Dubai",
    venueTitle: "Bohemia Beach Club",
  });
  assertEqual(band!.floor, Math.round(100 * 1.7), "floor lifted to venue-name * cityMul");
});

Deno.test("realisticCostBand: legacy positional signature still works (back-compat)", () => {
  // Existing callers/tests use the positional form. Verify it still
  // produces the same numbers as before (city defaults to 1.0).
  const band = realisticCostBand("dinner", ["restaurant"], null, "premium", FX_EUR);
  assert(band !== null, "band returned");
  assertEqual(band!.floor, Math.round(22 * 1.4), "premium floor lifted");
  assertEqual(band!.ceiling, Math.round(55 * 1.4), "premium ceiling lifted");
});

// ---------------------------------------------------------------------------
// Cross-tier consistency: same place + city, varying tier.
// ---------------------------------------------------------------------------

Deno.test("Cross-tier: premium > mid-range > budget for same Dubai beach club", () => {
  const args = (tier: "budget" | "mid-range" | "premium") => ({
    llmCost: 18,
    slotType: "lunch",
    placeTypes: ["beach_club"],
    priceLevel: null,
    budgetTier: tier,
    fxToLocal: FX_EUR,
    cityName: "Dubai",
    venueTitle: "Bohemia Beach Club",
    durationMinutes: 90,
  } as const);
  const budget = clampNonLodgingExperienceCost(args("budget"));
  const mid = clampNonLodgingExperienceCost(args("mid-range"));
  const premium = clampNonLodgingExperienceCost(args("premium"));
  assert(premium.cost > mid.cost, `premium ${premium.cost} > mid ${mid.cost}`);
  assert(mid.cost > budget.cost, `mid ${mid.cost} > budget ${budget.cost}`);
});

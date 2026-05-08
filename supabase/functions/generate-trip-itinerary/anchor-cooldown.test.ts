// Run with:
//   deno test supabase/functions/generate-trip-itinerary/anchor-cooldown.test.ts
//
// Per-day anchor-category cooldown — at most one beach_club, one
// swimming_pool, and one night_club venue per day. Restaurants, bars and
// other categories are not anchored (lunch + dinner is fine).

import {
  anchorCategoryFor,
  type AnchorCategory,
  reserveAnchorSlot,
} from "./anchor-cooldown.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

function assertEqual<T>(a: T, b: T, msg: string): void {
  if (a !== b) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
  }
}

// ---------------------------------------------------------------------------
// anchorCategoryFor — Place-type → anchor category resolver
// ---------------------------------------------------------------------------

Deno.test("anchorCategoryFor: null / undefined / empty types return null", () => {
  assertEqual(anchorCategoryFor(null), null, "null");
  assertEqual(anchorCategoryFor(undefined), null, "undefined");
  assertEqual(anchorCategoryFor([]), null, "empty");
});

Deno.test("anchorCategoryFor: beach_club type maps to beach_club category", () => {
  assertEqual(
    anchorCategoryFor(["beach_club", "establishment"]),
    "beach_club",
    "beach_club venue",
  );
});

Deno.test("anchorCategoryFor: swimming_pool type maps to swimming_pool category", () => {
  // Cove Beach Dubai types as swimming_pool in Google data.
  assertEqual(
    anchorCategoryFor(["swimming_pool", "tourist_attraction"]),
    "swimming_pool",
    "pool venue",
  );
});

Deno.test("anchorCategoryFor: night_club type maps to night_club category", () => {
  assertEqual(
    anchorCategoryFor(["night_club", "bar"]),
    "night_club",
    "nightclub",
  );
});

Deno.test("anchorCategoryFor: night_club wins when both night_club and beach_club tagged", () => {
  // Beach venues that also operate as night clubs (FIVE Palm-style) should
  // surface as night_club — the more specific late-night signal.
  assertEqual(
    anchorCategoryFor(["night_club", "beach_club"]),
    "night_club",
    "night_club beats beach_club",
  );
});

Deno.test("anchorCategoryFor: non-anchor types return null", () => {
  // Restaurants and bars must NOT carry an anchor category — they're free
  // to repeat (lunch + dinner, drinks + nightcap).
  assertEqual(anchorCategoryFor(["restaurant", "food"]), null, "restaurant");
  assertEqual(anchorCategoryFor(["bar"]), null, "plain bar");
  assertEqual(anchorCategoryFor(["museum", "tourist_attraction"]), null, "museum");
  assertEqual(anchorCategoryFor(["spa", "wellness_center"]), null, "spa is not anchored");
});

Deno.test("anchorCategoryFor: substring of anchor type does NOT match", () => {
  // Defensive — type strings come straight from Google. Matching is
  // anchored to the full token so a hypothetical "private_beach_club_bar"
  // doesn't satisfy the rule (only the literal "beach_club" string does).
  assertEqual(anchorCategoryFor(["private_beach_club_lounge"]), null, "no substring match");
  assertEqual(anchorCategoryFor(["club"]), null, "bare club is not night_club");
});

// ---------------------------------------------------------------------------
// reserveAnchorSlot — per-day cooldown bookkeeping
// ---------------------------------------------------------------------------

Deno.test("reserveAnchorSlot: first beach_club is allowed and recorded", () => {
  const placed = new Set<AnchorCategory>();
  const result = reserveAnchorSlot(placed, ["beach_club"]);
  assertEqual(result.violatesCooldown, false, "first beach_club allowed");
  assertEqual(result.category, "beach_club", "category surfaced");
  assert(placed.has("beach_club"), "category recorded in placed set");
});

Deno.test("reserveAnchorSlot: SECOND beach_club on the same day is rejected", () => {
  // The Dubai screenshot bug: Bohemia Beach Club + Beach by FIVE Palm
  // landed on Day 1. Cooldown must reject the second one.
  const placed = new Set<AnchorCategory>();
  const first = reserveAnchorSlot(placed, ["beach_club"]);
  const second = reserveAnchorSlot(placed, ["beach_club", "tourist_attraction"]);
  assertEqual(first.violatesCooldown, false, "first beach_club allowed");
  assertEqual(second.violatesCooldown, true, "second beach_club rejected");
  assertEqual(second.category, "beach_club", "rejection carries category");
});

Deno.test("reserveAnchorSlot: SECOND swimming_pool on the same day is rejected", () => {
  // Day 2 Dubai bug: Playa Pacha pool club + Be Beach DXB pool party.
  const placed = new Set<AnchorCategory>();
  reserveAnchorSlot(placed, ["swimming_pool"]);
  const second = reserveAnchorSlot(placed, ["swimming_pool"]);
  assertEqual(second.violatesCooldown, true, "second pool club rejected");
  assertEqual(second.category, "swimming_pool", "rejection carries category");
});

Deno.test("reserveAnchorSlot: beach_club + restaurant + night_club is allowed", () => {
  // Counter-positive: the cooldown only fires across same-category
  // anchors. A day with one of each anchor + neutral restaurants is the
  // happy path.
  const placed = new Set<AnchorCategory>();
  const r1 = reserveAnchorSlot(placed, ["beach_club"]);
  const r2 = reserveAnchorSlot(placed, ["restaurant", "food"]);
  const r3 = reserveAnchorSlot(placed, ["night_club", "bar"]);
  assertEqual(r1.violatesCooldown, false, "beach_club allowed");
  assertEqual(r2.violatesCooldown, false, "restaurant unaffected (no anchor category)");
  assertEqual(r2.category, null, "restaurant carries no category");
  assertEqual(r3.violatesCooldown, false, "night_club allowed alongside beach_club");
});

Deno.test("reserveAnchorSlot: same day allows beach_club then night_club then second beach_club rejected", () => {
  const placed = new Set<AnchorCategory>();
  reserveAnchorSlot(placed, ["beach_club"]);
  reserveAnchorSlot(placed, ["night_club"]);
  const third = reserveAnchorSlot(placed, ["beach_club"]);
  assertEqual(third.violatesCooldown, true, "second beach_club still blocked");
});

Deno.test("reserveAnchorSlot: rejected candidate does NOT mutate placed set", () => {
  // Rollback safety: if a caller chooses to retry with a different venue,
  // the rejection must not have left placed in a half-updated state.
  const placed = new Set<AnchorCategory>();
  reserveAnchorSlot(placed, ["beach_club"]);
  const beforeSize = placed.size;
  reserveAnchorSlot(placed, ["beach_club"]); // rejected
  assertEqual(placed.size, beforeSize, "rejection does not grow placed set");
});

Deno.test("reserveAnchorSlot: non-anchor candidate does NOT mutate placed set", () => {
  const placed = new Set<AnchorCategory>();
  const r = reserveAnchorSlot(placed, ["restaurant"]);
  assertEqual(r.violatesCooldown, false, "restaurant passes");
  assertEqual(r.category, null, "no category");
  assertEqual(placed.size, 0, "placed unchanged");
});

// ---------------------------------------------------------------------------
// Day-scheduler simulation — the canonical Dubai scenario.
// ---------------------------------------------------------------------------

interface FakeCandidate {
  id: string;
  types: string[];
}

function simulateDay(candidates: FakeCandidate[]): FakeCandidate[] {
  // Mirrors the per-slot loop in hydrateDay (index.ts): walk candidates in
  // slot order, reject any that violate the per-day cooldown, return the
  // accepted set. The unit covered here is purely the cooldown — no
  // dedup / opening-hours / leg-pool concerns.
  const placed = new Set<AnchorCategory>();
  const accepted: FakeCandidate[] = [];
  for (const c of candidates) {
    const reservation = reserveAnchorSlot(placed, c.types);
    if (reservation.violatesCooldown) continue;
    accepted.push(c);
  }
  return accepted;
}

Deno.test("scheduler simulation: 6 beach_club candidates → exactly 1 placed per day", () => {
  // The required behavior: a 4-day Dubai trip with 6 beach_club candidates
  // — each day independently picks at most one. Simulated as 4 fresh days
  // each handed all 6 candidates (mirrors the parallel ranker mode where
  // every day sees the full pool).
  const candidates: FakeCandidate[] = [
    { id: "bohemia",  types: ["beach_club"] },
    { id: "fivepalm", types: ["beach_club", "tourist_attraction"] },
    { id: "nikki",    types: ["beach_club"] },
    { id: "cove",     types: ["beach_club", "swimming_pool"] },
    { id: "drift",    types: ["beach_club"] },
    { id: "azure",    types: ["beach_club"] },
  ];
  for (let day = 1; day <= 4; day++) {
    const accepted = simulateDay(candidates);
    const beachClubCount = accepted.filter((c) =>
      anchorCategoryFor(c.types) === "beach_club"
    ).length;
    assertEqual(
      beachClubCount,
      1,
      `day ${day}: max 1 beach_club per day (got ${beachClubCount})`,
    );
  }
});

Deno.test("scheduler simulation: Dubai 'beach clubs + nightlife' day allows beach + restaurant + night_club", () => {
  // Counter-positive — confirms the cooldown isn't over-broad. A typical
  // Dubai prompt's day:
  //   afternoon: beach club
  //   lunch:     restaurant
  //   dinner:    restaurant (different one)
  //   nightlife: nightclub
  const candidates: FakeCandidate[] = [
    { id: "lunch",     types: ["restaurant", "food"] },
    { id: "beach",     types: ["beach_club"] },
    { id: "dinner",    types: ["restaurant"] },
    { id: "nightclub", types: ["night_club", "bar"] },
  ];
  const accepted = simulateDay(candidates);
  assertEqual(accepted.length, 4, "all four slots fill — no clash");
  assert(accepted.some((c) => c.id === "lunch"), "lunch kept");
  assert(accepted.some((c) => c.id === "dinner"), "dinner kept (restaurant repeats are fine)");
  assert(accepted.some((c) => c.id === "beach"), "beach club kept");
  assert(accepted.some((c) => c.id === "nightclub"), "night club kept");
});

Deno.test("scheduler simulation: two pool clubs + one night club → 1 pool, 1 club kept", () => {
  // Direct regression of the Day 2 Dubai bug: two `swimming_pool` venues
  // landing in the same day. Cooldown drops the second pool club; the
  // night club passes (different anchor category).
  const candidates: FakeCandidate[] = [
    { id: "playa-pacha", types: ["swimming_pool"] },
    { id: "be-beach",    types: ["swimming_pool"] },
    { id: "white-club",  types: ["night_club"] },
  ];
  const accepted = simulateDay(candidates);
  const ids = accepted.map((c) => c.id);
  assertEqual(accepted.length, 2, "second pool club rejected");
  assert(ids.includes("playa-pacha"), "first pool club kept");
  assert(!ids.includes("be-beach"), "second pool club dropped");
  assert(ids.includes("white-club"), "night club allowed alongside the pool club");
});

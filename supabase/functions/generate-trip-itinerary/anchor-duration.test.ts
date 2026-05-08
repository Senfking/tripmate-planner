// Run with:
//   deno test supabase/functions/generate-trip-itinerary/anchor-duration.test.ts
//
// Covers Fix 3 (anchor-venue duration override). Slot durations are
// deterministic per-slot defaults (90 min dinner, 120 min nightlife);
// anchorDurationOverride raises them for venues where Place types signal
// a multi-hour anchor experience (beach club, premium nightclub, spa).

import { anchorDurationOverride } from "./anchor-duration.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

function assertEqual<T>(a: T, b: T, msg: string): void {
  if (a !== b) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
  }
}

// ---------------------------------------------------------------------------
// night_club override
// ---------------------------------------------------------------------------

Deno.test("anchorDurationOverride: night_club in nightlife slot lifts to ≥360 min", () => {
  // Production failure: a Dubai BLING-style nightclub shipped with the
  // skeleton's 120-min default. Real "serious nightlife" is 5-8 hours.
  assertEqual(
    anchorDurationOverride(120, "nightlife", ["night_club", "establishment"]),
    360,
    "night_club at 120 min slot bumps to 360",
  );
});

Deno.test("anchorDurationOverride: night_club rule preserves longer slot defaults", () => {
  // active-pace nightlife happens to set 180 min — even longer than 120.
  // Override uses Math.max so the longer slot wins.
  assertEqual(
    anchorDurationOverride(180, "nightlife", ["night_club"]),
    360,
    "180 < 360 → 360",
  );
  assertEqual(
    anchorDurationOverride(420, "nightlife", ["night_club"]),
    420,
    "slot 420 > rule 360 → keep 420",
  );
});

Deno.test("anchorDurationOverride: night_club restricted to nightlife slot", () => {
  // A nightclub picked into a dinner slot (rare, but possible) shouldn't
  // claim 6 hours of dinner — leave the slot default in place.
  assertEqual(
    anchorDurationOverride(90, "dinner", ["night_club"]),
    90,
    "night_club outside nightlife → no bump",
  );
});

// ---------------------------------------------------------------------------
// beach_club / swimming_pool override
// ---------------------------------------------------------------------------

Deno.test("anchorDurationOverride: beach_club in afternoon_major lunch lifts to ≥300 min", () => {
  assertEqual(
    anchorDurationOverride(120, "afternoon_major", ["beach_club"]),
    300,
    "beach_club afternoon → 300",
  );
  assertEqual(
    anchorDurationOverride(75, "lunch", ["beach_club", "restaurant"]),
    300,
    "beach_club lunch (brunch) → 300",
  );
});

Deno.test("anchorDurationOverride: swimming_pool tag matches beach_club rule", () => {
  // Cove Beach Dubai types as swimming_pool in Google's data.
  assertEqual(
    anchorDurationOverride(120, "afternoon_major", ["swimming_pool"]),
    300,
    "swimming_pool afternoon → 300",
  );
});

Deno.test("anchorDurationOverride: beach_club outside daytime anchor slots → no bump", () => {
  // Beach club picked as nightlife or dinner shouldn't claim 5 hours.
  assertEqual(
    anchorDurationOverride(90, "dinner", ["beach_club"]),
    90,
    "beach_club at dinner → no bump",
  );
  assertEqual(
    anchorDurationOverride(120, "nightlife", ["beach_club"]),
    120,
    "beach_club at nightlife → no bump",
  );
});

// ---------------------------------------------------------------------------
// spa / wellness override
// ---------------------------------------------------------------------------

Deno.test("anchorDurationOverride: spa in afternoon_major lifts to ≥180 min", () => {
  assertEqual(
    anchorDurationOverride(120, "afternoon_major", ["spa", "health"]),
    180,
    "spa afternoon → 180",
  );
});

Deno.test("anchorDurationOverride: wellness keyword matches", () => {
  assertEqual(
    anchorDurationOverride(120, "afternoon_major", ["wellness_center"]),
    180,
    "wellness afternoon → 180",
  );
});

Deno.test("anchorDurationOverride: spa outside afternoon_major → no bump", () => {
  assertEqual(
    anchorDurationOverride(90, "dinner", ["spa"]),
    90,
    "spa at dinner → no bump",
  );
});

// ---------------------------------------------------------------------------
// Pass-through cases
// ---------------------------------------------------------------------------

Deno.test("anchorDurationOverride: regular restaurant retains slot default", () => {
  // The user explicitly asked: "a regular restaurant retains its slot default".
  assertEqual(
    anchorDurationOverride(75, "lunch", ["restaurant", "food", "establishment"]),
    75,
    "restaurant lunch → 75 (slot default)",
  );
  assertEqual(
    anchorDurationOverride(90, "dinner", ["restaurant"]),
    90,
    "restaurant dinner → 90 (slot default)",
  );
});

Deno.test("anchorDurationOverride: museum retains slot default", () => {
  assertEqual(
    anchorDurationOverride(150, "morning_major", ["museum", "tourist_attraction"]),
    150,
    "museum → 150 (slot default)",
  );
});

Deno.test("anchorDurationOverride: null/empty placeTypes returns slot default", () => {
  assertEqual(anchorDurationOverride(120, "afternoon_major", null), 120, "null types");
  assertEqual(anchorDurationOverride(120, "afternoon_major", undefined), 120, "undefined types");
  assertEqual(anchorDurationOverride(120, "afternoon_major", []), 120, "empty types");
});

Deno.test("anchorDurationOverride: night_club rule beats beach_club ordering", () => {
  // A venue typed as both — night_club takes precedence (it's a more
  // specific signal of "stay until late"). Beach club rule won't fire
  // because we hit night_club first; nightlife slot type is required for
  // night_club rule, so a daytime slot still falls through to beach_club.
  // Verify the rule precedence in nightlife slot:
  assertEqual(
    anchorDurationOverride(120, "nightlife", ["night_club", "beach_club"]),
    360,
    "night_club wins in nightlife",
  );
  // In afternoon_major, night_club rule's slotTypes filter blocks it,
  // so the next rule (beach_club) fires:
  assertEqual(
    anchorDurationOverride(120, "afternoon_major", ["night_club", "beach_club"]),
    300,
    "afternoon → night_club blocked, beach_club fires",
  );
});

// Run with:
//   deno test supabase/functions/generate-trip-itinerary/anchor-duration.test.ts
//
// Covers the anchor-venue duration override. Slot durations are
// deterministic per-slot defaults (90 min dinner, 120 min nightlife);
// anchorDurationOverride RAISES them for venues where Place types signal a
// multi-hour anchor experience (beach club, full spa retreat) and CAPS them
// for venues that the earlier 360-min floor was over-extending (premium
// nightclubs, rooftop lounges, sky bars — real averages are 2-3.5h).

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
// night_club / lounge cap (formerly a 360-min floor — production bug fix)
// ---------------------------------------------------------------------------

Deno.test("anchorDurationOverride: night_club in nightlife slot capped at 210 min", () => {
  // Production failure: DECK TOO Burj Khalifa rooftop and Level 43 Sky
  // Lounge shipped at 6h because the rule was a 360-min floor. Real
  // "evening at the club" is 2-3.5h. Cap at 210 (3.5h).
  assertEqual(
    anchorDurationOverride(120, "nightlife", ["night_club", "establishment"]),
    120,
    "night_club at 120-min slot stays at 120 (within cap)",
  );
  assertEqual(
    anchorDurationOverride(360, "nightlife", ["night_club"]),
    210,
    "night_club fed an oversized 360-min default clamps to 210",
  );
  assertEqual(
    anchorDurationOverride(420, "nightlife", ["night_club"]),
    210,
    "night_club fed an oversized 420-min default clamps to 210",
  );
});

Deno.test("anchorDurationOverride: lounge venue capped at 210 min", () => {
  // Generic lounge bar that types as `lounge` (not as `night_club`)
  // should also clamp to 210 — same kind of multi-hour-but-not-6-hour
  // venue.
  assertEqual(
    anchorDurationOverride(360, "nightlife", ["lounge", "bar"]),
    210,
    "lounge clamps to 210",
  );
});

Deno.test("anchorDurationOverride: night_club rule limited to nightlife slot", () => {
  // A nightclub picked into a dinner slot (rare, but possible) shouldn't
  // see the cap fire — leave the slot default in place.
  assertEqual(
    anchorDurationOverride(90, "dinner", ["night_club"]),
    90,
    "night_club outside nightlife → no rule fires",
  );
});

// ---------------------------------------------------------------------------
// rooftop bar / sky lounge / cocktail bar cap (1.5-2.5h)
// ---------------------------------------------------------------------------

Deno.test("anchorDurationOverride: rooftop bar capped at 150 min", () => {
  // Even when typed as `night_club` by Google, the displayName "rooftop"
  // discriminator pulls these into the tighter 150-min cap.
  assertEqual(
    anchorDurationOverride(360, "nightlife", ["night_club", "bar"], "DECK TOO Rooftop"),
    150,
    "rooftop in displayName → 150 cap",
  );
  assertEqual(
    anchorDurationOverride(120, "nightlife", ["bar"], "Sky Lounge Burj Khalifa"),
    120,
    "sky lounge under cap → unchanged",
  );
  assertEqual(
    anchorDurationOverride(180, "nightlife", ["bar"], "Skybar Dubai"),
    150,
    "skybar over cap → clamps to 150",
  );
  assertEqual(
    anchorDurationOverride(240, "nightlife", ["bar", "night_club"], "Level 43 Sky Lounge"),
    150,
    "Level 43 Sky Lounge → 150 cap",
  );
  assertEqual(
    anchorDurationOverride(200, "nightlife", ["bar"], "The Cocktail Bar"),
    150,
    "cocktail bar → 150 cap",
  );
});

Deno.test("anchorDurationOverride: rooftop rule needs both type AND name discriminators", () => {
  // A bar without a rooftop/lounge/cocktail name doesn't fire the tight
  // cap — falls through to the next rule. With `bar` only types it
  // doesn't match the night_club rule either, so it returns slot default.
  assertEqual(
    anchorDurationOverride(120, "nightlife", ["bar"], "Generic Pub"),
    120,
    "plain bar with non-matching name → slot default",
  );
});

// ---------------------------------------------------------------------------
// beach_club / swimming_pool floor (unchanged behavior)
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

Deno.test("anchorDurationOverride: beach_club preserves longer slot defaults", () => {
  // A 360-min slot default for a beach_club should pass through — the
  // floor is 300, but Math.max keeps the longer value.
  assertEqual(
    anchorDurationOverride(360, "afternoon_major", ["beach_club"]),
    360,
    "beach_club at 360-min slot stays at 360",
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
// spa / wellness floor (unchanged behavior)
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
  // Regression: a restaurant must not get a duration override.
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

Deno.test("anchorDurationOverride: night_club rule beats beach_club ordering in nightlife", () => {
  // A venue typed as both — in nightlife slot the night_club rule fires
  // (cap at 210) because beach_club's slotTypes filter excludes nightlife.
  assertEqual(
    anchorDurationOverride(360, "nightlife", ["night_club", "beach_club"]),
    210,
    "night_club rule fires in nightlife (cap 210)",
  );
  // In afternoon_major, night_club rule's slotTypes filter blocks it,
  // so the next eligible rule (beach_club) fires:
  assertEqual(
    anchorDurationOverride(120, "afternoon_major", ["night_club", "beach_club"]),
    300,
    "afternoon → night_club blocked, beach_club fires",
  );
});

Deno.test("anchorDurationOverride: rooftop rule beats night_club rule when name signals rooftop", () => {
  // Specificity: the rooftop discriminator must run first so a rooftop
  // venue typed as night_club doesn't get the 210 cap.
  assertEqual(
    anchorDurationOverride(360, "nightlife", ["night_club", "bar"], "DECK TOO Rooftop"),
    150,
    "rooftop venue typed as night_club → 150 cap (not 210)",
  );
});

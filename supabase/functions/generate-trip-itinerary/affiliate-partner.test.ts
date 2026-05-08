// Run with:
//   deno test supabase/functions/generate-trip-itinerary/affiliate-partner.test.ts
//
// Covers the strict GYG routing rules. Production was sending users to a GYG
// search page for venues GYG doesn't sell — beach clubs, pool clubs, lounges,
// restaurants. The new partnerForPlace() routes those to google_maps and
// reserves "getyourguide" for unambiguous paid attractions.

import { partnerForPlace } from "./affiliate-partner.ts";

function assertEqual<T>(a: T, b: T, msg: string): void {
  if (a !== b) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
  }
}

// ---------------------------------------------------------------------------
// Spec cases (from the bug ticket)
// ---------------------------------------------------------------------------

Deno.test("partnerForPlace: pure restaurant routes to google_maps", () => {
  assertEqual(
    partnerForPlace({ types: ["restaurant", "food"] }),
    "google_maps",
    "restaurant + food -> google_maps",
  );
});

Deno.test("partnerForPlace: Playa Pacha-shape pool club routes to google_maps", () => {
  // Real production case — a Google Places result tagged with
  // sports_activity_location overlapping a swimming_pool + restaurant must
  // not get routed to GetYourGuide.
  assertEqual(
    partnerForPlace({
      types: ["swimming_pool", "sports_activity_location", "restaurant"],
    }),
    "google_maps",
    "pool club with restaurant overlap -> google_maps",
  );
});

Deno.test("partnerForPlace: Burj Khalifa-shape attraction routes to getyourguide", () => {
  assertEqual(
    partnerForPlace({ types: ["tourist_attraction", "point_of_interest"] }),
    "getyourguide",
    "tourist_attraction with no food/drink overlap -> getyourguide",
  );
});

Deno.test("partnerForPlace: lodging routes to booking", () => {
  assertEqual(
    partnerForPlace({ types: ["resort_hotel", "hotel"] }),
    "booking",
    "resort_hotel + hotel -> booking",
  );
});

// ---------------------------------------------------------------------------
// Additional coverage of the inclusion list
// ---------------------------------------------------------------------------

Deno.test("partnerForPlace: each GYG-eligible standalone type routes to getyourguide", () => {
  const eligible = [
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
  ];
  for (const t of eligible) {
    assertEqual(
      partnerForPlace({ types: [t, "point_of_interest", "establishment"] }),
      "getyourguide",
      `${t} alone -> getyourguide`,
    );
  }
});

// ---------------------------------------------------------------------------
// Exclusion-takes-precedence cases
// ---------------------------------------------------------------------------

Deno.test("partnerForPlace: museum with restaurant attached -> google_maps (food wins)", () => {
  assertEqual(
    partnerForPlace({ types: ["museum", "restaurant"] }),
    "google_maps",
    "museum + restaurant -> google_maps (food/drink takes precedence)",
  );
});

Deno.test("partnerForPlace: tourist_attraction with bar overlap -> google_maps", () => {
  assertEqual(
    partnerForPlace({ types: ["tourist_attraction", "bar"] }),
    "google_maps",
    "attraction + bar -> google_maps",
  );
});

Deno.test("partnerForPlace: water_park with cafe -> google_maps", () => {
  assertEqual(
    partnerForPlace({ types: ["water_park", "cafe"] }),
    "google_maps",
    "water_park + cafe -> google_maps",
  );
});

Deno.test("partnerForPlace: hotel with attraction overlap stays booking (lodging wins)", () => {
  assertEqual(
    partnerForPlace({ types: ["hotel", "tourist_attraction"] }),
    "booking",
    "hotel + tourist_attraction -> booking (lodging takes precedence)",
  );
});

// ---------------------------------------------------------------------------
// Common nightlife / wellness / shopping fall-throughs
// ---------------------------------------------------------------------------

Deno.test("partnerForPlace: night_club / lounge_bar / spa / gym route to google_maps", () => {
  for (const t of ["night_club", "lounge_bar", "spa", "gym", "shopping_mall"]) {
    assertEqual(
      partnerForPlace({ types: [t] }),
      "google_maps",
      `${t} -> google_maps`,
    );
  }
});

Deno.test("partnerForPlace: beach_club routes to google_maps", () => {
  assertEqual(
    partnerForPlace({ types: ["beach_club"] }),
    "google_maps",
    "beach_club -> google_maps",
  );
});

// ---------------------------------------------------------------------------
// Defensive empty / unknown-only inputs
// ---------------------------------------------------------------------------

Deno.test("partnerForPlace: empty types -> google_maps", () => {
  assertEqual(partnerForPlace({ types: [] }), "google_maps", "no types -> google_maps");
  assertEqual(partnerForPlace({}), "google_maps", "missing types -> google_maps");
});

Deno.test("partnerForPlace: unknown-only types -> google_maps", () => {
  assertEqual(
    partnerForPlace({ types: ["point_of_interest", "establishment"] }),
    "google_maps",
    "no eligible signal -> google_maps",
  );
});

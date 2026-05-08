// Run with:
//   deno test supabase/functions/generate-trip-itinerary/destination-recovery.test.ts
//
// Covers the regex-only last-resort destination extraction. The recovery
// LLM call is exercised via the live edge function and isn't unit-tested
// here (it requires mocking the Anthropic fetch). What we lock in:
//
//   1. The Dubai-style production prompt that triggered the launch-blocker
//      regression returns "Dubai".
//   2. Common variants ("trip to X", "weekend in X", "X, Country") all
//      resolve to a single placename, never a venue category or noun phrase.
//   3. Genuinely placeless input ("surprise me, somewhere warm") returns
//      null so the pipeline error surfaces cleanly.
//   4. Stopword guards prevent "Beach Club", "Friends", or "Weekend" from
//      being treated as destinations even when they're capitalized.

import { extractDestinationFromTextRegex } from "./destination-recovery.ts";

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("regex: Dubai launch-blocker prompt extracts 'Dubai'", () => {
  const out = extractDestinationFromTextRegex(
    "4 friends, 6 days in Dubai, beach clubs and serious nightlife",
  );
  assertEqual(out, "Dubai", "production-shaped prompt resolves to Dubai");
});

Deno.test("regex: '5 days in Lisbon' → 'Lisbon'", () => {
  assertEqual(extractDestinationFromTextRegex("5 days in Lisbon"), "Lisbon", "days-in pattern");
});

Deno.test("regex: '2 weeks in Tokyo' → 'Tokyo'", () => {
  assertEqual(extractDestinationFromTextRegex("2 weeks in Tokyo"), "Tokyo", "weeks-in pattern");
});

Deno.test("regex: 'weekend in Lisbon with my partner' → 'Lisbon'", () => {
  assertEqual(
    extractDestinationFromTextRegex("weekend in Lisbon with my partner"),
    "Lisbon",
    "weekend pattern",
  );
});

Deno.test("regex: 'trip to Tokyo' → 'Tokyo'", () => {
  assertEqual(extractDestinationFromTextRegex("Planning a trip to Tokyo"), "Tokyo", "trip-to pattern");
});

Deno.test("regex: 'honeymoon in Bali' → 'Bali'", () => {
  assertEqual(extractDestinationFromTextRegex("honeymoon in Bali"), "Bali", "honeymoon pattern");
});

Deno.test("regex: 'Lisbon, Portugal' → 'Lisbon'", () => {
  assertEqual(
    extractDestinationFromTextRegex("Lisbon, Portugal next October"),
    "Lisbon",
    "comma-country pattern",
  );
});

Deno.test("regex: 'visiting Saint-Petersburg' → 'Saint-Petersburg'", () => {
  // Hyphenated city names must survive — Junto's destination-substitution
  // history flagged Saint-Petersburg specifically.
  assertEqual(
    extractDestinationFromTextRegex("visiting Saint-Petersburg next month"),
    "Saint-Petersburg",
    "hyphenated city",
  );
});

Deno.test("regex: multi-word city 'New York' → 'New York'", () => {
  assertEqual(
    extractDestinationFromTextRegex("3 days in New York with friends"),
    "New York",
    "multi-word city",
  );
});

Deno.test("regex: surprise-me prompt returns null", () => {
  assertEqual(
    extractDestinationFromTextRegex("surprise me, somewhere warm and chill"),
    null,
    "no place named → null",
  );
});

Deno.test("regex: empty/whitespace input returns null", () => {
  assertEqual(extractDestinationFromTextRegex(""), null, "empty");
  assertEqual(extractDestinationFromTextRegex("   "), null, "whitespace only");
  assertEqual(extractDestinationFromTextRegex(null), null, "null");
  assertEqual(extractDestinationFromTextRegex(undefined), null, "undefined");
});

Deno.test("regex: capitalized stopwords ('Beach Club', 'Friends') are not destinations", () => {
  // Without a real placename, these prompts must NOT capture a venue
  // category or a group-noun even though they're capitalized.
  assertEqual(
    extractDestinationFromTextRegex("4 Friends looking for Beach Club energy"),
    null,
    "no real placename → null",
  );
});

Deno.test("regex: prefers explicit days-in over trailing 'in <City>'", () => {
  // When multiple patterns could match, the more-explicit "days in <City>"
  // wins by being earlier in the pattern list.
  const out = extractDestinationFromTextRegex(
    "6 days in Dubai with friends, also in October",
  );
  assertEqual(out, "Dubai", "days-in beats bare 'in'");
});

Deno.test("regex: lowercase placename does NOT match (avoids common-noun false positives)", () => {
  // Trip prompts virtually always capitalize the place. Lowercase "in dubai"
  // is more likely to be a typo or a non-place noun than a destination —
  // the LLM recovery call handles those, regex stays conservative.
  assertEqual(
    extractDestinationFromTextRegex("6 days in dubai"),
    null,
    "lowercase intentionally not matched",
  );
});

Deno.test("regex: 'Paris, France' multi-leg prompt returns the first city", () => {
  // First match wins; this happens to be the city the user named first.
  const out = extractDestinationFromTextRegex(
    "Paris, France for 3 days then Rome, Italy for 4",
  );
  assertEqual(out, "Paris", "first city in multi-leg input");
});

Deno.test("regex: 'going to Kyoto' → 'Kyoto'", () => {
  assertEqual(
    extractDestinationFromTextRegex("we're going to Kyoto for cherry blossom season"),
    "Kyoto",
    "going-to pattern",
  );
});

// Run with:
//   deno test supabase/functions/generate-trip-itinerary/must-have-fidelity.test.ts
//
// Covers the pure helpers behind Phase 1 intent-fidelity fixes:
//   - inferExtraPoolsFromTypes (Fix A: multi-pool retagging signal)
//   - mustHaveSynonymsFor / mustHaveMatches (Fix F: synonym-aware coverage scan)
//   - buildMustHaveHaystackForActivity (haystack shape used by Fix B + Fix F)
//   - MUST_HAVE_QUERY_EXPANSIONS (Fix A: keyword-expansion query templates)
import {
  buildMustHaveHaystackForActivity,
  inferExtraPoolsFromTypes,
  MUST_HAVE_QUERY_EXPANSIONS,
  MUST_HAVE_SYNONYMS,
  mustHaveMatches,
  mustHaveSynonymsFor,
} from "./must-have-fidelity.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

function assertEqualArrays<T>(a: readonly T[], b: readonly T[], msg: string): void {
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    throw new Error(
      `${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// inferExtraPoolsFromTypes — Place-type → pool fan-out
// ---------------------------------------------------------------------------

Deno.test("inferExtraPoolsFromTypes: empty / null / undefined returns []", () => {
  assertEqualArrays(inferExtraPoolsFromTypes([]), [], "empty array");
  assertEqualArrays(inferExtraPoolsFromTypes(null), [], "null");
  assertEqualArrays(inferExtraPoolsFromTypes(undefined), [], "undefined");
});

Deno.test("inferExtraPoolsFromTypes: night_club routes into nightlife", () => {
  const out = inferExtraPoolsFromTypes(["night_club", "establishment"]);
  assert(out.includes("nightlife"), "night_club should produce nightlife");
  assert(!out.includes("attractions"), "night_club alone should not produce attractions");
});

Deno.test("inferExtraPoolsFromTypes: bar routes into nightlife", () => {
  assert(inferExtraPoolsFromTypes(["bar"]).includes("nightlife"), "bar → nightlife");
  assert(inferExtraPoolsFromTypes(["liquor_store"]).includes("nightlife"), "liquor_store → nightlife");
  assert(inferExtraPoolsFromTypes(["lounge"]).includes("nightlife"), "lounge → nightlife");
});

Deno.test("inferExtraPoolsFromTypes: restaurant signals route into restaurants", () => {
  assert(inferExtraPoolsFromTypes(["restaurant"]).includes("restaurants"), "restaurant → restaurants");
  assert(inferExtraPoolsFromTypes(["food"]).includes("restaurants"), "food → restaurants");
  assert(inferExtraPoolsFromTypes(["meal_takeaway"]).includes("restaurants"), "meal_takeaway → restaurants");
});

Deno.test("inferExtraPoolsFromTypes: tourist_attraction routes into attractions", () => {
  assert(inferExtraPoolsFromTypes(["tourist_attraction"]).includes("attractions"));
  assert(inferExtraPoolsFromTypes(["amusement_center"]).includes("attractions"));
  assert(inferExtraPoolsFromTypes(["amusement_park"]).includes("attractions"));
});

Deno.test("inferExtraPoolsFromTypes: lodging signals route into lodging", () => {
  assert(inferExtraPoolsFromTypes(["lodging"]).includes("lodging"));
  assert(inferExtraPoolsFromTypes(["resort_hotel"]).includes("lodging"));
  assert(inferExtraPoolsFromTypes(["bed_and_breakfast"]).includes("lodging"));
});

Deno.test("inferExtraPoolsFromTypes: a Dubai beach club fans into nightlife AND attractions", () => {
  // The Dubai bug case — a "beach club Dubai" Places result that types
  // itself as both night_club and tourist_attraction must surface in both
  // the nightlife and attractions pools so the day ranker can reach it.
  const out = inferExtraPoolsFromTypes([
    "night_club", "tourist_attraction", "point_of_interest", "establishment",
  ]);
  assert(out.includes("nightlife"), "beach club → nightlife");
  assert(out.includes("attractions"), "beach club → attractions");
});

Deno.test("inferExtraPoolsFromTypes: case-insensitive on type strings", () => {
  // Defensive: Google Places normally returns lowercase types but the helper
  // should not break on accidental capitalization.
  assert(inferExtraPoolsFromTypes(["NIGHT_CLUB"]).includes("nightlife"));
  assert(inferExtraPoolsFromTypes(["Restaurant"]).includes("restaurants"));
});

Deno.test("inferExtraPoolsFromTypes: deduplicates when multiple types map to same pool", () => {
  const out = inferExtraPoolsFromTypes(["bar", "night_club", "lounge"]);
  // All three produce "nightlife" — should appear exactly once.
  const nightlifeCount = out.filter((p) => p === "nightlife").length;
  assert(nightlifeCount === 1, `nightlife should appear once, got ${nightlifeCount}`);
});

// ---------------------------------------------------------------------------
// mustHaveSynonymsFor — synonym lookup with literal fallback
// ---------------------------------------------------------------------------

Deno.test("mustHaveSynonymsFor: 'beach club' resolves to the beach-club synonyms", () => {
  const syns = mustHaveSynonymsFor("beach club");
  assert(syns.includes("nikki beach"), "Nikki Beach must be in synonyms");
  assert(syns.includes("cove beach"), "Cove Beach must be in synonyms");
  assert(syns.includes("five palm"), "FIVE Palm must be in synonyms");
});

Deno.test("mustHaveSynonymsFor: 'cool beach clubs' (with qualifier + plural) resolves to beach-club synonyms", () => {
  // Mirrors the real Dubai prompt — must-have token may carry adjectives
  // and pluralization. Synonym lookup uses includes() so it should match.
  const syns = mustHaveSynonymsFor("cool beach clubs");
  assert(syns.includes("nikki beach"), "Nikki Beach via 'cool beach clubs'");
});

Deno.test("mustHaveSynonymsFor: 'rooftop' resolves to rooftop synonyms", () => {
  const syns = mustHaveSynonymsFor("rooftop");
  assert(syns.includes("sky lounge"), "sky lounge in rooftop synonyms");
  assert(syns.includes("skybar"), "skybar in rooftop synonyms");
});

Deno.test("mustHaveSynonymsFor: 'wellness retreat' resolves to wellness synonyms", () => {
  const syns = mustHaveSynonymsFor("wellness retreat");
  assert(syns.includes("hammam"), "hammam in wellness synonyms");
  assert(syns.includes("spa"), "spa in wellness synonyms");
});

Deno.test("mustHaveSynonymsFor: unknown token falls back to literal lowercased trim", () => {
  assertEqualArrays(
    mustHaveSynonymsFor("  Cooking Class  "),
    ["cooking class"],
    "fallback to literal token",
  );
});

Deno.test("mustHaveSynonymsFor: empty string returns []", () => {
  assertEqualArrays(mustHaveSynonymsFor(""), [], "empty token");
  assertEqualArrays(mustHaveSynonymsFor("   "), [], "whitespace-only");
});

// ---------------------------------------------------------------------------
// mustHaveMatches — case-insensitive synonym scan over haystack
// ---------------------------------------------------------------------------

Deno.test("mustHaveMatches: 'beach club' matches a haystack containing 'Nikki Beach'", () => {
  // The Dubai screenshot bug — the validator must NOT report unfulfilled
  // when an actual beach club exists in the itinerary, even if the day
  // theme uses different wording.
  const haystack = "dinner at nikki beach with rooftop views and beachfront access";
  assert(mustHaveMatches("beach club", haystack), "beach club via Nikki Beach");
});

Deno.test("mustHaveMatches: 'beach club' matches haystack containing 'beach resort'", () => {
  assert(
    mustHaveMatches("beach club", "the venue is a beach resort with private cabanas"),
    "beach club via beach resort",
  );
});

Deno.test("mustHaveMatches: 'beach club' does NOT match downtown-only haystack (regression)", () => {
  // Direct regression of the Dubai bug: Day 4 themed "Beach clubs" but
  // populated with downtown venues. The validator must flag this.
  const haystack = "dinner at the dubai mall food court near the burj khalifa";
  assert(
    !mustHaveMatches("beach club", haystack),
    "downtown-only itinerary must NOT satisfy 'beach club' must-have",
  );
});

Deno.test("mustHaveMatches: 'rooftop' matches case-insensitively", () => {
  assert(mustHaveMatches("rooftop", "Drinks at Sky Lounge"), "Sky Lounge counts as rooftop");
  assert(mustHaveMatches("rooftop", "ROOFTOP TERRACE"), "uppercase haystack");
});

Deno.test("mustHaveMatches: empty inputs return false", () => {
  assert(!mustHaveMatches("", "anything"), "empty must-have");
  assert(!mustHaveMatches("beach club", ""), "empty haystack");
});

Deno.test("mustHaveMatches: literal-fallback must-haves still match exact substrings", () => {
  assert(
    mustHaveMatches("cooking class", "guided cooking class with the chef"),
    "literal fallback substring",
  );
});

// ---------------------------------------------------------------------------
// buildMustHaveHaystackForActivity — haystack shape
// ---------------------------------------------------------------------------

Deno.test("buildMustHaveHaystackForActivity: concatenates activity + place fields lowercased", () => {
  const haystack = buildMustHaveHaystackForActivity(
    {
      title: "Sunset Drinks",
      description: "Cocktails at the resort beach",
      category: "nightlife",
      place_id: "ChIJ123",
    },
    {
      displayName: "Nikki Beach Dubai",
      types: ["night_club", "bar", "tourist_attraction"],
    },
  );
  assert(haystack.includes("sunset drinks"), "title in haystack");
  assert(haystack.includes("nikki beach dubai"), "place name in haystack");
  assert(haystack.includes("night_club"), "place types in haystack");
  // All lowercased.
  assert(haystack === haystack.toLowerCase(), "haystack must be lowercased");
});

Deno.test("buildMustHaveHaystackForActivity: handles null place gracefully", () => {
  const haystack = buildMustHaveHaystackForActivity(
    { title: "Travel day", description: "in transit" },
    null,
  );
  assert(haystack.includes("travel day"), "title still in haystack");
  assert(typeof haystack === "string", "returns a string when place is null");
});

Deno.test("buildMustHaveHaystackForActivity: drives the 'beach club' satisfaction check end-to-end", () => {
  // Fix B's recordSatisfaction path uses this haystack to detect that a
  // day picked a beach club. The most important wiring: a typed-but-
  // generically-named venue still satisfies "beach club" via Place types.
  const haystack = buildMustHaveHaystackForActivity(
    { title: "Drinks at Cove", description: "private cove access", category: "nightlife" },
    { displayName: "Cove Beach Dubai", types: ["night_club"] },
  );
  assert(mustHaveMatches("beach club", haystack), "Cove Beach satisfies beach-club must-have");
});

// ---------------------------------------------------------------------------
// MUST_HAVE_QUERY_EXPANSIONS — Fix A keyword expansion templates
// ---------------------------------------------------------------------------

Deno.test("MUST_HAVE_QUERY_EXPANSIONS: 'beach clubs' expands to nightlife AND lodging-bound queries", () => {
  const exp = MUST_HAVE_QUERY_EXPANSIONS.find((e) => e.matches.test("beach clubs"));
  assert(exp !== undefined, "beach clubs must have an expansion entry");
  const pools = (exp!).expansions.map((e) => e.poolKey);
  assert(pools.includes("experiences"), "beach clubs → experiences pool query");
  assert(pools.includes("lodging"), "beach clubs → lodging pool (beach resort) query");
  // The lodging-bound expansion must carry includedType for typed search.
  const resort = exp!.expansions.find((e) => e.poolKey === "lodging");
  assert(resort?.includedType === "lodging", "beach resort query carries includedType=lodging");
});

Deno.test("MUST_HAVE_QUERY_EXPANSIONS: textQuery interpolates city", () => {
  const exp = MUST_HAVE_QUERY_EXPANSIONS.find((e) => e.matches.test("rooftops"));
  assert(exp !== undefined, "rooftops match");
  const tq = exp!.expansions[0].textQuery("Dubai");
  assert(tq.toLowerCase().includes("rooftop"), "query mentions rooftop");
  assert(tq.includes("Dubai"), "query mentions Dubai");
});

Deno.test("MUST_HAVE_QUERY_EXPANSIONS: 'spa' and 'wellness' both match the wellness expansion", () => {
  const expSpa = MUST_HAVE_QUERY_EXPANSIONS.find((e) => e.matches.test("spa"));
  const expWell = MUST_HAVE_QUERY_EXPANSIONS.find((e) => e.matches.test("wellness"));
  assert(expSpa !== undefined && expWell !== undefined, "both spa and wellness match");
  assert(expSpa === expWell, "they should share the same expansion entry");
});

Deno.test("MUST_HAVE_QUERY_EXPANSIONS: unmapped must-have falls through (no match)", () => {
  const exp = MUST_HAVE_QUERY_EXPANSIONS.find((e) => e.matches.test("escape room"));
  assert(exp === undefined, "escape room is unmapped — only generic query fires");
});

// ---------------------------------------------------------------------------
// MUST_HAVE_SYNONYMS — sanity check the table itself
// ---------------------------------------------------------------------------

Deno.test("MUST_HAVE_SYNONYMS: every key appears in its own synonym list", () => {
  for (const [key, syns] of Object.entries(MUST_HAVE_SYNONYMS)) {
    assert(
      syns.includes(key),
      `MUST_HAVE_SYNONYMS["${key}"] must include the key itself; got ${JSON.stringify(syns)}`,
    );
  }
});

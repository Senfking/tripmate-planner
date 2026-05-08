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
  VIBE_NATURE_REGEX,
  venueMatchesAnyMustHave,
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

Deno.test("mustHaveSynonymsFor: 'rooftop' resolves to rooftop synonyms (multi-word post-PATCH-D)", () => {
  const syns = mustHaveSynonymsFor("rooftop");
  assert(syns.includes("sky lounge"), "sky lounge in rooftop synonyms");
  assert(syns.includes("skybar"), "skybar in rooftop synonyms");
  // PATCH D: bare "rooftop" no longer in the synonym list — common-word
  // false positives ("rooftop view" in any high-rise restaurant copy)
  // have been eliminated. The matcher now requires "rooftop bar",
  // "rooftop lounge", or "rooftop terrace" to fire.
  assert(syns.includes("rooftop bar"), "rooftop bar replaces bare 'rooftop'");
});

Deno.test("mustHaveSynonymsFor: 'wellness retreat' resolves to wellness synonyms (multi-word post-PATCH-D)", () => {
  const syns = mustHaveSynonymsFor("wellness retreat");
  assert(syns.includes("hammam"), "hammam in wellness synonyms");
  // PATCH D: bare "spa" / "wellness" / "retreat" replaced with multi-word
  // forms so a haystack containing only "spa" doesn't satisfy the must-have
  // (every premium hotel listing mentions a "spa" amenity).
  assert(syns.includes("wellness spa"), "wellness spa replaces bare 'spa'");
  assert(syns.includes("thermal spa"), "thermal spa replaces bare 'thermal'");
  assert(syns.includes("spa retreat"), "spa retreat replaces bare 'retreat'");
  assert(!syns.includes("spa"), "bare 'spa' must NOT appear (false-positive risk)");
  assert(!syns.includes("wellness"), "bare 'wellness' must NOT appear");
  assert(!syns.includes("retreat"), "bare 'retreat' must NOT appear");
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

Deno.test("mustHaveMatches: 'rooftop' matches case-insensitively via curated synonyms", () => {
  assert(mustHaveMatches("rooftop", "Drinks at Sky Lounge"), "Sky Lounge counts as rooftop");
  assert(mustHaveMatches("rooftop", "ROOFTOP TERRACE Dubai"), "uppercase 'rooftop terrace' matches");
  assert(mustHaveMatches("rooftop", "Rooftop Bar at the Burj"), "rooftop bar matches");
});

// ---------------------------------------------------------------------------
// PATCH D — false-positive regressions
// ---------------------------------------------------------------------------

Deno.test("PATCH D: 'beach club' must-have does NOT match 'evening drifts between bars'", () => {
  // Phase 1 had "drift" in MUST_HAVE_SYNONYMS["beach club"], so any
  // editorial copy containing "drift" satisfied the must-have via a
  // bare-substring scan. PATCH D drops "drift" and uses word-boundary
  // matching. Verify the regression.
  assert(
    !mustHaveMatches("beach club", "let your evening drift between bars"),
    "'drift' alone must not satisfy beach-club must-have",
  );
  assert(
    !mustHaveMatches("beach club", "the days drift by at the souk"),
    "'drift by' must not satisfy beach-club must-have",
  );
});

Deno.test("PATCH D: 'beach club' must-have does NOT match 'azure waters' editorial flourish", () => {
  // Same shape: "azure" was a synonym, mis-firing on any beachfront
  // editorial copy. Dropped from synonyms in PATCH D; the multi-word
  // "azure beach" remains for the actual Dubai venue named Azure Beach.
  assert(
    !mustHaveMatches("beach club", "the azure waters of the gulf"),
    "'azure waters' must not satisfy beach-club must-have",
  );
  assert(
    !mustHaveMatches("beach club", "an azure sky over the desert"),
    "'azure sky' must not satisfy beach-club must-have",
  );
});

Deno.test("PATCH D: 'beach club' must-have STILL matches the actual Drift Beach Club venue", () => {
  // The synonym table was tightened, not gutted. Real venues with
  // "drift" or "azure" in their displayName still match via the
  // multi-word "drift beach" and "azure beach" entries.
  assert(
    mustHaveMatches("beach club", "Drift Beach Club Dubai"),
    "Drift Beach Club still matches",
  );
  assert(
    mustHaveMatches("beach club", "Azure Beach Dubai - sunset cabana"),
    "Azure Beach Dubai still matches",
  );
});

Deno.test("PATCH D: 'beach club' must-have STILL matches Nikki Beach (branded singleton via word-boundary)", () => {
  assert(
    mustHaveMatches("beach club", "Nikki Beach Dubai - sunset session"),
    "Nikki Beach matches",
  );
  assert(
    mustHaveMatches("beach club", "lunch at Cove Beach with rooftop access"),
    "Cove Beach matches",
  );
  assert(
    mustHaveMatches("beach club", "FIVE Palm Jumeirah pool deck"),
    "FIVE Palm matches",
  );
  assert(
    mustHaveMatches("beach club", "Bla Bla beachfront sundowner"),
    "Bla Bla matches",
  );
});

Deno.test("PATCH D: 'rooftop' must-have does NOT match bare 'rooftop' editorial token", () => {
  // Common-word false positive: a city-mall description mentioning
  // "rooftop garden" or "rooftop view" used to falsely satisfy
  // rooftop must-have in Phase 1 (because bare "rooftop" was a synonym).
  // PATCH D requires "rooftop bar"/"rooftop lounge"/"rooftop terrace".
  assert(
    !mustHaveMatches("rooftop", "the rooftop garden at the mall is free to enter"),
    "'rooftop garden' must not satisfy rooftop must-have",
  );
  assert(
    !mustHaveMatches("rooftop", "rooftop views from the observation deck"),
    "'rooftop views' must not satisfy rooftop must-have",
  );
  // Sanity: legitimate matches still fire.
  assert(
    mustHaveMatches("rooftop", "Rooftop Bar at the Burj"),
    "rooftop bar still matches",
  );
});

Deno.test("PATCH D: 'wellness' must-have does NOT match 'spa amenity' generic hotel copy", () => {
  // Every premium hotel listing mentions a "spa" — bare "spa" as a
  // synonym fired on all of them in Phase 1. PATCH D requires
  // "wellness spa" / "thermal spa" / "spa retreat" / "hammam".
  assert(
    !mustHaveMatches("wellness", "the hotel offers a spa amenity for guests"),
    "bare 'spa' must not satisfy wellness must-have",
  );
  assert(
    mustHaveMatches("wellness", "Talise Wellness Spa - 90-minute hammam ritual"),
    "wellness spa + hammam still matches",
  );
});

Deno.test("PATCH D: word-boundary prevents partial-word false positives", () => {
  // "drift beach" should match "Drift Beach Club" but not "windsurfing
  // and kitedrift on the coast" (no word-boundary at the join).
  assert(
    !mustHaveMatches("beach club", "windsurfing and kitedrift beach excursions"),
    "kitedrift should not break out 'drift beach'",
  );
  // Branded singleton "twiggy" — \b prevents "twiggy" matching inside
  // a longer compound word.
  assert(
    mustHaveMatches("beach club", "Twiggy Dubai - sunset DJ"),
    "Twiggy matches as standalone word",
  );
  assert(
    !mustHaveMatches("beach club", "Stwiggy hotel restaurant"),
    "twiggy must not match inside 'Stwiggy'",
  );
});

// ---------------------------------------------------------------------------
// PATCH B — venueMatchesAnyMustHave (digest pool reservation gate)
// ---------------------------------------------------------------------------

Deno.test("venueMatchesAnyMustHave: empty must_haves array returns false", () => {
  assert(
    !venueMatchesAnyMustHave({ displayName: "Nikki Beach", types: ["night_club"] }, []),
    "no must-haves means nothing to match",
  );
});

Deno.test("venueMatchesAnyMustHave: matches via Place display name (Dubai beach club case)", () => {
  assert(
    venueMatchesAnyMustHave(
      { displayName: "Nikki Beach Dubai", types: ["restaurant", "establishment"] },
      ["beach club"],
    ),
    "Nikki Beach Dubai satisfies 'beach club' must-have via name",
  );
});

Deno.test("venueMatchesAnyMustHave: matches via Place types when name is generic", () => {
  // A "beach club" venue typed restaurant + night_club but with a
  // non-branded display name — types alone should still fire if the
  // name string includes the must-have phrase. (Pure types-only matches
  // are gated by the synonym list; intentional limitation kept for
  // false-positive safety.)
  assert(
    venueMatchesAnyMustHave(
      { displayName: "Sunset Beach Club Lounge", types: ["restaurant"] },
      ["beach club"],
    ),
    "name containing 'beach club' fires",
  );
});

Deno.test("venueMatchesAnyMustHave: does NOT match a generic downtown attraction", () => {
  // Direct regression of the Dubai bug: a Burj-area venue must not
  // accidentally satisfy a beach-club must-have just because it has
  // "view" / "high-rise" / "rooftop" in its description (it doesn't
  // here — types alone are downtown-typical).
  assert(
    !venueMatchesAnyMustHave(
      { displayName: "Burj Khalifa Observation Deck", types: ["tourist_attraction"] },
      ["beach club"],
    ),
    "Burj Khalifa must NOT satisfy beach-club must-have",
  );
});

Deno.test("venueMatchesAnyMustHave: handles missing fields gracefully", () => {
  assert(
    !venueMatchesAnyMustHave({ displayName: null, types: null }, ["beach club"]),
    "null fields safely return false",
  );
  assert(
    !venueMatchesAnyMustHave({ displayName: "", types: [] }, ["beach club"]),
    "empty fields safely return false",
  );
});

Deno.test("venueMatchesAnyMustHave: any of multiple must-haves satisfies", () => {
  // The pipeline ORs across must-haves: a venue that satisfies one of
  // the user's listed must-haves is reserved into the digest. This
  // matches the day ranker's behavior (rule 9: pool venues matching
  // ANY unfulfilled must-have).
  assert(
    venueMatchesAnyMustHave(
      { displayName: "Sky Lounge Dubai", types: ["bar"] },
      ["beach club", "rooftop"],
    ),
    "Sky Lounge satisfies the 'rooftop' must-have",
  );
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

Deno.test("MUST_HAVE_SYNONYMS: every key has at least 3 entries (curated coverage check)", () => {
  // PATCH D dropped the "key must appear verbatim in its synonym list"
  // invariant — for common-word keys ("rooftop", "wellness") the key
  // itself is a false-positive risk. The replacement invariant is just
  // that each key has enough multi-word coverage to actually hit real
  // venues. Three is the minimum that demonstrates the table is not
  // a stub.
  for (const [key, syns] of Object.entries(MUST_HAVE_SYNONYMS)) {
    assert(
      syns.length >= 3,
      `MUST_HAVE_SYNONYMS["${key}"] must have ≥ 3 entries; got ${syns.length}`,
    );
  }
});

// ---------------------------------------------------------------------------
// PATCH A.3 — VIBE_NATURE_REGEX (skip venue-category beach tokens)
// ---------------------------------------------------------------------------

Deno.test("VIBE_NATURE_REGEX: matches bare 'beach' (legitimate beach-relaxation vibe)", () => {
  assert(VIBE_NATURE_REGEX.test("beach"), "bare 'beach' is a nature vibe");
  assert(VIBE_NATURE_REGEX.test("beach front"), "'beach front' is a nature vibe");
  assert(VIBE_NATURE_REGEX.test("chill beach"), "'chill beach' is a nature vibe");
});

Deno.test("VIBE_NATURE_REGEX: does NOT match 'beach club' (venue-category must-have, not a vibe)", () => {
  // Direct fix for the Phase 1 failure mode: parseIntent leaked
  // "beach club" as a vibe; the prior nature regex matched it via the
  // bare 'beach' alternation, firing a parks-and-gardens Places query
  // that returned zero beach clubs. PATCH A.3 negative-lookahead skips it.
  assert(!VIBE_NATURE_REGEX.test("beach club"), "'beach club' is NOT a nature vibe");
  assert(!VIBE_NATURE_REGEX.test("beach bar"), "'beach bar' is NOT a nature vibe");
  assert(!VIBE_NATURE_REGEX.test("beach lounge"), "'beach lounge' is NOT a nature vibe");
  assert(!VIBE_NATURE_REGEX.test("beach resort"), "'beach resort' is NOT a nature vibe");
  assert(!VIBE_NATURE_REGEX.test("beach house"), "'beach house' is NOT a nature vibe");
});

Deno.test("VIBE_NATURE_REGEX: still matches the other nature tokens unchanged", () => {
  assert(VIBE_NATURE_REGEX.test("nature"), "nature");
  assert(VIBE_NATURE_REGEX.test("natural"), "natural");
  assert(VIBE_NATURE_REGEX.test("park"), "park");
  assert(VIBE_NATURE_REGEX.test("forest hiking"), "forest hiking");
  assert(VIBE_NATURE_REGEX.test("lake"), "lake");
  assert(VIBE_NATURE_REGEX.test("viewpoint"), "viewpoint");
  assert(VIBE_NATURE_REGEX.test("waterfall"), "waterfall");
  assert(VIBE_NATURE_REGEX.test("japanese garden"), "japanese garden");
});

Deno.test("VIBE_NATURE_REGEX: case-insensitive", () => {
  assert(VIBE_NATURE_REGEX.test("BEACH"), "uppercase beach");
  assert(!VIBE_NATURE_REGEX.test("BEACH CLUB"), "uppercase beach club still skipped");
});

Deno.test("MUST_HAVE_SYNONYMS: dropped tokens 'drift' and 'azure' are not bare-word synonyms", () => {
  // Direct regression: any bare "drift" or "azure" entry would re-open
  // the editorial-copy false positives PATCH D closed.
  for (const [, syns] of Object.entries(MUST_HAVE_SYNONYMS)) {
    assert(!syns.includes("drift"), "bare 'drift' must not be a synonym");
    assert(!syns.includes("azure"), "bare 'azure' must not be a synonym");
  }
});

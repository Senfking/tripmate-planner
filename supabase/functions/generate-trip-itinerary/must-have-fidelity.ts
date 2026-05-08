// Pure helpers for Phase 1 intent-fidelity fixes (Fix A + Fix F).
//
// Extracted into a sibling module so unit tests can import them directly
// without loading `index.ts` (which calls `Deno.serve` at module load).
//
// Three connected pieces:
//   1. MUST_HAVE_QUERY_EXPANSIONS — sharper Places queries per known
//      must-have keyword (e.g. "beach clubs" also fires "beach club <city>"
//      + "beach resort <city>"). Augments, never replaces, the generic
//      `${mh} ${city}` query so unmapped must-haves still get retrieval
//      coverage.
//   2. inferExtraPoolsFromTypes — Place-type → pool fan-out applied to
//      results from must-have queries only. The same physical venue can land
//      in multiple pools so the slot binder can reach it from whichever slot
//      it's filling.
//   3. MUST_HAVE_SYNONYMS — synonym table used by both the day-ranker
//      "satisfied?" check (Fix B) and logVibeCoverage's must-have audit
//      (Fix F). Keep this table conservative — overreach causes false
//      positives in the coverage validator.

// Pool keys are duplicated from index.ts intentionally — keeping this module
// dependency-free of the 11k-line edge function entry point so tests stay
// fast. The list MUST stay in sync with `PoolKey` in index.ts.
export type FidelityPoolKey =
  | "lodging"
  | "breakfast"
  | "lunch"
  | "dinner"
  | "restaurants"
  | "attractions"
  | "nightlife"
  | "experiences"
  | "rest";

export interface MustHaveQueryExpansion {
  matches: RegExp;
  expansions: Array<{
    textQuery: (city: string) => string;
    poolKey: FidelityPoolKey;
    includedType?: string;
  }>;
}

export const MUST_HAVE_QUERY_EXPANSIONS: MustHaveQueryExpansion[] = [
  {
    matches: /\bbeach\s*clubs?\b/i,
    expansions: [
      { textQuery: (c) => `beach club ${c}`,   poolKey: "experiences" },
      { textQuery: (c) => `beach resort ${c}`, poolKey: "lodging", includedType: "lodging" },
    ],
  },
  {
    matches: /\brooftops?\b/i,
    expansions: [
      { textQuery: (c) => `rooftop bar ${c}`, poolKey: "nightlife", includedType: "bar" },
    ],
  },
  {
    matches: /\b(spa|wellness)\b/i,
    expansions: [
      { textQuery: (c) => `wellness spa ${c}`, poolKey: "experiences" },
    ],
  },
];

// Place-type → pool routing for must-have query results. A single venue's
// types list can yield multiple pool memberships (a "beach club" tagged
// night_club + tourist_attraction lands in both nightlife and attractions).
// Conservative on purpose — we only fan out into a pool when the type is a
// strong signal that slot pickers for that pool will accept the venue.
export function inferExtraPoolsFromTypes(
  types: readonly string[] | null | undefined,
): FidelityPoolKey[] {
  if (!types || types.length === 0) return [];
  const out = new Set<FidelityPoolKey>();
  for (const raw of types) {
    const t = String(raw).toLowerCase();
    // Nightlife signals.
    if (t === "night_club" || t === "bar" || t === "liquor_store" || t === "lounge") {
      out.add("nightlife");
    }
    // Restaurant signals — mapped to the shared `restaurants` pool which
    // mergeLegRestaurantPool fans out into both lunch and dinner per leg.
    if (
      t === "restaurant" || t === "food" ||
      t === "meal_takeaway" || t === "meal_delivery"
    ) {
      out.add("restaurants");
    }
    // Sightseeing signals.
    if (
      t === "tourist_attraction" || t === "point_of_interest" ||
      t === "amusement_center" || t === "amusement_park"
    ) {
      out.add("attractions");
    }
    // Lodging signals — covers the "beach resort" must-have expansion that
    // returns hotels-with-private-beach which the lodging picker should see.
    if (t === "lodging" || t === "hotel" || t === "resort_hotel" || t === "bed_and_breakfast") {
      out.add("lodging");
    }
  }
  return Array.from(out);
}

// Synonym table used by both Fix B (per-day "did this day satisfy a
// must-have?" check) and Fix F (post-pipeline coverage validator).
//
// PATCH D — false-positive hardening:
//   - Removed "drift" and "azure" from the beach-club list — both are
//     editorial-copy false positives ("evening drifts", "azure waters").
//     Their absence does not cost real coverage: actual venues called
//     "Drift Beach Club" and "Azure Beach Dubai" still match via
//     "beach club" and "beach resort" synonyms, or surface as
//     branded-name singletons like "drift beach" / "azure beach".
//   - Common-word synonyms ("rooftop", "spa", "wellness") replaced with
//     multi-word forms ("rooftop bar", "wellness spa") so matches
//     require category context, not bare keywords.
//   - Branded singletons retained when distinctive enough (twiggy,
//     skybar, hammam) — the word-boundary matcher still gates them.
export const MUST_HAVE_SYNONYMS: Record<string, string[]> = {
  "beach club": [
    "beach club", "beach clubs",
    "nikki beach", "cove beach", "five palm",
    "bla bla", "soul beach", "twiggy",
    "drift beach", "azure beach",
    "beach resort",
  ],
  "rooftop": [
    "rooftop bar", "rooftop lounge", "rooftop terrace",
    "sky lounge", "skybar",
  ],
  "wellness": [
    "wellness spa", "wellness center", "wellness retreat",
    "thermal spa", "thermal bath", "spa retreat",
    "hammam",
  ],
};

// Pick the synonym list for a must-have token. Match is by simple includes
// so "cool beach clubs" and "beach club" both resolve to the beach-club
// synonyms. Returns the literal token (lowercased + trimmed) when no
// synonym entry matches — substring scan still works against the haystack.
export function mustHaveSynonymsFor(mh: string): string[] {
  const k = mh.toLowerCase().trim();
  if (!k) return [];
  for (const [key, syns] of Object.entries(MUST_HAVE_SYNONYMS)) {
    if (k.includes(key)) return syns;
  }
  return [k];
}

// Escape regex metacharacters so a synonym like "high-rise" is treated as
// literal text, not as a character class etc. Used by the word-boundary
// matcher below.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary match against a haystack. Replaces the prior `includes()`
// scan (PATCH D): bare-substring matching mis-fired on "evening drifts"
// satisfying a "beach club" must-have via the `drift` synonym, and on
// any text containing "rooftop" satisfying the `rooftop` must-have even
// when no rooftop venue was actually picked.
//
// The synonym list itself is curated (multi-word for common terms,
// branded singletons for distinctive ones) so the boundary regex is
// the second line of defense, not the only one.
export function mustHaveMatches(mh: string, haystack: string): boolean {
  if (!mh || !haystack) return false;
  for (const syn of mustHaveSynonymsFor(mh)) {
    if (!syn) continue;
    // \b at both ends, case-insensitive. Hyphenated synonyms like
    // "high-rise" still match "high-rise" and "high-rises" via \b's
    // alphanumeric boundary semantics.
    const re = new RegExp(`\\b${escapeRegex(syn)}\\b`, "i");
    if (re.test(haystack)) return true;
  }
  return false;
}

// Nature-vibe routing regex. Used by VIBE_PLACES_MAP in index.ts to decide
// whether a parsed vibe token should fire the "parks gardens viewpoints
// natural sights" Places query.
//
// PATCH A.3 — the prior pattern matched bare `beach`, so a parsed vibe of
// "beach club" (which the model could leak when a user says "cool beach
// clubs") fired the parks query. Negative lookahead now skips
// "beach club", "beach bar", "beach lounge", "beach resort", "beach
// house" — those are venue-category must_haves, not nature vibes. The
// rest of the pattern (park, forest, lake, viewpoint, waterfall, garden)
// is unchanged.
//
// Exported so the unit-test mirror stays in lockstep with the production
// regex without importing index.ts (which would trigger Deno.serve).
export const VIBE_NATURE_REGEX =
  /^nature$|natural|park\b|forest|lake|\bbeach\b(?!\s*(?:club|bar|lounge|resort|house))|viewpoint|waterfall|garden/i;

// True when the venue's display name + Place types match any entry in the
// caller's must_haves list. Used by Patch B (digest pool reservation) to
// promote must-have-matching venues into the top-of-pool slice the day
// ranker actually sees. Same matcher as the post-pipeline coverage
// validator so a venue that satisfies the validator also gets reserved.
export function venueMatchesAnyMustHave(
  v: { displayName?: string | null; types?: readonly string[] | null },
  mustHaves: readonly string[],
): boolean {
  if (mustHaves.length === 0) return false;
  const haystack = [
    v.displayName ?? "",
    (v.types ?? []).join(" "),
  ].join(" ");
  if (!haystack.trim()) return false;
  for (const mh of mustHaves) {
    if (mustHaveMatches(mh, haystack)) return true;
  }
  return false;
}

// Build the haystack used for must-have satisfaction checks. Concatenates
// activity title + description + category + place display name + Place types
// so a venue named "Nikki Beach" and/or typed `night_club` both match the
// "beach club" synonym list. Lowercased once at construction; callers do
// substring scans against the result.
export function buildMustHaveHaystackForActivity(
  act: { title?: string | null; description?: string | null; category?: string | null; place_id?: string | null },
  place: { displayName?: string | null; types?: readonly string[] | null } | null,
): string {
  return [
    act.title ?? "",
    act.description ?? "",
    act.category ?? "",
    place?.displayName ?? "",
    (place?.types ?? []).join(" "),
  ].join(" ").toLowerCase();
}

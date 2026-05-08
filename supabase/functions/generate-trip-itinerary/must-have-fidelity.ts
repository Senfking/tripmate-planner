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
export const MUST_HAVE_SYNONYMS: Record<string, string[]> = {
  "beach club": [
    "beach club", "nikki beach", "cove beach", "drift", "five palm",
    "bla bla", "soul beach", "twiggy", "azure", "beach resort",
  ],
  "rooftop": ["rooftop", "sky lounge", "skybar", "high-rise"],
  "wellness": ["wellness", "spa", "thermal", "hammam", "retreat"],
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

// Case-insensitive substring scan. Haystack is expected to already be a
// concatenation of activity title/description/category/place_types.
export function mustHaveMatches(mh: string, haystack: string): boolean {
  if (!mh || !haystack) return false;
  const lower = haystack.toLowerCase();
  for (const syn of mustHaveSynonymsFor(mh)) {
    const s = syn.toLowerCase();
    if (s && lower.includes(s)) return true;
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

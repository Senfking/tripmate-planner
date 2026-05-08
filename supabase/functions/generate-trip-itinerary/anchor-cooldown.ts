// Per-day anchor-category cooldown.
//
// Background: PRs #285/#286 added must-have fidelity logic that aggressively
// promotes high-priority categories (beach clubs, pool clubs, premium
// nightclubs) into the day-ranker's candidate pool. Without a per-day
// saturation check, a single day could end up with two beach clubs, or two
// pool clubs, stuffed into adjacent slots — not how a real traveller spends
// a day. The Dubai screenshot bug:
//   Day 1: Bohemia Beach Club + Beach by FIVE Palm Jumeirah  (TWO beach clubs)
//   Day 2: Playa Pacha pool club + Be Beach DXB pool party    (TWO pool clubs)
//
// Fix: maintain a per-day Set of "anchor categories" already placed. When a
// candidate's primary place_type maps to one of the anchor categories
// (beach_club, swimming_pool, night_club) and that category is already in
// the day's set, drop the candidate. The slot is left empty rather than
// double-stacking — the next day's ranker can pick up the unused candidate
// from the leg pool.
//
// What does NOT cool down: restaurants and bars. Lunch + dinner, drinks +
// nightcap are realistic patterns. Only the long-duration experiential
// "I'm there all afternoon / all evening" venues are anchored here.

export type AnchorCategory = "beach_club" | "swimming_pool" | "night_club";

// Type-string → category mapping. Order matters — the first match wins, so a
// venue tagged with both `night_club` and `beach_club` (e.g. a beach venue
// that operates day-into-night) is bucketed as the more specific late-night
// signal. Same precedence rule as anchor-duration.ts so the cooldown and the
// duration override agree on which category dominates.
const ANCHOR_TYPE_PATTERNS: ReadonlyArray<{
  category: AnchorCategory;
  match: RegExp;
}> = [
  { category: "night_club",    match: /^night_club$/i },
  { category: "beach_club",    match: /^beach_club$/i },
  { category: "swimming_pool", match: /^swimming_pool$/i },
];

/**
 * Resolve a venue's anchor category from its Place types. Returns null when
 * none of the types map to an anchor category — the cooldown does not apply.
 */
export function anchorCategoryFor(
  types: ReadonlyArray<string> | null | undefined,
): AnchorCategory | null {
  if (!Array.isArray(types) || types.length === 0) return null;
  for (const rule of ANCHOR_TYPE_PATTERNS) {
    for (const t of types) {
      if (rule.match.test(t)) return rule.category;
    }
  }
  return null;
}

/**
 * Try to reserve an anchor slot for a candidate. Mutates `placed` only on a
 * successful reservation — callers can drop the candidate without rolling
 * back any state.
 *
 * Returns `{ violatesCooldown: true }` when the candidate's anchor category
 * is already present in `placed`. Returns `{ violatesCooldown: false }` when
 * the candidate either has no anchor category (passes through, nothing
 * recorded) or its category is freshly recorded.
 */
export function reserveAnchorSlot(
  placed: Set<AnchorCategory>,
  types: ReadonlyArray<string> | null | undefined,
): { violatesCooldown: boolean; category: AnchorCategory | null } {
  const category = anchorCategoryFor(types);
  if (!category) return { violatesCooldown: false, category: null };
  if (placed.has(category)) return { violatesCooldown: true, category };
  placed.add(category);
  return { violatesCooldown: false, category };
}

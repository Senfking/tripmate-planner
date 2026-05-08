// Anchor-venue duration override.
//
// Background: hydrateActivity used to copy `duration_minutes` straight from
// the slot skeleton, which assigns deterministic per-slot defaults (90 min
// for dinner, 120 min for nightlife, 120-150 min for afternoon_major). The
// LLM is not asked to emit a duration. For destination-anchor venues —
// Dubai/Ibiza beach clubs, premium nightclubs with table minimums, full
// spa retreats — those defaults are far too short and undersell the
// experience the user said they wanted.
//
// This module surfaces a place-type → minimum-duration override applied
// AFTER the slot default. Always uses Math.max so the slot's own value
// wins when it's already longer (active-pace afternoon_major is 150 min;
// we don't want the override to shorten it for a non-anchor venue).
//
// Pure helpers extracted into a sibling module so unit tests can import
// directly without loading index.ts.

// Slot-type strings used by index.ts. Listed here as the union the
// override consumes — extra strings are ignored.
export type AnchorSlotType =
  | "afternoon_major"
  | "morning_major"
  | "lunch"
  | "dinner"
  | "breakfast"
  | "nightlife"
  | "rest"
  | "arrival"
  | "departure"
  | "transit_buffer"
  | "lodging"
  | string;

export interface AnchorRule {
  match: RegExp;
  // Minimum duration in minutes when the rule fires.
  minDurationMinutes: number;
  // When set, the rule only applies on these slot types. Empty/undefined
  // means "any slot". Beach clubs are anchor experiences in afternoon_major
  // / lunch slots only — picking one as a dinner spot doesn't imply a 5-hour
  // stay.
  slotTypes?: ReadonlySet<AnchorSlotType>;
}

const NIGHTLIFE_SLOTS = new Set<AnchorSlotType>(["nightlife"]);
const DAYTIME_ANCHOR_SLOTS = new Set<AnchorSlotType>(["afternoon_major", "lunch"]);
const SPA_SLOTS = new Set<AnchorSlotType>(["afternoon_major"]);

// Resolution rules. First match wins, then a max() against the slot default.
// Order is by specificity: night_club first (it dominates any other tag a
// beach venue might also carry), then beach_club, then spa.
export const ANCHOR_DURATION_RULES: readonly AnchorRule[] = [
  // Premium nightclubs (Dubai BLING, Ibiza Pacha, NYC nightclub anchors):
  // 6h is the rule-of-thumb for an "evening at the club" — table service
  // typically books from 22:00 and the floor doesn't peak until 01:00.
  { match: /night_club/i, minDurationMinutes: 360, slotTypes: NIGHTLIFE_SLOTS },
  // Beach clubs / pool clubs (Dubai Cove Beach, Ibiza Nikki Beach, Mykonos
  // Scorpios): 5h covers lunch + DJ set + sundowner. Restricted to daytime
  // anchor slots so a beach-club picked as dinner doesn't claim 5 hours.
  // Google sometimes types beach clubs as `swimming_pool` (Cove Beach in
  // Dubai is the canonical example), so both terms are matched.
  { match: /beach_club|swimming_pool/i, minDurationMinutes: 300, slotTypes: DAYTIME_ANCHOR_SLOTS },
  // Wellness / spa retreats: 3h covers a single multi-treatment booking
  // (massage + sauna + cool-down). Full-day spa retreats are rare; 180 min
  // is the realistic experience floor.
  { match: /spa|wellness/i, minDurationMinutes: 180, slotTypes: SPA_SLOTS },
];

/**
 * Apply the anchor override on top of a slot default. Returns the larger
 * of the slot default and the matching rule's minDurationMinutes; falls
 * back to slotDefault when no rule matches or `placeTypes` is null/empty.
 */
export function anchorDurationOverride(
  slotDefault: number,
  slotType: AnchorSlotType,
  placeTypes: ReadonlyArray<string> | null | undefined,
): number {
  if (!Array.isArray(placeTypes) || placeTypes.length === 0) return slotDefault;
  const joined = placeTypes.join(" ");
  for (const rule of ANCHOR_DURATION_RULES) {
    if (rule.slotTypes && !rule.slotTypes.has(slotType)) continue;
    if (rule.match.test(joined)) {
      return Math.max(slotDefault, rule.minDurationMinutes);
    }
  }
  return slotDefault;
}

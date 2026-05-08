// Anchor-venue duration override.
//
// Background: hydrateActivity used to copy `duration_minutes` straight from
// the slot skeleton, which assigns deterministic per-slot defaults (90 min
// for dinner, 120 min for nightlife, 120-150 min for afternoon_major). The
// LLM is not asked to emit a duration. For destination-anchor venues —
// Dubai/Ibiza beach clubs, full spa retreats — those defaults are far too
// short and undersell the experience the user said they wanted, so the
// rule fires a floor (Math.max).
//
// Symmetrically, some venue categories were getting WAY too much time:
// nightclubs and rooftop lounges shipped at 6h because an early version of
// this module set a 360-min floor on `night_club`. Real "evening at the
// club" averages 2-3.5h, and a rooftop bar is 1.5-2.5h tops. The rule now
// expresses both a floor (`minDurationMinutes`) and a cap
// (`maxDurationMinutes`); the override clamps the slot default into the
// rule's allowed range.
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
  // Type-string regex — tested against the joined `placeTypes` list.
  match: RegExp;
  // Optional name regex — additional discriminator for venues that share a
  // Place type (e.g. a "Sky Lounge" typed as `night_club` should be capped
  // tighter than a real club). When set, both `match` and `nameMatch` must
  // fire for the rule to apply.
  nameMatch?: RegExp;
  // Optional floor — final duration is at least this many minutes when the
  // rule fires.
  minDurationMinutes?: number;
  // Optional cap — final duration is at most this many minutes when the
  // rule fires. Applied AFTER the floor so a rule with both produces a
  // closed range [min, max].
  maxDurationMinutes?: number;
  // When set, the rule only applies on these slot types. Empty/undefined
  // means "any slot". Beach clubs are anchor experiences in afternoon_major
  // / lunch slots only — picking one as a dinner spot doesn't imply a 5-hour
  // stay.
  slotTypes?: ReadonlySet<AnchorSlotType>;
}

const NIGHTLIFE_SLOTS = new Set<AnchorSlotType>(["nightlife"]);
const DAYTIME_ANCHOR_SLOTS = new Set<AnchorSlotType>(["afternoon_major", "lunch"]);
const SPA_SLOTS = new Set<AnchorSlotType>(["afternoon_major"]);

// Resolution rules. First match wins; the matching rule's floor/cap clamp
// the slot default. Order is by specificity:
//   1. Rooftop / sky lounge / cocktail bar — narrower than night_club;
//      detected via name pattern (these venues often type themselves as
//      `bar` and/or `night_club` in Google Places).
//   2. Night club / lounge — capped at 3.5h.
//   3. Beach club / pool club — daytime anchor, floor at 5h.
//   4. Spa / wellness — afternoon anchor, floor at 3h.
export const ANCHOR_DURATION_RULES: readonly AnchorRule[] = [
  // Rooftop bars, sky lounges, cocktail bars: 1.5-2.5h. They're typically
  // typed `bar` (sometimes `night_club`); the name discriminator keeps
  // genuine clubs out of this rule. Detection by keyword in the venue's
  // displayName: "rooftop", "sky lounge", "skybar", "cocktail bar".
  {
    match: /\bbar\b|night_club/i,
    nameMatch: /rooftop|sky\s*lounge|sky\s*bar|skybar|cocktail\s*bar|cocktail\s*lounge/i,
    maxDurationMinutes: 150,
    slotTypes: NIGHTLIFE_SLOTS,
  },
  // Premium nightclubs and lounge bars (Dubai BLING, Ibiza Pacha, NYC
  // nightclub anchors): real average is 2-3.5h. The earlier 6h floor was
  // a bug — even a marathon table-service night rarely passes 4h, and
  // rooftop lounges typed as `night_club` were getting wildly oversold.
  // Cap at 210 min (3.5h); no floor — the slot default (120 min nightlife)
  // already sits comfortably in the realistic range.
  { match: /night_club|\blounge\b/i, maxDurationMinutes: 210, slotTypes: NIGHTLIFE_SLOTS },
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
 * Apply the anchor override on top of a slot default. Returns a duration
 * clamped into the matching rule's allowed range:
 *   - floor (minDurationMinutes): result >= floor
 *   - cap   (maxDurationMinutes): result <= cap
 * If neither floor nor cap is set on a matched rule, the slot default
 * passes through unchanged. Falls back to slotDefault when no rule
 * matches or `placeTypes` is null/empty.
 */
export function anchorDurationOverride(
  slotDefault: number,
  slotType: AnchorSlotType,
  placeTypes: ReadonlyArray<string> | null | undefined,
  displayName?: string | null,
): number {
  if (!Array.isArray(placeTypes) || placeTypes.length === 0) return slotDefault;
  const joined = placeTypes.join(" ");
  const name = (displayName ?? "").trim();
  for (const rule of ANCHOR_DURATION_RULES) {
    if (rule.slotTypes && !rule.slotTypes.has(slotType)) continue;
    if (!rule.match.test(joined)) continue;
    if (rule.nameMatch && !rule.nameMatch.test(name)) continue;
    let result = slotDefault;
    if (rule.minDurationMinutes !== undefined) {
      result = Math.max(result, rule.minDurationMinutes);
    }
    if (rule.maxDurationMinutes !== undefined) {
      result = Math.min(result, rule.maxDurationMinutes);
    }
    return result;
  }
  return slotDefault;
}

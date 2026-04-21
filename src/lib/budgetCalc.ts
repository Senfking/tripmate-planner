import { differenceInCalendarDays, parseISO } from "date-fns";
import type { AITripResult } from "@/components/trip-results/useResultsState";

export type PriceLevel =
  | "PRICE_LEVEL_FREE"
  | "PRICE_LEVEL_INEXPENSIVE"
  | "PRICE_LEVEL_MODERATE"
  | "PRICE_LEVEL_EXPENSIVE"
  | "PRICE_LEVEL_VERY_EXPENSIVE";

// Midpoints for activities (meals, experiences, etc) in local-currency units.
// Calibrated against common USD/EUR bands; close enough for trip-total math.
export const ACTIVITY_PRICE_LEVEL_MIDPOINT: Record<PriceLevel, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 10,
  PRICE_LEVEL_MODERATE: 30,
  PRICE_LEVEL_EXPENSIVE: 75,
  PRICE_LEVEL_VERY_EXPENSIVE: 150,
};

// Hotels are priced differently from per-activity bands — $$ hotel ≠ $$ meal.
const ACCOMMODATION_PRICE_LEVEL_MIDPOINT: Record<PriceLevel, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 60,
  PRICE_LEVEL_MODERATE: 130,
  PRICE_LEVEL_EXPENSIVE: 260,
  PRICE_LEVEL_VERY_EXPENSIVE: 500,
};

// Conservative per-night defaults when we have no pricing signal at all.
// Local-currency units, USD-ish fallback.
const ACCOMMODATION_TIER_DEFAULT_PER_NIGHT: Record<string, number> = {
  budget: 50,
  "mid-range": 120,
  midrange: 120,
  premium: 250,
  luxury: 500,
};

function normalizeTier(tier: string | null | undefined): string {
  return (tier ?? "mid-range").trim().toLowerCase();
}

// Parses Google-style or LLM-formatted price range strings into a midpoint.
// Accepts "€15-20", "$12–18", "USD 10 - 25", "15–20 EUR", "~15", "€20+", etc.
// Returns null when nothing parseable is present.
export function parsePriceRangeMidpoint(input: string | null | undefined): number | null {
  if (!input) return null;
  const cleaned = String(input).trim();
  if (!cleaned) return null;
  // Two-number form: 15-20, 15–20, 15 to 20
  const range = cleaned.match(/(\d+(?:[.,]\d+)?)\s*(?:[-–—]|to)\s*(\d+(?:[.,]\d+)?)/i);
  if (range) {
    const lo = parseFloat(range[1].replace(",", "."));
    const hi = parseFloat(range[2].replace(",", "."));
    if (Number.isFinite(lo) && Number.isFinite(hi)) return (lo + hi) / 2;
  }
  // Single-number form: €17, USD 20, 15+
  const single = cleaned.match(/(\d+(?:[.,]\d+)?)/);
  if (single) {
    const v = parseFloat(single[1].replace(",", "."));
    if (Number.isFinite(v)) return v;
  }
  return null;
}

interface ActivityCostInput {
  price_level?: string | null;
  priceRange?: string | null;
  estimated_cost_per_person?: number | null;
}

// Best-available per-person cost estimate for an activity, in trip currency.
// Preference order (per CLAUDE.md: external data is facts, LLM is enrichment):
//   1. priceRange midpoint (Places explicit)
//   2. priceLevel midpoint (Places enum)
//   3. estimated_cost_per_person (LLM fallback)
//   4. 0 (missing data — never break math)
export function estimateActivityCost(activity: ActivityCostInput): number {
  const fromRange = parsePriceRangeMidpoint(activity.priceRange);
  if (fromRange != null) return fromRange;

  const level = activity.price_level as PriceLevel | null | undefined;
  if (level && level in ACTIVITY_PRICE_LEVEL_MIDPOINT) {
    return ACTIVITY_PRICE_LEVEL_MIDPOINT[level];
  }

  const llm = activity.estimated_cost_per_person;
  if (typeof llm === "number" && Number.isFinite(llm)) return Math.max(0, llm);

  return 0;
}

interface AccommodationCostInput {
  price_level?: string | null;
  priceRange?: string | null;
  estimated_cost_per_person?: number | null;
  // Legacy field from older cached responses; still seen in some plans.
  price_per_night?: number | null;
}

// Per-night accommodation cost. Same preference order, then legacy, then tier default.
export function estimateAccommodationPerNight(
  accommodation: AccommodationCostInput | null | undefined,
  budgetTier?: string | null,
): number {
  const tierKey = normalizeTier(budgetTier);
  const tierDefault =
    ACCOMMODATION_TIER_DEFAULT_PER_NIGHT[tierKey] ??
    ACCOMMODATION_TIER_DEFAULT_PER_NIGHT["mid-range"];

  if (!accommodation) return tierDefault;

  const fromRange = parsePriceRangeMidpoint(accommodation.priceRange);
  if (fromRange != null) return fromRange;

  const level = accommodation.price_level as PriceLevel | null | undefined;
  if (level && level in ACCOMMODATION_PRICE_LEVEL_MIDPOINT) {
    return ACCOMMODATION_PRICE_LEVEL_MIDPOINT[level];
  }

  const llm = accommodation.estimated_cost_per_person;
  if (typeof llm === "number" && Number.isFinite(llm) && llm > 0) return llm;

  const legacy = accommodation.price_per_night;
  if (typeof legacy === "number" && Number.isFinite(legacy) && legacy > 0) return legacy;

  return tierDefault;
}

// Standard hotel-math nights: checkout day doesn't count.
// 3-day trip Apr 20–22 → 2 nights.
export function nightsBetween(startISO: string | null | undefined, endISO: string | null | undefined): number {
  if (!startISO || !endISO) return 0;
  try {
    const n = differenceInCalendarDays(parseISO(endISO), parseISO(startISO));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface TripBudget {
  activitiesTotal: number;
  accommodationTotal: number;
  total: number;
  dailyAvg: number;
  categories: Array<[string, number]>;
  nights: number;
  days: number;
  currency: string;
}

// Single source of truth for trip-total budget math. Every cost surface in the
// app routes through this so the preview, sticky footer, dashboard, and any
// summary cards stay in lockstep.
export function computeTripBudget(result: AITripResult, budgetTier?: string | null): TripBudget {
  const categories: Record<string, number> = {};
  let activitiesTotal = 0;
  let totalDays = 0;

  for (const dest of result.destinations) {
    for (const day of dest.days) {
      totalDays++;
      for (const act of day.activities) {
        const cost = estimateActivityCost(act);
        activitiesTotal += cost;
        const rawCat = (act.category || "Other").toLowerCase().trim();
        const cat = titleCase(rawCat);
        categories[cat] = (categories[cat] || 0) + cost;
      }
    }
  }

  let accommodationTotal = 0;
  let totalNights = 0;
  for (const dest of result.destinations) {
    if (!dest.accommodation) continue;
    const nights = nightsBetween(dest.start_date, dest.end_date);
    if (nights === 0) continue;
    totalNights += nights;
    const perNight = estimateAccommodationPerNight(dest.accommodation, budgetTier);
    const subtotal = perNight * nights;
    accommodationTotal += subtotal;
    categories["Accommodation"] = (categories["Accommodation"] || 0) + subtotal;
  }

  const total = activitiesTotal + accommodationTotal;
  const days = totalDays || 1;
  const dailyAvg = Math.round(total / days);
  const sortedCats = Object.entries(categories).sort((a, b) => b[1] - a[1]);

  return {
    activitiesTotal: Math.round(activitiesTotal),
    accommodationTotal: Math.round(accommodationTotal),
    total: Math.round(total),
    dailyAvg,
    categories: sortedCats,
    nights: totalNights,
    days: totalDays,
    currency: result.currency || "USD",
  };
}

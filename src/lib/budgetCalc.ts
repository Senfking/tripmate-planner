import { differenceInCalendarDays, parseISO } from "date-fns";
import type { AITripResult } from "@/components/trip-results/useResultsState";

export type PriceLevel =
  | "PRICE_LEVEL_FREE"
  | "PRICE_LEVEL_INEXPENSIVE"
  | "PRICE_LEVEL_MODERATE"
  | "PRICE_LEVEL_EXPENSIVE"
  | "PRICE_LEVEL_VERY_EXPENSIVE";

// LEGACY currency-blind fallbacks. Numbers are EUR/USD-shaped but the
// surrounding code adds them to sums in the trip's local currency. For
// JPY/KRW/IDR/HUF/etc. these collapse to ~€0 contributions. They're kept
// only to handle ancient cached plans that lack `estimated_cost_per_person`
// — never use them for fresh AI output. The backend already produces
// destination-aware, currency-correct values via the Haiku baseline +
// per-hotel estimate path; `estimateActivityCost` and
// `estimateAccommodationPerNight` consult `estimated_cost_per_person` first
// and fall through here only when that field is absent.
export const ACTIVITY_PRICE_LEVEL_MIDPOINT: Record<PriceLevel, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 10,
  PRICE_LEVEL_MODERATE: 30,
  PRICE_LEVEL_EXPENSIVE: 75,
  PRICE_LEVEL_VERY_EXPENSIVE: 150,
};

// Same caveat as ACTIVITY_PRICE_LEVEL_MIDPOINT — currency-blind, last-resort
// fallback only.
const ACCOMMODATION_PRICE_LEVEL_MIDPOINT: Record<PriceLevel, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 60,
  PRICE_LEVEL_MODERATE: 130,
  PRICE_LEVEL_EXPENSIVE: 260,
  PRICE_LEVEL_VERY_EXPENSIVE: 500,
};

// Conservative per-night defaults when we have no pricing signal at all.
// Currency-blind — see ACCOMMODATION_PRICE_LEVEL_MIDPOINT note above.
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
// Preference order:
//   1. priceRange midpoint (Places-explicit, currency-aware via the format
//      string the backend emits — "¥1500-3000", "€20-30", etc).
//   2. estimated_cost_per_person (backend-clamped against destination Haiku
//      baselines + price_level + tier; the most reliable single value).
//   3. priceLevel midpoint — LEGACY currency-blind fallback. Only fires
//      when the backend produced no clamped value (very old cached plans).
//   4. 0 (missing data — never break math).
//
// Originally (1) → (2 priceLevel) → (3 LLM) → 0. The priceLevel branch
// returned EUR-shaped constants summed into JPY/KRW/etc. trip totals,
// collapsing food + cultural items to ~€0. `estimated_cost_per_person`
// now ranks ahead of priceLevel because the backend already merged
// price_level + Haiku baselines into that value in the trip currency.
export function estimateActivityCost(activity: ActivityCostInput): number {
  const fromRange = parsePriceRangeMidpoint(activity.priceRange);
  if (fromRange != null) return fromRange;

  const llm = activity.estimated_cost_per_person;
  if (typeof llm === "number" && Number.isFinite(llm)) return Math.max(0, llm);

  const level = activity.price_level as PriceLevel | null | undefined;
  if (level && level in ACTIVITY_PRICE_LEVEL_MIDPOINT) {
    return ACTIVITY_PRICE_LEVEL_MIDPOINT[level];
  }

  return 0;
}

interface AccommodationCostInput {
  price_level?: string | null;
  priceRange?: string | null;
  estimated_cost_per_person?: number | null;
  // Legacy field from older cached responses; still seen in some plans.
  price_per_night?: number | null;
}

// Per-night accommodation cost. Preference order mirrors estimateActivityCost:
//   1. priceRange midpoint (Places-explicit, currency-aware).
//   2. estimated_cost_per_person — backend-clamped per-person rate (already
//      double-occupancy adjusted via Haiku per-hotel estimate or destination
//      lodging baseline). This is the value the backend treats as truth.
//   3. price_level midpoint — LEGACY currency-blind fallback.
//   4. legacy price_per_night field on old cached plans.
//   5. tier default — also currency-blind.
//
// `estimated_cost_per_person` now ranks ahead of price_level so JPY/KRW/etc.
// trips don't collapse to ~€1/night via the constant table.
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

  const llm = accommodation.estimated_cost_per_person;
  if (typeof llm === "number" && Number.isFinite(llm) && llm > 0) return llm;

  const level = accommodation.price_level as PriceLevel | null | undefined;
  if (level && level in ACCOMMODATION_PRICE_LEVEL_MIDPOINT) {
    return ACCOMMODATION_PRICE_LEVEL_MIDPOINT[level];
  }

  const legacy = accommodation.price_per_night;
  if (typeof legacy === "number" && Number.isFinite(legacy) && legacy > 0) return legacy;

  return tierDefault;
}

// Standard hotel-math nights: checkout day doesn't count.
// 3-day trip Apr 20–22 → 2 nights. Backend mirrors this rule via
// `Math.max(0, dest.days.length - 1)` in computeTripTotalEstimate so the
// frontend rollup and the persisted trip_total_estimate agree.
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

// TODO(post-launch): The backend already computes trip_total_estimate and
// daily_budget_estimate via computeTripTotalEstimate, plus the daily-living
// additive. This frontend duplicate aggregator is a drift risk. Have the
// backend ship the full structured breakdown (per-category and per-day) and
// remove this frontend rollup. Today it runs only for legacy plans where
// trip_total_estimate is absent on result; TripResultsView consults
// result.trip_total_estimate directly when present.
//
// LEGACY rollup. TripResultsView now uses result.trip_total_estimate as the
// source of truth when present and only falls back here for cached plans
// saved before the persistence fix. The category breakdown surface still
// uses this output, since the backend doesn't ship a per-category split.
// Logs a `[budget_rollup]` line so cold-cache plans are visible in
// production.
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

  // eslint-disable-next-line no-console
  console.log(
    `[budget_rollup] frontend_legacy_fallback currency=${result.currency || "USD"} ` +
      `total=${Math.round(total)} ` +
      `activities=${Math.round(activitiesTotal)} ` +
      `accommodation=${Math.round(accommodationTotal)} ` +
      `days=${totalDays} nights=${totalNights} ` +
      `categories=${sortedCats.length}`,
  );

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

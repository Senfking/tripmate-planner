import type { GooglePriceLevel } from "@/hooks/useGooglePlaceDetails";

/**
 * Cost profile as returned by the AI per destination.
 * Each range is a [min, max] tuple in the local currency.
 */
export interface CostProfileRange {
  budget: [number, number];
  midrange: [number, number];
  premium: [number, number];
}

export interface CostProfile {
  currency: string;
  meal: CostProfileRange;
  activity: CostProfileRange;
  hotel_night: CostProfileRange & { luxury: [number, number] };
  transport: { local: [number, number]; intercity: [number, number] };
}

type CostCategory = "food" | "culture" | "nature" | "nightlife" | "adventure" | "relaxation" | "transport" | "accommodation";

/**
 * Maps an activity category to the corresponding cost_profile field.
 */
function categoryToProfileField(category: CostCategory): keyof Pick<CostProfile, "meal" | "activity"> | null {
  switch (category) {
    case "food":
      return "meal";
    case "culture":
    case "nature":
    case "nightlife":
    case "adventure":
    case "relaxation":
      return "activity";
    default:
      return null;
  }
}

/**
 * Maps a Google price level to a value from the cost profile.
 */
function priceLevelToValue(
  priceLevel: GooglePriceLevel,
  range: CostProfileRange,
): number {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":
      return 0;
    case "PRICE_LEVEL_INEXPENSIVE":
      return Math.round((range.budget[0] + range.budget[1]) / 2);
    case "PRICE_LEVEL_MODERATE":
      return Math.round((range.midrange[0] + range.midrange[1]) / 2);
    case "PRICE_LEVEL_EXPENSIVE":
      return Math.round((range.premium[0] + range.premium[1]) / 2);
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return Math.round(range.premium[1] * 1.3);
    default:
      return -1; // unknown — signal to keep original
  }
}

/**
 * Calibrates an activity cost using Google's price level data.
 *
 * Only recalibrates when BOTH costProfile and priceLevel are available.
 * Returns the calibrated value only if it differs from the original by > 30%,
 * to avoid micro-adjustments. If priceLevel is missing (most non-restaurant
 * venues), keeps the AI's original estimate.
 *
 * @param originalCost  The AI-generated estimated_cost_per_person
 * @param costProfile   The destination's cost_profile (from AI)
 * @param category      The activity category
 * @param priceLevel    Google Places price level (may be null)
 * @returns             The calibrated cost, or the original if no adjustment needed
 */
export function calibrateCost(
  originalCost: number,
  costProfile: CostProfile | null | undefined,
  category: string,
  priceLevel: GooglePriceLevel | null | undefined,
): number {
  // Only recalibrate if BOTH costProfile and priceLevel are available
  if (!costProfile || !priceLevel) {
    return originalCost;
  }

  const profileField = categoryToProfileField(category as CostCategory);
  if (!profileField) {
    return originalCost;
  }

  const range = costProfile[profileField];
  if (!range) {
    return originalCost;
  }

  const calibrated = priceLevelToValue(priceLevel, range);
  if (calibrated < 0) {
    return originalCost; // unknown price level
  }

  // Only apply if the difference exceeds 30%
  if (originalCost === 0 && calibrated === 0) {
    return 0;
  }

  const reference = Math.max(originalCost, calibrated, 1);
  const diff = Math.abs(calibrated - originalCost) / reference;

  if (diff > 0.3) {
    return calibrated;
  }

  return originalCost;
}

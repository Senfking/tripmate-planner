import type { BudgetLevel, PaceLevel } from "./useTripBuilderDefaults";

export type ParsedFreeText = {
  destination: string | null;
  groupSize: number | null;
  durationDays: number | null;
  budgetLevel: BudgetLevel | null;
  vibes: string[];
  dietary: string[];
  notes: string;
};

const VIBE_KEYWORDS: Record<string, string> = {
  beach: "Beach",
  beaches: "Beach",
  culture: "Culture",
  cultural: "Culture",
  museum: "Culture",
  museums: "Culture",
  historical: "Culture",
  history: "Culture",
  food: "Food",
  foodie: "Food",
  cuisine: "Food",
  restaurant: "Food",
  restaurants: "Food",
  eating: "Food",
  nightlife: "Nightlife",
  "night life": "Nightlife",
  clubbing: "Nightlife",
  clubs: "Nightlife",
  bars: "Nightlife",
  party: "Nightlife",
  parties: "Nightlife",
  adventure: "Adventure",
  hiking: "Adventure",
  trekking: "Adventure",
  outdoor: "Adventure",
  outdoors: "Adventure",
  nature: "Adventure",
  relaxation: "Relaxation",
  relax: "Relaxation",
  spa: "Relaxation",
  wellness: "Relaxation",
  chill: "Relaxation",
  shopping: "Shopping",
  shop: "Shopping",
  sightseeing: "Sightseeing",
  "sight seeing": "Sightseeing",
  landmarks: "Sightseeing",
};

const DIETARY_KEYWORDS: Record<string, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  halal: "Halal",
  "gluten free": "Gluten-free",
  "gluten-free": "Gluten-free",
};

export function parseFreeText(text: string): ParsedFreeText {
  const lower = text.toLowerCase();

  // Group size
  let groupSize: number | null = null;
  const groupMatch = lower.match(/(\d+)\s*(friends|people|of us|persons|mates|pax)/i);
  if (groupMatch) groupSize = parseInt(groupMatch[1], 10);

  // Duration
  let durationDays: number | null = null;
  const durMatch = lower.match(/(\d+)\s*(days?|nights?)/i);
  if (durMatch) durationDays = parseInt(durMatch[1], 10);
  const weekMatch = lower.match(/(\d+)\s*weeks?/i);
  if (weekMatch) durationDays = parseInt(weekMatch[1], 10) * 7;
  // "a week" / "a long weekend"
  if (!durationDays && /\ba\s+week\b/i.test(lower)) durationDays = 7;
  if (!durationDays && /\bweekend\b/i.test(lower)) durationDays = 3;

  // Budget
  let budgetLevel: BudgetLevel | null = null;
  const budgetPerDay = lower.match(/[€$£]?\s*(\d+)\s*[\/\s]*(per\s*day|a\s*day|\/day|daily)/i);
  if (budgetPerDay) {
    const amount = parseInt(budgetPerDay[1], 10);
    if (amount <= 50) budgetLevel = "budget";
    else if (amount <= 150) budgetLevel = "mid-range";
    else budgetLevel = "premium";
  }
  if (!budgetLevel) {
    if (/\b(budget|cheap|backpack|hostel)\b/i.test(lower)) budgetLevel = "budget";
    else if (/\b(luxury|premium|fancy|5[\s-]?star|five[\s-]?star)\b/i.test(lower)) budgetLevel = "premium";
    else if (/\b(mid[\s-]?range|moderate|comfortable)\b/i.test(lower)) budgetLevel = "mid-range";
  }

  // Vibes
  const vibes: string[] = [];
  for (const [keyword, vibe] of Object.entries(VIBE_KEYWORDS)) {
    if (lower.includes(keyword) && !vibes.includes(vibe)) {
      vibes.push(vibe);
    }
  }

  // Dietary
  const dietary: string[] = [];
  for (const [keyword, diet] of Object.entries(DIETARY_KEYWORDS)) {
    if (lower.includes(keyword) && !dietary.includes(diet)) {
      dietary.push(diet);
    }
  }

  // Destination: look for "to X" or "in X" patterns, grab capitalized words
  let destination: string | null = null;
  const destMatch = text.match(/(?:to|in|visiting|going to|headed to|trip to)\s+([A-Z][a-zA-Z\s]+?)(?:\s+for|\s+in|\s+with|\s+over|\s*,|\s*\.|\s*$)/);
  if (destMatch) {
    destination = destMatch[1].trim();
    // Remove trailing common words
    destination = destination.replace(/\s+(for|in|with|over|and|the|our|my)$/i, "").trim();
    if (destination.length < 2) destination = null;
  }

  return {
    destination,
    groupSize,
    durationDays,
    budgetLevel,
    vibes,
    dietary,
    notes: text,
  };
}

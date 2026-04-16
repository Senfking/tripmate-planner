import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BudgetLevel = "budget" | "mid-range" | "premium";
type Pace = "packed" | "balanced" | "relaxed";

interface TripBuilderRequest {
  trip_id?: string | null;
  destination?: string | null;
  surprise_me?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  flexible?: boolean;
  duration_days?: number | null;
  group_size?: number;
  budget_level?: BudgetLevel;
  vibes?: string[];
  interests?: string[];
  dietary?: string[];
  pace?: Pace;
  notes?: string | null;
  free_text?: string | null;
  alternatives_mode?: boolean;
  user_description?: string | null;
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

function buildCacheKey(r: TripBuilderRequest, dest: string, numDays: number): string {
  const interests = r.vibes || r.interests || [];
  const parts = [
    dest.toLowerCase().trim(),
    String(numDays),
    String(r.group_size || 1),
    r.budget_level || "mid-range",
    [...interests].sort().join(","),
    [...(r.dietary || [])].sort().join(","),
    r.pace || "balanced",
  ];
  return parts.join("|");
}

/** Generate fake start/end dates for flexible trips */
function generateFlexDates(durationDays: number): { start: string; end: string } {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays - 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(start), end: fmt(end) };
}

// ---------------------------------------------------------------------------
// Lovable AI Gateway call
// ---------------------------------------------------------------------------

interface AIResult {
  itinerary: Record<string, unknown> | null;
  inputTokens: number;
  outputTokens: number;
}

async function callLovableAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  toolSchema: Record<string, unknown>,
): Promise<AIResult> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: toolSchema,
        },
      ],
      tool_choice: { type: "function", function: { name: toolSchema.name } },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("AI Gateway error:", res.status, errText);
    if (res.status === 429) {
      throw new Error("AI rate limit exceeded. Please try again in a moment.");
    }
    if (res.status === 402) {
      throw new Error("AI credits exhausted. Please add funds.");
    }
    throw new Error(`AI gateway error ${res.status}`);
  }

  const data = await res.json();
  const usage = data.usage || {};
  const choice = data.choices?.[0];

  // Extract from tool call
  const toolCall = choice?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      return {
        itinerary: parsed,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      };
    } catch (e) {
      console.error("Failed to parse tool call arguments:", (e as Error).message);
    }
  }

  // Fallback: try content as JSON
  const content = choice?.message?.content;
  if (content) {
    try {
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1));
        return {
          itinerary: parsed,
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        };
      }
    } catch {
      console.error("Fallback content parse failed");
    }
  }

  return { itinerary: null, inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0 };
}

// ---------------------------------------------------------------------------
// Post-processing / normalization
// ---------------------------------------------------------------------------

const MAX_ACTIVITY_DURATION = 480;

const DURATION_DEFAULTS_BY_CATEGORY: Record<string, number> = {
  accommodation: 60,
  food: 90,
  culture: 120,
  nightlife: 180,
  relaxation: 180,
  transport: 30,
};

function defaultDurationForCategory(category: unknown): number {
  if (typeof category === "string" && category in DURATION_DEFAULTS_BY_CATEGORY) {
    return DURATION_DEFAULTS_BY_CATEGORY[category];
  }
  return 120;
}

function normalizeActivity(activity: Record<string, unknown>): Record<string, unknown> {
  const rawDuration = activity.duration_minutes;
  const duration = typeof rawDuration === "number" && Number.isFinite(rawDuration) ? rawDuration : NaN;
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_ACTIVITY_DURATION) {
    activity.duration_minutes = defaultDurationForCategory(activity.category);
  }

  const rawCost = activity.estimated_cost_per_person;
  if (typeof rawCost !== "number" || !Number.isFinite(rawCost)) {
    activity.estimated_cost_per_person = 0;
  }

  return activity;
}

// ---------------------------------------------------------------------------
// Cost validation helpers (Layer 2)
// ---------------------------------------------------------------------------

interface CostRange {
  budget: [number, number];
  midrange: [number, number];
  premium: [number, number];
}

interface CostProfile {
  currency: string;
  meal: CostRange;
  activity: CostRange;
  hotel_night: CostRange & { luxury: [number, number] };
  transport: { local: [number, number]; intercity: [number, number] };
}

function isValidRange(r: unknown): r is [number, number] {
  return Array.isArray(r) && r.length >= 2
    && typeof r[0] === "number" && typeof r[1] === "number"
    && Number.isFinite(r[0]) && Number.isFinite(r[1])
    && r[0] <= r[1];
}

function parseCostProfile(raw: unknown): CostProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const cp = raw as Record<string, any>;
  if (typeof cp.currency !== "string" || !cp.currency) return null;

  const categories = ["meal", "activity", "hotel_night", "transport"];
  for (const cat of categories) {
    if (!cp[cat] || typeof cp[cat] !== "object") return null;
  }

  // Validate ranges exist (we'll fix ordering issues below)
  for (const cat of ["meal", "activity"]) {
    for (const tier of ["budget", "midrange", "premium"]) {
      if (!isValidRange(cp[cat]?.[tier])) return null;
    }
  }
  for (const tier of ["budget", "midrange", "premium", "luxury"]) {
    if (!isValidRange(cp.hotel_night?.[tier])) return null;
  }
  for (const tier of ["local", "intercity"]) {
    if (!isValidRange(cp.transport?.[tier])) return null;
  }

  return cp as unknown as CostProfile;
}

/** Validate internal consistency: budget < midrange < premium */
function validateCostProfileConsistency(cp: CostProfile): void {
  for (const cat of ["meal", "activity"] as const) {
    const ranges = cp[cat];
    // Ensure budget.max <= midrange.min and midrange.max <= premium.min
    if (ranges.budget[1] > ranges.midrange[0]) {
      ranges.midrange[0] = ranges.budget[1];
    }
    if (ranges.midrange[1] > ranges.premium[0]) {
      ranges.premium[0] = ranges.midrange[1];
    }
  }
  const hn = cp.hotel_night;
  if (hn.budget[1] > hn.midrange[0]) hn.midrange[0] = hn.budget[1];
  if (hn.midrange[1] > hn.premium[0]) hn.premium[0] = hn.midrange[1];
  if (hn.premium[1] > hn.luxury[0]) hn.luxury[0] = hn.premium[1];
}

/**
 * Currency denomination check (Layer 2b).
 * Detects when the AI likely generated USD-scale numbers for a high-denomination
 * currency and applies a correction factor.
 */
function currencyDenominationCheck(
  activities: Record<string, unknown>[],
  cp: CostProfile | null,
): number {
  // Collect all non-zero costs
  const costs = activities
    .map((a) => a.estimated_cost_per_person as number)
    .filter((c) => typeof c === "number" && c > 0);

  if (costs.length === 0) return 1;

  // Compute median
  const sorted = [...costs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Expected order-of-magnitude thresholds by currency
  const thresholds: Record<string, number> = {
    IDR: 10000, VND: 10000,
    JPY: 100, KRW: 100,
    USD: 1, EUR: 1, GBP: 1, AUD: 1, CHF: 1, SGD: 1, CAD: 1, NZD: 1,
    KWD: 0.1, BHD: 0.1, OMR: 0.1,
    THB: 10, PHP: 10, MXN: 10, INR: 10, TWD: 10, CZK: 10,
    HUF: 100, ISK: 100, CLP: 100, COP: 1000, MMK: 1000,
    RUB: 10, BRL: 1, ZAR: 10, TRY: 10, SEK: 10, NOK: 10, DKK: 10, PLN: 1,
    MYR: 1, AED: 1, SAR: 1, QAR: 1, HKD: 1,
    CNY: 1, EGP: 10, MAD: 10, LKR: 100, NPR: 100, PKR: 100, BDT: 10,
    KES: 100, NGN: 100, GHS: 1, TZS: 1000, UGX: 1000,
    ARS: 100, PEN: 1, UYU: 10, BOB: 1, PYG: 1000, DOP: 10, CRC: 100,
    JMD: 100, GTQ: 1, HNL: 10, NIO: 10,
    KHR: 1000, LAK: 10000, MNT: 1000, UZS: 10000, KZT: 100,
    GEL: 1, AMD: 100, RSD: 100, ALL: 100, MKD: 10,
    BGN: 1, RON: 1, HRK: 1, BAM: 1,
    XOF: 100, XAF: 100, XPF: 100,
    FJD: 1, WST: 1, TOP: 1, PGK: 1,
  };

  const currency = cp?.currency || "";
  const threshold = thresholds[currency];
  if (!threshold) return 1; // Unknown currency — can't validate

  if (median >= threshold) return 1; // Looks correctly denominated

  // If we have a cost_profile, use meal.midrange as the reference
  if (cp) {
    const expectedMidMeal = (cp.meal.midrange[0] + cp.meal.midrange[1]) / 2;
    if (expectedMidMeal > 0 && expectedMidMeal < threshold) {
      // Cost profile is also wrong — correct both using the threshold
      // Use ratio of expected midrange meal for this currency vs what AI gave
      const typicalMidMeal = threshold * 10; // rough heuristic: midrange meal ~ 10x threshold
      const factor = typicalMidMeal / expectedMidMeal;
      console.warn(`[cost-validation] Currency ${currency}: cost_profile also appears USD-scale. Applying factor ${factor.toFixed(1)}`);
      return factor;
    }
    const factor = expectedMidMeal / median;
    if (factor > 2) {
      console.warn(`[cost-validation] Currency ${currency}: median activity cost ${median} below threshold ${threshold}. Correction factor: ${factor.toFixed(1)}`);
      return factor;
    }
  } else {
    // No cost_profile — use threshold-based heuristic
    const factor = threshold / median;
    if (factor > 5) {
      console.warn(`[cost-validation] Currency ${currency}: median ${median} far below threshold ${threshold}. Applying factor ${factor.toFixed(1)}`);
      return factor;
    }
  }

  return 1;
}

/** Map activity category to cost_profile field */
function categoryToCostField(category: string): "meal" | "activity" | null {
  switch (category) {
    case "food": return "meal";
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

// Patterns for activities that are typically free
const FREE_ACTIVITY_PATTERNS = /\b(beach|temple visit|walk|park|sunset|sunrise|window shopping|street art|public garden|promenade|plaza|square|boardwalk|waterfront|viewpoint|lookout)\b/i;

/**
 * Per-activity cost validation (Layer 2c).
 * Validates and clamps individual activity costs against the cost_profile.
 */
function validateActivityCosts(
  activities: Record<string, unknown>[],
  cp: CostProfile | null,
): void {
  if (!cp) return;

  for (const activity of activities) {
    const cost = activity.estimated_cost_per_person;
    if (typeof cost !== "number") continue;

    const category = activity.category as string;
    const title = (activity.title as string || "").toLowerCase();
    const costField = categoryToCostField(category);

    // If cost is 0 but category is food/nightlife/accommodation, set to budget midpoint
    if (cost === 0 && (category === "food" || category === "nightlife")) {
      const field = category === "food" ? "meal" : "activity";
      const range = cp[field].budget;
      activity.estimated_cost_per_person = Math.round((range[0] + range[1]) / 2);
      continue;
    }

    // If cost > 0 but activity looks clearly free, set to 0
    if (cost > 0 && FREE_ACTIVITY_PATTERNS.test(title) && category !== "food" && category !== "nightlife") {
      activity.estimated_cost_per_person = 0;
      continue;
    }

    // Validate against appropriate range — clamp outliers
    if (costField && cp[costField]) {
      const premiumMax = cp[costField].premium[1];
      if (cost > premiumMax * 3) {
        activity.estimated_cost_per_person = premiumMax;
        console.warn(`[cost-validation] Clamped "${activity.title}" from ${cost} to ${premiumMax} (> 3x premium max)`);
      }
    }
  }
}

/**
 * Trip-level sanity check (Layer 2d).
 * Verifies that total daily cost aligns with budget level.
 */
function tripSanityCheck(
  destinations: any[],
  budgetLevel: string,
): void {
  for (const dest of destinations) {
    const cp = parseCostProfile(dest.cost_profile);
    if (!cp) continue;

    const days = dest.days;
    if (!Array.isArray(days)) continue;

    const midrangeMealPrice = (cp.meal.midrange[0] + cp.meal.midrange[1]) / 2;
    if (midrangeMealPrice <= 0) continue;

    for (const day of days) {
      const activities = day?.activities;
      if (!Array.isArray(activities)) continue;

      let dailyTotal = 0;
      for (const act of activities) {
        dailyTotal += (act.estimated_cost_per_person as number) || 0;
      }

      if (budgetLevel === "budget" && dailyTotal > midrangeMealPrice * 5) {
        console.warn(`[cost-validation] Budget trip sanity: day ${day.day_number} in ${dest.name} has daily total ${dailyTotal}, > 5x midrange meal (${midrangeMealPrice})`);
      }
      if (budgetLevel === "premium" && dailyTotal > 0 && dailyTotal < midrangeMealPrice) {
        console.warn(`[cost-validation] Premium trip sanity: day ${day.day_number} in ${dest.name} has daily total ${dailyTotal}, < midrange meal (${midrangeMealPrice})`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main normalization
// ---------------------------------------------------------------------------

function normalizeAIResponse(
  itinerary: Record<string, unknown> | null,
  budgetLevel: string = "mid-range",
): Record<string, unknown> | null {
  if (!itinerary) return itinerary;

  const destinations = (itinerary as any).destinations;
  if (Array.isArray(destinations)) {
    for (const dest of destinations) {
      const days = dest?.days;
      if (!Array.isArray(days)) continue;

      // Collect all activities for this destination
      const allActivities: Record<string, unknown>[] = [];

      for (const day of days) {
        const activities = day?.activities;
        if (!Array.isArray(activities)) continue;
        for (const activity of activities) {
          if (activity && typeof activity === "object") {
            normalizeActivity(activity as Record<string, unknown>);
            allActivities.push(activity as Record<string, unknown>);
          }
        }
      }

      // --- Layer 2a: Cost profile validation ---
      const cp = parseCostProfile(dest.cost_profile);
      if (cp) {
        validateCostProfileConsistency(cp);

        // --- Layer 2b: Currency denomination check ---
        const correctionFactor = currencyDenominationCheck(allActivities, cp);
        if (correctionFactor !== 1) {
          // Apply correction to all activity costs
          for (const act of allActivities) {
            const c = act.estimated_cost_per_person;
            if (typeof c === "number" && c > 0) {
              act.estimated_cost_per_person = Math.round((c as number) * correctionFactor);
            }
          }
          // Also correct cost_profile values
          for (const cat of ["meal", "activity"] as const) {
            for (const tier of ["budget", "midrange", "premium"] as const) {
              cp[cat][tier][0] = Math.round(cp[cat][tier][0] * correctionFactor);
              cp[cat][tier][1] = Math.round(cp[cat][tier][1] * correctionFactor);
            }
          }
          for (const tier of ["budget", "midrange", "premium", "luxury"] as const) {
            cp.hotel_night[tier][0] = Math.round(cp.hotel_night[tier][0] * correctionFactor);
            cp.hotel_night[tier][1] = Math.round(cp.hotel_night[tier][1] * correctionFactor);
          }
          for (const tier of ["local", "intercity"] as const) {
            cp.transport[tier][0] = Math.round(cp.transport[tier][0] * correctionFactor);
            cp.transport[tier][1] = Math.round(cp.transport[tier][1] * correctionFactor);
          }
          // Correct accommodation price if present
          if (dest.accommodation?.price_per_night && typeof dest.accommodation.price_per_night === "number") {
            dest.accommodation.price_per_night = Math.round(dest.accommodation.price_per_night * correctionFactor);
          }
          // Write corrected profile back
          dest.cost_profile = cp;
        }

        // --- Layer 2c: Per-activity validation ---
        validateActivityCosts(allActivities, cp);
      } else {
        console.warn(`[cost-validation] No valid cost_profile for destination "${dest.name}" — using AI costs as-is`);
      }
    }

    // --- Layer 2d: Trip sanity check ---
    tripSanityCheck(destinations, budgetLevel);
  }

  const alternatives = (itinerary as any).alternatives;
  if (Array.isArray(alternatives)) {
    for (const activity of alternatives) {
      if (activity && typeof activity === "object") {
        normalizeActivity(activity as Record<string, unknown>);
      }
    }
  }

  return itinerary;
}

// ---------------------------------------------------------------------------
// Tool schema for structured output
// ---------------------------------------------------------------------------

function buildToolSchema(hasDietary: boolean) {
  const activityProps: Record<string, unknown> = {
    title: { type: "string", description: "Specific real venue name" },
    description: { type: "string", description: "1-2 sentences — what makes this special, not generic filler" },
    category: { type: "string", enum: ["food", "culture", "nature", "nightlife", "adventure", "relaxation", "transport", "accommodation"] },
    start_time: { type: "string", description: "HH:MM format" },
    duration_minutes: { type: "number" },
    estimated_cost_per_person: { type: "number", description: "In local currency. 0 for free activities." },
    currency: { type: "string" },
    location_name: { type: "string" },
    latitude: { type: "number" },
    longitude: { type: "number" },
    neighborhood: { type: "string", description: "Neighborhood or district name for clustering and route optimization" },
    google_maps_url: { type: "string" },
    booking_url: { type: ["string", "null"] },
    booking_required: { type: "boolean", description: "True if reservation or advance booking is needed" },
    booking_lead_time_days: { type: ["number", "null"], description: "How many days ahead to book, e.g. 21 for 3 weeks. Null if booking_required is false." },
    photo_query: { type: "string" },
    tips: { type: "string", description: "DEPRECATED — use pro_tip instead" },
    pro_tip: { type: "string", description: "REQUIRED editorial insight: timing tip, booking warning, local knowledge, which entrance/dish/seat is best" },
    skip_if: { type: ["string", "null"], description: "When this activity is NOT right for the user, e.g. 'skip if you don't like crowds' or 'skip if you've already visited a similar market'" },
    travel_time_from_previous: { type: "string" },
    travel_mode_from_previous: { type: "string" },
  };

  if (hasDietary) {
    activityProps.dietary_notes = { type: "string", description: "How this venue handles dietary needs" };
  }

  return {
    name: "generate_itinerary",
    description: "Generate a complete trip itinerary as structured data",
    parameters: {
      type: "object",
      properties: {
        trip_title: { type: "string" },
        trip_summary: { type: "string" },
        destinations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              start_date: { type: "string" },
              end_date: { type: "string" },
              intro: { type: "string" },
              days: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string" },
                    day_number: { type: "number" },
                    theme: { type: "string" },
                    activities: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: activityProps,
                        required: ["title", "category", "start_time", "duration_minutes", "latitude", "longitude"],
                      },
                    },
                  },
                  required: ["date", "day_number", "theme", "activities"],
                },
              },
              accommodation: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  stars: { type: "number" },
                  price_per_night: { type: "number" },
                  currency: { type: "string" },
                  booking_url: { type: "string" },
                },
              },
              transport_to_next: {
                type: ["object", "null"],
                properties: {
                  mode: { type: "string" },
                  duration: { type: "string" },
                  from: { type: "string" },
                  to: { type: "string" },
                },
              },
              cost_profile: {
                type: "object",
                description: "Realistic local price ranges for this destination",
                properties: {
                  currency: { type: "string", description: "ISO 4217 currency code for local currency" },
                  meal: {
                    type: "object",
                    properties: {
                      budget: { type: "array", items: { type: "number" }, description: "[min, max]" },
                      midrange: { type: "array", items: { type: "number" }, description: "[min, max]" },
                      premium: { type: "array", items: { type: "number" }, description: "[min, max]" },
                    },
                    required: ["budget", "midrange", "premium"],
                  },
                  activity: {
                    type: "object",
                    properties: {
                      budget: { type: "array", items: { type: "number" }, description: "[min, max]" },
                      midrange: { type: "array", items: { type: "number" }, description: "[min, max]" },
                      premium: { type: "array", items: { type: "number" }, description: "[min, max]" },
                    },
                    required: ["budget", "midrange", "premium"],
                  },
                  hotel_night: {
                    type: "object",
                    properties: {
                      budget: { type: "array", items: { type: "number" }, description: "[min, max]" },
                      midrange: { type: "array", items: { type: "number" }, description: "[min, max]" },
                      premium: { type: "array", items: { type: "number" }, description: "[min, max]" },
                      luxury: { type: "array", items: { type: "number" }, description: "[min, max]" },
                    },
                    required: ["budget", "midrange", "premium", "luxury"],
                  },
                  transport: {
                    type: "object",
                    properties: {
                      local: { type: "array", items: { type: "number" }, description: "[min, max]" },
                      intercity: { type: "array", items: { type: "number" }, description: "[min, max]" },
                    },
                    required: ["local", "intercity"],
                  },
                },
                required: ["currency", "meal", "activity", "hotel_night", "transport"],
              },
            },
            required: ["name", "start_date", "end_date", "days", "cost_profile"],
          },
        },
        map_center: {
          type: "object",
          properties: {
            lat: { type: "number" },
            lng: { type: "number" },
          },
          required: ["lat", "lng"],
        },
        map_zoom: { type: "number" },
        daily_budget_estimate: { type: "number" },
        currency: { type: "string" },
        packing_suggestions: { type: "array", items: { type: "string" } },
        total_activities: { type: "number" },
      },
      required: ["trip_title", "trip_summary", "destinations", "map_center", "daily_budget_estimate", "currency"],
    },
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Auth check ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authErr,
    } = await authClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    // ---- Parse & validate input ----
    const body: TripBuilderRequest = await req.json();

    if (body.alternatives_mode) {
      const altNotes = body.notes || "";
      const userDescription = body.user_description?.trim() || "";
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableApiKey) {
        return jsonResponse({ success: false, error: "LOVABLE_API_KEY not configured" }, 500);
      }

      const altToolSchema = {
        name: "suggest_alternatives",
        description: "Return 3 alternative activities",
        parameters: {
          type: "object",
          properties: {
            alternatives: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  category: { type: "string" },
                  start_time: { type: "string" },
                  duration_minutes: { type: "number" },
                  estimated_cost_per_person: { type: "number" },
                  currency: { type: "string" },
                  location_name: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  google_maps_url: { type: "string" },
                  booking_url: { type: ["string", "null"] },
                  photo_query: { type: "string" },
                  tips: { type: "string" },
                },
                required: ["title", "category", "start_time", "duration_minutes", "latitude", "longitude"],
              },
            },
          },
          required: ["alternatives"],
        },
      };

      const altSystemPrompt = userDescription
        ? "You are an expert travel planner. Suggest 3 real alternative activities that match the user's description. Use REAL venue names that actually exist. Include realistic coordinates."
        : "You are an expert travel planner. Suggest 3 real alternative activities. Use REAL venue names that actually exist. Include realistic coordinates.";

      const altUserPrompt = userDescription
        ? `${altNotes}\n\nThe user wants alternatives matching this description: '${userDescription}'. Suggest 3 alternative activities that match the user's description while fitting the day's schedule.`
        : altNotes;

      try {
        const altResult = await callLovableAI(
          lovableApiKey,
          altSystemPrompt,
          altUserPrompt,
          altToolSchema,
        );
        const normalizedAlt = normalizeAIResponse(altResult.itinerary);
        const alts = (normalizedAlt as any)?.alternatives || [];
        return jsonResponse({ success: true, alternatives: alts });
      } catch (e) {
        console.error("Alternatives generation failed:", e);
        return jsonResponse({ success: true, alternatives: [] });
      }
    }

    const {
      trip_id = null,
      destination: rawDest,
      surprise_me = false,
      start_date: rawStart,
      end_date: rawEnd,
      flexible = false,
      duration_days: rawDuration,
      group_size = 1,
      budget_level = "mid-range",
      vibes = [],
      interests: rawInterests = [],
      dietary = [],
      pace = "balanced",
      notes = null,
      free_text = null,
    } = body;

    const destination = surprise_me ? "a surprise destination (you choose an amazing, underrated destination)" : (rawDest || "").trim();
    if (!destination) {
      return jsonResponse({ success: false, error: "destination is required (or set surprise_me=true)" }, 400);
    }

    let startDate: string;
    let endDate: string;

    if (flexible || (!rawStart && !rawEnd)) {
      const dur = rawDuration && rawDuration > 0 ? Math.min(rawDuration, 21) : 7;
      const flexDates = generateFlexDates(dur);
      startDate = flexDates.start;
      endDate = flexDates.end;
    } else {
      if (!rawStart || !rawEnd) {
        return jsonResponse({ success: false, error: "start_date and end_date are required when not using flexible dates" }, 400);
      }
      startDate = rawStart;
      endDate = rawEnd;
    }

    const numDays = daysBetween(startDate, endDate);
    if (numDays < 1) {
      return jsonResponse({ success: false, error: "end_date must be on or after start_date" }, 400);
    }
    if (numDays > 21) {
      return jsonResponse({ success: false, error: "Trip duration cannot exceed 21 days" }, 400);
    }

    const clampedGroupSize = Math.max(1, Math.min(group_size, 20));
    const validBudgets: BudgetLevel[] = ["budget", "mid-range", "premium"];
    const safeBudget = validBudgets.includes(budget_level) ? budget_level : "mid-range";
    const validPaces: Pace[] = ["packed", "balanced", "relaxed"];
    const safePace = validPaces.includes(pace) ? pace : "balanced";
    const allInterests = [...new Set([...vibes, ...rawInterests])].filter(Boolean);

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return jsonResponse({ success: false, error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Cache check ----
    const cacheKey = buildCacheKey(body, destination, numDays);
    try {
      const { data: cached } = await svcClient
        .from("ai_response_cache")
        .select("response_json, created_at")
        .eq("cache_key", cacheKey)
        .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached?.response_json) {
        console.log("Cache hit for trip builder:", cacheKey.slice(0, 60));
        await svcClient.from("analytics_events").insert({
          event_name: "ai_trip_builder",
          user_id: user.id,
          properties: { source: "cache", destination: destination.trim() },
        });
        return jsonResponse({ success: true, ...cached.response_json as Record<string, unknown> });
      }
    } catch {
      console.log("Cache lookup skipped (table may not exist)");
    }

    // ---- Fetch Vibe Board data if trip_id provided ----
    let vibeContext = "";
    if (trip_id) {
      try {
        const { data: vibeAgg } = await svcClient.rpc("get_vibe_aggregates", {
          _trip_id: trip_id,
        });
        if (vibeAgg && vibeAgg.length > 0) {
          const grouped: Record<string, string[]> = {};
          for (const row of vibeAgg) {
            const key = row.question_key as string;
            const val = `${row.answer_value} (${row.response_count} votes)`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(val);
          }
          const lines = Object.entries(grouped)
            .map(([k, vals]) => `  ${k}: ${vals.join(", ")}`)
            .join("\n");
          vibeContext = `\n\nGROUP VIBE BOARD RESULTS (from trip members voting):\n${lines}\nUse these preferences to guide your choices.`;
        }
      } catch (e) {
        console.error("Failed to fetch vibe data:", e);
      }
    }

    // ---- Build AI prompt ----
    const paceGuide: Record<Pace, string> = {
      packed: "4-5 activities per day. The group wants to see and do everything.",
      balanced: "3-4 activities per day. Mix active exploration with downtime.",
      relaxed: "2-3 activities per day. Plenty of free time and slow mornings.",
    };

    const budgetGuide: Record<BudgetLevel, string> = {
      budget: "Street food, local eateries, hostels, budget guesthouses. Activities: free walking tours, public beaches, markets, temples. Transport: public transit, shared rides.",
      "mid-range": "Mid-tier restaurants, 3-star hotels, boutique stays. Activities: guided tours, cooking classes, snorkeling trips. Transport: private transfers for longer distances.",
      premium: "Fine dining, luxury resorts, 5-star hotels. Activities: private tours, spa treatments, yacht charters, exclusive experiences. Transport: private car/driver.",
    };

    const hasDietaryReqs =
      dietary.length > 0 && !dietary.every((d) => d === "none" || d === "No restrictions");
    const activeDietary = dietary.filter((d) => d !== "none" && d !== "No restrictions");
    const dietaryNote = hasDietaryReqs
      ? `\n\nDIETARY REQUIREMENTS: ${activeDietary.join(", ")}. For EVERY restaurant/food activity, include a dietary_notes field explaining how this venue accommodates these requirements.`
      : "";

    const notesSection = [];
    if (notes) notesSection.push(`SPECIAL NOTES (treat as non-negotiable constraints): "${notes}"`);
    if (free_text) notesSection.push(`FREE-TEXT DESCRIPTION FROM USER (treat preferences and dislikes as ABSOLUTE deal-breakers): "${free_text}"`);
    const accessibilityNote = notesSection.length > 0 ? `\n\n${notesSection.join("\n\n")}. These are the user's own words — treat every stated preference, dislike, or constraint as ABSOLUTE. If they conflict with a popular recommendation, drop the recommendation. Never include something the user explicitly said they don't want.` : "";

    const systemPrompt = `You are a knowledgeable local friend writing personalized trip recommendations for Junto, a group trip planning app. You are NOT a list generator. You create detailed, realistic, map-ready itineraries using REAL venues and places that actually exist.

EDITORIAL VOICE — non-negotiable:

Every activity must include AT LEAST ONE of:
- A specific timing tip ("arrive before 8am to have it nearly to yourself")
- A booking warning ("requires reservation 3 weeks ahead — book before this trip")
- A genre/style insight ("this is where locals eat, not the tourist strip on the main square")
- A "skip if" caveat ("skip if you've been to a similar one — go to X instead")
- A specific micro-detail that demonstrates real knowledge (which entrance is faster, which dish to order, which seat has the view)

NEVER write generic descriptions like "visit the museum" or "enjoy local cuisine." Every recommendation must explain WHY this specific place at THIS specific time is right for THIS user.

USE THE USER'S NOTES AND FREE-TEXT INPUT AGGRESSIVELY:
If the user said "no tourist traps," you must NOT include the obvious top-3 attractions even if they're highly rated. Find the equivalent local spot.
If the user said "no early mornings," do not schedule anything before 9am.
If the user mentioned a deal-breaker, treat it as ABSOLUTE. Better to skip a category entirely than violate it.

LOGISTICS RULES — non-negotiable:

1. PACING: Maximum 1-2 MAJOR activities per day. Surround them with smaller experiences (coffee, walks, casual meals).
2. BUFFER TIME: Insert 15-30 min buffers between every activity for transitions, bathroom breaks, spontaneous discovery.
3. FIRST DAY: Light pacing for jet lag/arrival. Don't schedule anything intensive in the first 4 hours of arrival day.
4. LAST DAY: Light pacing for departure. End final scheduled activity at least 4 hours before flight time. NEVER schedule anything ending after the user needs to leave for the airport.
5. REST DAY: For trips longer than 4 days, include at least one deliberately unstructured day or half-day.
6. ALTERNATE: Don't put two museum days back-to-back. Don't put two beach days back-to-back. Vary high-energy and restorative activities.

MEAL TIMING — culture-aware:

- Northern Europe / US: lunch 12-2pm, dinner 7-9pm
- Spain: lunch 2-4pm, dinner 9-11pm
- Italy: lunch 1-2:30pm, dinner 8-10pm
- Asia: varies by country, default lunch 12-2pm, dinner 6-9pm
- Always reserve a meal time slot AND walk time from previous activity

GROUNDING — non-negotiable:

Every venue must be a real place verifiable via Google Places. NEVER invent restaurants, hotels, or attractions. If you don't have a real recommendation, leave the slot empty rather than hallucinate.

Only suggest places you're highly confident exist. After generation, the system will validate every venue against Google Places. Anything that doesn't match will be dropped.

CRITICAL RULES:
1. Use REAL, SPECIFIC venue names that actually exist in ${destination.trim()}. Never use generic descriptions.
2. Include realistic latitude/longitude coordinates for each venue.
3. Schedule realistically: include travel time between locations, proper meal times.
4. Each day should flow naturally with buffer time between activities.
5. Balance different group interests across the trip.
6. The google_maps_url must be a valid Google Maps search URL.
7. Keep descriptions to 1-2 sentences max — but make them editorial, not generic. Explain what makes this place special.
8. The pro_tip field is REQUIRED for every activity — include a specific timing tip, booking warning, local insight, or micro-detail.
9. The skip_if field should be included when relevant — tell the user when this activity is NOT right for them.

DURATION GUIDANCE: duration_minutes should be the time spent AT the activity, not the total stay. Hotel check-in: 30-60 min. Restaurant meal: 60-120 min. Museum visit: 90-180 min. Bar/club: 120-180 min. Walking tour: 120-240 min. Beach/pool: 120-240 min. Never exceed 480 minutes for a single activity.

PACE: ${paceGuide[safePace]}

BUDGET LEVEL (${safeBudget}): ${budgetGuide[safeBudget]}

GROUP SIZE: ${clampedGroupSize} people.

INTERESTS: ${allInterests.length > 0 ? allInterests.join(", ") : "general sightseeing"}.

COST ESTIMATION RULES:
1. All costs MUST be in the user's requested currency or the local currency of the destination.
2. Include a cost_profile per destination with realistic LOCAL price ranges (min and max, not single values):

cost_profile: {
  currency: '<LOCAL_CURRENCY_CODE>',
  meal: { budget: [min, max], midrange: [min, max], premium: [min, max] },
  activity: { budget: [min, max], midrange: [min, max], premium: [min, max] },
  hotel_night: { budget: [min, max], midrange: [min, max], premium: [min, max], luxury: [min, max] },
  transport: { local: [min, max], intercity: [min, max] }
}

3. SELF-CHECK: After generating all activities, verify:
   - Does a 'budget meal' cost more than a 'premium meal'? Fix it.
   - Is the daily total reasonable for the destination? A budget day in Bali should be ~IDR 500,000-1,500,000. A budget day in Zurich should be ~CHF 100-200.
   - Are free attractions (temples, beaches, parks, walking) marked as 0 cost?
   - Is transport priced per ride, not per day?

4. Use RANGES from cost_profile when assigning estimated_cost_per_person. Pick a specific value within the appropriate range based on the venue's positioning (a casual warung at the low end of budget, a trendy cafe at the high end of midrange).

5. Common free activities that should be cost 0: public beaches, temple visits (unless entry fee), walking tours (self-guided), park visits, window shopping, sunset watching, street art walks.

EXAMPLES of editorial voice DONE RIGHT:

Bad: "Visit the Eiffel Tower"
Good: "Eiffel Tower at 9am — enter via the south pillar to skip the longer queues. The morning light photographs better than the famous sunset shot, and you'll beat 80% of the crowd."

Bad: "Have lunch at a local restaurant"
Good: "Rue Cler market for lunch — this is where Parisians actually grocery shop. Grab a crêpe from the stand at the corner of Rue du Champ de Mars (the one with the longer local queue, not the tourist-facing one)."

Bad: "Enjoy the nightlife"
Good: "Start at Bar Hemingway at the Ritz (book a table for 9pm, dress smart-casual) — order the Clean Dirty Martini, their signature. Skip if cocktail bars aren't your thing — head to Le Syndicat on Rue du Faubourg Saint-Denis instead for natural wine and zero pretension."${dietaryNote}${accessibilityNote}${vibeContext}`;

    const userPrompt = `Plan a ${numDays}-day group trip to ${destination.trim()} for ${clampedGroupSize} people.

Dates: ${startDate} to ${endDate}${flexible ? " (flexible — dates are approximate)" : ""}
Budget: ${safeBudget}
Pace: ${safePace}
Interests: ${allInterests.length > 0 ? allInterests.join(", ") : "general"}
Dietary: ${dietary.length > 0 ? dietary.join(", ") : "none"}
${notes ? `Notes: ${notes}` : ""}
${free_text ? `User description: ${free_text}` : ""}

Generate the complete itinerary.`;

    // ---- Call Lovable AI Gateway ----
    const toolSchema = buildToolSchema(hasDietaryReqs);
    
    let aiResult: AIResult;
    try {
      aiResult = await callLovableAI(lovableApiKey, systemPrompt, userPrompt, toolSchema);
    } catch (apiErr) {
      console.error("AI Gateway error:", (apiErr as Error).message);
      return jsonResponse({ success: false, error: (apiErr as Error).message }, 500);
    }

    if (!aiResult.itinerary) {
      return jsonResponse({ success: false, error: "Failed to parse AI-generated itinerary" }, 500);
    }

    const itinerary = normalizeAIResponse(aiResult.itinerary, safeBudget)!;
    const inputTokens = aiResult.inputTokens;
    const outputTokens = aiResult.outputTokens;

    // ---- Log request ----
    try {
      await svcClient.from("ai_request_log").insert({
        user_id: user.id,
        feature: "trip_builder",
        model: "google/gemini-2.5-flash",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: 0, // Lovable AI pricing handled externally
      });
    } catch {
      console.log("ai_request_log insert skipped");
    }

    // ---- Cache the response ----
    try {
      await svcClient.from("ai_response_cache").insert({
        cache_key: cacheKey,
        response_json: itinerary,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
    } catch {
      console.log("ai_response_cache insert skipped");
    }

    // ---- Track usage ----
    await svcClient.from("analytics_events").insert({
      event_name: "ai_trip_builder",
      user_id: user.id,
      properties: {
        source: "generated",
        destination: destination.trim(),
        days: numDays,
        group_size: clampedGroupSize,
        budget_level: safeBudget,
        pace: safePace,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    });

    return jsonResponse({ success: true, ...itinerary });
  } catch (e) {
    console.error("generate-trip-itinerary error:", e);
    return jsonResponse(
      { success: false, error: (e as Error).message || "Internal error" },
      500,
    );
  }
});

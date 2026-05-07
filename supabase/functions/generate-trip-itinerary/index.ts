// generate-trip-itinerary — source-of-truth pipeline (Places-first, Claude Haiku ranker)
//
// Pipeline (non-alternatives_mode):
//   1. parseIntent          — Claude Haiku extracts structured intent from form + free text
//   2. buildSkeleton        — pure-code pacing skeleton, slot cap scales with trip length
//   3. buildPlacesQueries   — pure-code Google Places query plan, deduped + capped at 12
//   4. searchPlacesBatch    — Places Text Search with ESSENTIALS field mask (ranking pass)
//   5. hydrateFinalists     — Place Details GET with PRO field mask for the ~15 venues
//                             the ranker actually selects (photos, priceLevel, reviews)
//   6. searchEvents         — Brave/Google CSE event search (optional, parallel)
//   7. rankInParallel       — N parallel Claude Haiku per-day calls + 1 metadata call.
//                             Replaces the monolithic 60s "all days at once" call so
//                             cold-cache wall time drops from ~60s to ~20s. Streaming
//                             pipeline emits each day SSE frame as soon as its tool
//                             input arrives.
//   8. markJuntoPicks       — pure code: rating/reviews/intent-match heuristic
//   9. buildAffiliateUrl    — pure code: types[] -> Booking/Viator/GetYourGuide/Maps
//  10. validateActivities   — drop hallucinations: missing place_id, > distance, not OPERATIONAL
//
// Cost shape:
//   - Places: 20 fat text searches × $0.032  → up to 12 essentials × $0.005 + ≤15 details × $0.017
//     ≈ $0.64 → ≈ $0.32 on the Places line, plus 7d/30d cache sharing with concierge.
//   - Anthropic: prompt caching on the per-day system prompt + the shared user-content
//     block keeps subsequent parallel calls cheap. Day calls fire with ~3-4k max_tokens;
//     metadata call with 1.5k. Total wall time on cold-cache 4-day = max(15-20s).
//
// All Claude calls go to direct Anthropic API (claude-haiku-4-5-20251001) with prompt
// caching on the static system blocks + shared user-content block. The
// `alternatives_mode` branch is preserved verbatim and still uses Lovable AI Gateway / Gemini.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildGeocodeCacheKey,
  buildSearchCacheKey,
  cacheGet,
  cacheSet,
  logPlacesCall,
  placesSpendLastDayUsd,
  userGenerationsInLastHour,
} from "../_shared/places/cache.ts";
import { mirrorPhotosForPlaces } from "../_shared/places/photoMirror.ts";
import {
  decideAnonRateLimit,
  extractClientIp,
  makeRateLimitDeps,
  type RateLimitClient,
} from "../_shared/anon/rate-limit.ts";
import { decideAuthGate } from "../_shared/anon/auth-gate.ts";
import {
  type AnonStorageClient,
  persistAnonymousTrip,
} from "../_shared/anon/storage.ts";

// ---------------------------------------------------------------------------
// CORS / response helpers
// ---------------------------------------------------------------------------

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

function sseEventResponse(event: string, body: Record<string, unknown>) {
  return new Response(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`, {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

// ---------------------------------------------------------------------------
// Request body
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
  // Sent by unauthenticated visitors (the public landing-page builder). When
  // present and no Authorization bearer is supplied, the request runs through
  // the anonymous flow: tighter rate limits, the result is persisted to
  // public.anonymous_trips, and `anon_trip_id` comes back on the response.
  anon_session_id?: string | null;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

// Defensive strip for any emoji/pictograph the LLM slips into a title despite
// system-prompt rules. \p{Extended_Pictographic} covers emoji + decorative
// symbols across Unicode planes; the trailing collapse keeps spacing clean.
function stripEmojis(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

function generateFlexDates(durationDays: number): { start: string; end: string } {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays - 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(start), end: fmt(end) };
}

// ---------------------------------------------------------------------------
// Lovable AI Gateway (used ONLY by the alternatives_mode branch — kept verbatim)
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
      tools: [{ type: "function", function: toolSchema }],
      tool_choice: { type: "function", function: { name: toolSchema.name } },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("AI Gateway error:", res.status, errText);
    if (res.status === 429) throw new Error("AI rate limit exceeded. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add funds.");
    throw new Error(`AI gateway error ${res.status}`);
  }

  const data = await res.json();
  const usage = data.usage || {};
  const choice = data.choices?.[0];

  const toolCall = choice?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      return {
        itinerary: JSON.parse(toolCall.function.arguments),
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      };
    } catch (e) {
      console.error("Failed to parse tool call arguments:", (e as Error).message);
    }
  }

  const content = choice?.message?.content;
  if (content) {
    try {
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        return {
          itinerary: JSON.parse(content.slice(firstBrace, lastBrace + 1)),
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
// Activity normalization (used by alternatives_mode only)
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

/**
 * Slim normalizer used only by `alternatives_mode`. The new main pipeline produces
 * fully validated activities and does not need this safety net — the destinations
 * branch of the old normalizeAIResponse has been removed along with the cost
 * validation tower (parseCostProfile, currencyDenominationCheck, etc.) since the
 * new pipeline grounds prices in Google Places price_level rather than LLM output.
 */
function normalizeAlternatives(itinerary: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!itinerary) return itinerary;
  const alternatives = (itinerary as { alternatives?: unknown }).alternatives;
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
// Geometry
// ---------------------------------------------------------------------------

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Tool schema for the alternatives_mode branch (Lovable / Gemini)
// ---------------------------------------------------------------------------

const ALT_TOOL_SCHEMA: Record<string, unknown> = {
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

// ===========================================================================
// NEW PIPELINE — types, constants, stubs
// ===========================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";

// Anthropic Claude Haiku 4.5 pricing (USD per token)
const HAIKU_PRICING = {
  input: 1.0 / 1_000_000,         // $1.00 / MTok
  output: 5.0 / 1_000_000,        // $5.00 / MTok
  cache_write: 1.25 / 1_000_000,  // $1.25 / MTok (5-min ephemeral)
  cache_read: 0.10 / 1_000_000,   // $0.10 / MTok
};

// Google Places (New) pricing — two-pass strategy.
// Ranking pass = Essentials field mask ($0.005/call); hydration pass =
// Place Details GET per finalist with Pro field mask ($0.017/call).
const PLACES_RANKING_COST_PER_CALL = 0.005;
const PLACES_DETAILS_COST_PER_CALL = 0.017;
const MAX_PLACES_QUERIES_PER_TRIP = 12; // was 20 — tighter budget; consolidated queries cover same ground
// Multi-destination cap: each leg gets up to MAX_PLACES_QUERIES_PER_LEG
// queries, total capped at MAX_PLACES_QUERIES_PER_TRIP * 2 to keep ranking
// pass cost in line with single-destination trips. Long multi-leg trips
// (3-5 destinations) still get coverage because per-leg queries are smaller
// (no per-vibe variant explosion when only 2-3 user vibes match).
const MAX_PLACES_QUERIES_PER_LEG = 8;
const MAX_PLACES_QUERIES_PER_MULTI_TRIP = MAX_PLACES_QUERIES_PER_TRIP * 2;
// Slot budget scales with trip length AND with the user's chosen pace. Light
// trips should feel light — empty afternoons are a feature, not a bug — so
// the per-day allowance is tight and the ceiling caps short. Balanced is the
// reference shape (morning anchor + lunch + afternoon anchor + dinner). Active
// is the densest: three anchors stacked around all three meals.
//
//   leisurely → "Light":    1 anchor + dinner only on full days     (~2/day)
//   balanced  → "Balanced": 2 anchors + lunch + dinner               (~4/day)
//   active    → "Active":   3 anchors + breakfast + lunch + dinner   (~6-7/day)
//
// Ceilings (cap kicks in at): leisurely 4d / balanced 6d / active 6d.
// Bookend (arrival/departure) days override pace — travel days have natural
// constraints. The cap may overrun on light trips by a few slots due to
// bookend overhead; warning is logged but accepted.
const SLOTS_PER_DAY_BUDGET: Record<Intent["pace"], number> = {
  leisurely: 2,
  balanced: 4,
  active: 7,
};
const MAX_SLOTS_CEILING: Record<Intent["pace"], number> = {
  leisurely: 8,
  balanced: 24,
  active: 42,
};

// Floor: 20 (covers all short-trip shapes including a 3-day active stack of 18
// slots). Per-day multiplier 5: a balanced day picks ~4 distinct place_ids, +1
// of slack so trip-wide dedup has room to run on long trips. Hard ceiling 40
// to bound Places Details cost. Real trips pick 11–15 venues regardless.
const MAX_FINALIST_FLOOR = 20;
const MAX_FINALIST_CEILING = 40;
const MAX_FINALIST_PER_DAY = 5;
function computeMaxFinalists(numDays: number): number {
  return Math.min(
    MAX_FINALIST_CEILING,
    Math.max(MAX_FINALIST_FLOOR, numDays * MAX_FINALIST_PER_DAY),
  );
}

// Trips with this many days or more rank sequentially so each per-day call
// can be told which place_ids earlier days already claimed. In parallel mode
// every per-day LLM call sees avoid_place_ids=[] and independently picks the
// most popular venues from the same pool; receipt-time dedup runs in skeleton
// order, so the last day always loses contested picks. The previous threshold
// of 4 assumed 3-day trips had enough pool slack to avoid this — Lisbon and
// Porto disproved that (day 3 came back empty: kept=0, reason=dedup,
// hydrate_failed). Lowered to 2 so any multi-day trip benefits from the LLM
// being told what's claimed; cost is ~20-30s extra wall time on 2-3 day trips,
// well within PIPELINE_WALL_CLOCK_MS. 1-day trips are unaffected (single call).
const SEQUENTIAL_RANKING_MIN_DAYS = 2;

// Rate limit + circuit breaker defaults. Override via env if needed.
const DEFAULT_RATE_LIMIT_PER_HOUR = 5;                 // generations per user per rolling hour
const DEFAULT_PLACES_DAILY_BUDGET_USD = 50;            // rolling 24h Places spend hard cap

// Affiliate URL templates
//
// Booking.com URLs are built via URLSearchParams in buildBookingDestinationUrl
// using the lenient /search.html path. /searchresults.html with strict
// checkin/checkout params frequently triggers errorc_searchstring_not_found,
// while /search.html?ss=... reliably resolves to the hotel as the top result.
// The destination URL is then wrapped through Awin via wrapAwinBookingUrl so
// commission tracks against our publisher account (Awin injects aid/label
// dynamically, so we omit them from the inner URL).
const VIATOR_TEMPLATE = "https://www.viator.com/searchResults/all?text={name}&mcid={mcid}";
const GETYOURGUIDE_TEMPLATE = "https://www.getyourguide.com/s/?q={name}&partner_id={pid}";

// Default Awin merchant ID for the Booking.com LATAM program. The user is
// signed up to LATAM (international stays are commissionable regardless of
// region per official Awin/Booking.com guidance), but the value stays
// configurable via AWIN_BOOKING_MID in case the program is migrated to a
// different regional ID (APAC/NA) in future.
const DEFAULT_AWIN_BOOKING_MID = "18119";

// Builds the raw Booking.com search URL using the lenient /search.html
// resolver. We deliberately omit checkin/checkout/aid:
//   - Booking's lenient matcher places the named hotel as the top card; adding
//     strict dates often triggers errorc_searchstring_not_found.
//   - aid/label are injected dynamically by Awin via cread.php.
function buildBookingDestinationUrl(searchQuery: string): string {
  const params = new URLSearchParams();
  params.set("ss", searchQuery);
  return `https://www.booking.com/search.html?${params.toString()}`;
}

// Strip aid/label query params from a Booking.com URL before passing to Awin.
// Per Awin/Booking.com guidance: "remove all click appends from destination
// URLs so that Awin's system can dynamically insert a fresh set of parameters."
function stripBookingClickAppends(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("aid");
    u.searchParams.delete("label");
    return u.toString();
  } catch {
    return url;
  }
}

// Wrap a Booking.com destination URL through Awin's cread.php endpoint so
// clicks attribute commission to our publisher account. clickref is the trip
// ID, which lets us correlate clicks back to specific trips via Awin's
// transactions report.
//
// Returns the raw destination URL unchanged when AWIN_PUBLISHER_ID is unset
// (placeholder/empty) — preserves dev/preview behavior so missing config
// never breaks links.
function wrapAwinBookingUrl(
  destinationUrl: string,
  tripId: string | null | undefined,
  awin: { publisherId: string; merchantId: string },
): string {
  if (!awin.publisherId) return destinationUrl;
  const stripped = stripBookingClickAppends(destinationUrl);
  const params = new URLSearchParams();
  params.set("awinmid", awin.merchantId);
  params.set("awinaffid", awin.publisherId);
  if (tripId) params.set("clickref", tripId);
  params.set("ued", stripped);
  return `https://www.awin1.com/cread.php?${params.toString()}`;
}

// Google Places type buckets for affiliate routing
const LODGING_TYPES = new Set([
  "lodging", "hotel", "resort_hotel", "motel", "guest_house",
  "bed_and_breakfast", "hostel", "extended_stay_hotel",
]);
const FOOD_TYPES = new Set([
  "restaurant", "cafe", "bar", "food", "meal_takeaway", "meal_delivery",
  "bakery", "ice_cream_shop", "coffee_shop", "wine_bar", "pub",
]);
const TOURS_TYPES = new Set([
  "tourist_attraction", "museum", "amusement_park", "aquarium", "zoo", "park",
  "national_park", "art_gallery", "historical_landmark", "monument",
  "observation_deck", "beach", "hindu_temple", "buddhist_temple", "church",
  "mosque", "synagogue", "place_of_worship",
]);

// Country (ISO-3166-1 alpha-2, lowercased) -> meal-time pattern. Default =
// americas/asia. geocodeDestination supplies the country code so we don't
// have to parse "City, Country" strings (Google's result is ground truth).
const MEAL_PATTERNS: Record<string, { lunch: [number, number]; dinner: [number, number] }> = {
  es: { lunch: [14, 16], dinner: [21, 23] }, // Spain
  it: { lunch: [13, 15], dinner: [20, 22] }, // Italy
  pt: { lunch: [13, 15], dinner: [20, 22] }, // Portugal
};
const DEFAULT_MEAL_PATTERN = { lunch: [12, 14] as [number, number], dinner: [19, 21] as [number, number] };

// ---------------------------------------------------------------------------
// New types
// ---------------------------------------------------------------------------

// Multi-destination types. The LLM intent call produces a destinations[] array
// with one entry per place the user named. A separate transit-estimation Haiku
// call (estimateTransitLegs) annotates each adjacent pair with travel time and
// whether to insert a dedicated transit day. Single-destination trips collapse
// to destinations.length === 1 and transit_legs.length === 0.
interface IntentDestination {
  name: string;            // "Bangkok, Thailand" (full geocodable string)
  days_allocated: number;  // LLM-reasoned day count for this leg
  reasoning: string;       // short rationale, e.g. "City exploration + street food"
}

interface IntentTransitLeg {
  from_index: number;
  to_index: number;
  estimated_duration_hours: number;
  transit_type: "flight" | "train" | "drive" | "ferry" | "mixed";
  needs_transit_day: boolean;   // true if 4+ hours total → full transit day
  half_day_transit: boolean;    // true if 1.5-3 hours → half-day arrangement
  description: string;          // "Flight from BKK to USM + ferry, ~6 hours total"
}

interface Intent {
  destination: string;             // mirrors destinations[0].name; kept for legacy callsites
  vibes: string[];
  must_haves: string[];
  must_avoids: string[];
  budget_tier: "budget" | "mid-range" | "premium";
  pace: "leisurely" | "balanced" | "active";
  dietary: string[];
  group_composition: string;       // e.g. "couple", "family with young kids", "friends 20s"
  raw_notes: string;               // original notes/free_text passthrough
  // Free-text-derived hints. duration_days overrides the form-supplied
  // duration when the user typed "10 day trip"; named_destinations is the
  // ordered list of place names parsed from notes/free_text.
  duration_days: number | null;
  named_destinations: string[];
  // Multi-destination structure. Always populated post-parseIntent —
  // single-destination trips have destinations.length === 1 and
  // transit_legs === []. The intent parser writes destinations[] when the user
  // named multiple places; the surprise-picker / single-name fallbacks build
  // destinations[] from intent.destination after parseIntent returns.
  destinations: IntentDestination[];
  transit_legs: IntentTransitLeg[];
  // Set when the LLM dropped destinations or rebalanced day allocation away
  // from a naive split. Surfaced to the UI via trip_complete + persisted in
  // the trip payload as adjustment_notice. Null when the LLM took the user
  // request as-is (and on single-destination trips).
  adjustment_notice: string | null;
}

type SlotType =
  | "lodging"
  | "arrival"
  | "breakfast"
  | "morning_major"
  | "lunch"
  | "afternoon_major"
  | "rest"
  | "dinner"
  | "nightlife"
  | "departure"
  | "transit_buffer";

interface PacingSlot {
  type: SlotType;
  start_time: string;       // "HH:MM"
  duration_minutes: number;
  // High-level zone hint for the query planner. V1 vocabulary:
  //   "primary"     — main city neighborhood / core itinerary
  //   "transit_hub" — near airport/station (arrival / departure days)
  //   "day_trip"    — outside the city proper (reserved; not emitted by V1)
  // Query planner combines this with slot.type + intent.vibes to build queries.
  region_tag_for_queries: string;
}

interface TransitDayMeta {
  from_index: number;
  to_index: number;
  half_day: boolean;
  description: string;
}

interface DaySkeleton {
  date: string;
  day_number: number;
  theme: string;
  slots: PacingSlot[];
  // Index into the unified leg list (legs[] in builders / SSE). Each day
  // belongs to exactly one leg. For single-destination trips this is always 0.
  destination_index: number;
  // Present iff this day IS a dedicated transit leg. Half-day transit days
  // keep an arrival-shaped slot list at the destination; full transit days
  // have a transit-only slot list and skip the ranker.
  transit?: TransitDayMeta;
}

interface PlacesSearchQuery {
  textQuery: string;
  includedType?: string;
  priceLevels?: string[];
  locationBias: { circle: { center: { latitude: number; longitude: number }; radius: number } };
  // For routing the result back to the right slot pool:
  poolKey: PoolKey;
  // Index into the unified leg list (legs[]). Multi-destination trips fire
  // separate batches per leg with leg-specific location bias; the result rows
  // carry this index forward so the ranker can scope its candidate pool to
  // the day's leg. Single-destination trips always emit destinationIndex=0.
  destinationIndex: number;
}

type PoolKey =
  | "lodging"
  | "breakfast"
  | "lunch"
  | "dinner"
  | "restaurants" // shared pool used for both lunch and dinner — the consolidated base query lives here
  | "attractions"
  | "nightlife"
  | "experiences"
  | "rest";

interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

// Google Places v1 regularOpeningHours.periods entry. open is always present
// for venues that are open at least once a week; close is null for 24h-open
// venues. day: 0=Sunday..6=Saturday. Cross-midnight periods have
// close.day !== open.day.
interface OpeningHoursPeriod {
  open: { day: number; hour: number; minute: number };
  close: { day: number; hour: number; minute: number } | null;
}

interface BatchPlaceResult {
  id: string;
  displayName: string | null;
  formattedAddress: string | null;
  location: { latitude: number; longitude: number } | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;
  // Formatted from Places v1 `priceRange` structured field, e.g. "€15-20".
  // Null unless Places returned both start/end units.
  priceRange: string | null;
  types: string[];
  photos: Array<{ name: string }>;
  googleMapsUri: string | null;
  businessStatus: string | null;
  addressComponents: AddressComponent[];
  // Null when Places didn't return regularOpeningHours OR the cached entry
  // pre-dates the field-mask change. Callers must fall back to category
  // hours in that case (categoryFallbackHoursForTypes).
  openingHours: OpeningHoursPeriod[] | null;
  poolKey: PoolKey;
  // Carries the leg index forward from the search query so the ranker can
  // scope its candidate pool to the day's leg (multi-destination trips).
  // Single-destination trips always have 0 here.
  destinationIndex: number;
}

interface EventCandidate {
  name: string;
  date_iso: string | null;       // ISO-8601 date if we could parse one; null otherwise
  time: string | null;           // "HH:MM" if a time appeared in the snippet; null otherwise
  venue_name: string | null;     // best-guess venue parsed from "... at <venue>" patterns
  venue_place_id: string | null; // never populated by the searcher; ranker may fuzzy-match later
  url: string | null;
  category: string;              // "events" by default; "music" / "festival" / "culture" when the query shape implies it
  description: string;           // snippet — kept so the ranker can judge fit
  confidence: number;            // 0..1 rough prior: snippet-match only, no verification
}

type AffiliatePartner = "booking" | "viator" | "getyourguide" | "google_maps" | "event_direct";

interface EnrichedActivity {
  place_id: string;
  title: string;
  description: string;
  pro_tip: string;
  why_for_you: string;
  skip_if: string | null;
  category: string;
  start_time: string;
  duration_minutes: number;     // canonical — used for buffer math, day packing, travel-time addition
  duration_hours: number;       // derived = duration_minutes / 60 rounded to 1dp; frontend prefers this for display
  location_name: string;
  neighborhood: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  user_rating_count: number | null;
  // Google Places ground-truth pricing. Budget math prefers these over
  // estimated_cost_per_person (which is an LLM estimate). NEVER populated
  // from the ranker's output — pulled straight from the Places response.
  price_level: string | null;
  priceRange: string | null;
  photos: string[];                 // pre-built media URLs
  google_maps_url: string | null;
  estimated_cost_per_person: number;
  currency: string;
  booking_url: string;
  booking_partner: AffiliatePartner;
  is_junto_pick: boolean;
  dietary_notes?: string;
  // Snapshot of Google Places types — propagated from BatchPlaceResult.types
  // so post-pipeline validators (logOpeningHoursViolations) can do
  // category-fallback checks even on cached payloads where the underlying
  // BatchPlaceResult is no longer in scope. Optional — events have no types.
  place_types?: string[];
  // Populated for is_event rows via fuzzy-match against events[] in hydration.
  // Null for place-backed rows and for events that never matched a candidate.
  event_url: string | null;
}

interface RankedDay {
  date: string;
  day_number: number;
  theme: string;
  activities: EnrichedActivity[];
  // Index into PipelineResult.destinations[] (which is the unified leg list).
  // Lets the frontend route days into the correct leg rail. Single-destination
  // trips always have destination_index=0 on every day.
  destination_index: number;
  // Present iff this is a dedicated transit day. UI renders transit days
  // differently (no activity list, just a "Travel: A → B" card). Carries the
  // same metadata as DaySkeleton.transit so cache-hit paths can reconstruct
  // the visual without re-running the transit estimator.
  transit?: TransitDayMeta;
}

interface RankedDestination {
  // For real destinations: "Bangkok, Thailand". For transit pseudo-legs:
  // "Bangkok → Koh Phangan transit" or similar — kept as a short display label.
  name: string;
  start_date: string;
  end_date: string;
  intro: string;
  days: RankedDay[];
  accommodation?: EnrichedActivity;
  // Up to MAX_ACCOMMODATION_ALTERNATIVES alternative hydrated lodging
  // EnrichedActivity entries from the same leg's candidate pool, sorted by
  // (rating desc, reviews desc). Excludes the chosen accommodation. Empty
  // for transit legs and for real legs whose lodging pool only had one
  // candidate. Frontend uses these for in-app hotel SWAP.
  accommodation_alternatives?: EnrichedActivity[];
  // "destination" for real legs, "transit" for transit pseudo-legs. Frontend
  // rails check this to decide between activity-card list vs transit summary.
  kind?: "destination" | "transit";
  // Mirrors RankedDay.transit on the leg level so the frontend can render a
  // header/banner without scanning days. Only present when kind === "transit".
  transit?: TransitDayMeta;
  // Destination-level market price baselines used when clamping this leg's
  // activity / lodging costs (PR adding LLM-driven baselining). Persisted
  // so cache-replay paths can reuse them without re-running the Haiku call.
  // Null on transit pseudo-legs and on real legs whose baseline call failed
  // (the calc fell back to PR #264's hardcoded tier bands).
  price_baselines?: DestinationPriceBaselines | null;
}

interface PipelineResult {
  trip_title: string;
  trip_summary: string;
  // Unified leg list: real-destination legs interleaved with transit
  // pseudo-legs. Single-destination trips → destinations.length === 1.
  // Multi-destination trips → real legs + transit legs (where the transit
  // estimator decided needs_transit_day=true).
  destinations: RankedDestination[];
  map_center: { lat: number; lng: number };
  map_zoom: number;
  daily_budget_estimate: number;
  // Per-person total trip cost = sum of every activity's
  // estimated_cost_per_person across all days + sum of (per-leg
  // accommodation.estimated_cost_per_person × that leg's days_count) for
  // every real-destination leg. Multi-leg trips need this because the
  // legacy single-leg shape only surfaced ONE accommodation, so a
  // frontend computing `accommodation × num_days` would only count the
  // first leg's hotel. Single-destination trips: equals
  // (daily_budget_estimate × num_days) + (accommodation × num_days).
  trip_total_estimate: number;
  // How trip_total_estimate was derived. "calculated" = sum-of-parts (the
  // primary path; PR #261's logic). "llm_corrected" = the calculated value
  // fell wildly outside Haiku's plausible range, so we substituted the
  // range midpoint as a backstop. Frontend can show an "Estimated" badge
  // when this is "llm_corrected". See validateBudgetEstimate.
  estimation_method?: "calculated" | "llm_corrected";
  // Plausible range from the Haiku sanity-check, when available. Null when
  // the validator failed or never ran (the calculated total stays as-is).
  expected_range_eur?: [number, number] | null;
  // Per-person EUR additive covering daily living costs that aren't
  // represented as scheduled activities — unscheduled meals (breakfast +
  // any lunch/dinner the pace didn't slot), local transit, and a buffer
  // for tips/drinks/snacks. Computed deterministically from each leg's
  // Haiku food_per_meal_eur baseline. The frontend defaults to displaying
  // (trip_total_estimate + daily_living_additive_eur); a UI toggle lets
  // users see the itinerary-only number. Always EUR; convert at render.
  daily_living_additive_eur?: number;
  currency: string;
  packing_suggestions: string[];
  total_activities: number;
  // Propagated from Intent so the frontend budget helper can pick a sensible
  // per-night default when Places returns no hotel pricing.
  budget_tier: "budget" | "mid-range" | "premium";
  // Surfaced from intent.adjustment_notice when the LLM dropped destinations
  // or rebalanced day allocation. Null on plain single-destination trips and
  // on multi-destination trips where the LLM honored the user as-is.
  adjustment_notice?: string | null;
}

// Compute per-person total trip cost across all real-destination legs.
// Activities sum to all days (transit days have 0 cost). Accommodation
// uses the hotel-night convention: an N-day leg has N-1 nights — checkout
// is the morning of the last day, so the last day doesn't add a hotel
// night. Backend and frontend agree on this rule.
function computeTripTotalEstimate(destinations: RankedDestination[]): number {
  let total = 0;
  for (const dest of destinations) {
    const realDays = dest.days.length;
    for (const day of dest.days) {
      for (const a of day.activities) {
        total += a.estimated_cost_per_person || 0;
      }
    }
    if (dest.kind !== "transit" && dest.accommodation && realDays > 0) {
      const nights = Math.max(0, realDays - 1);
      total += (dest.accommodation.estimated_cost_per_person || 0) * nights;
    }
  }
  return Math.round(total);
}

// Per-person EUR additive for daily-living spend that isn't represented as
// a scheduled activity. Per leg, per day:
//   - unscheduled_meals × food_per_meal_eur.median, where unscheduled_meals
//     = 3 - min(3, count of activities tagged category="food"). Pace
//     patterns top out at breakfast+lunch+dinner; "balanced" trips
//     typically schedule 2/day, leaving breakfast unscheduled.
//   - 0.4 × food_median for local transit. Scales with destination cost
//     since metro/taxi fares track the broader cost-of-living level.
//   - 0.4 × food_median for tips/drinks/snacks/coffee.
// Legs missing baselines (cache-hit, no Haiku call, etc.) contribute 0 —
// the additive degrades gracefully rather than guessing. Always EUR;
// frontend converts to display currency.
function computeDailyLivingAdditiveEur(destinations: RankedDestination[]): number {
  let totalEur = 0;
  for (const dest of destinations) {
    if (dest.kind === "transit") continue;
    const baselines = dest.price_baselines;
    if (!baselines) continue;
    const foodMedianEur = Math.max(0, baselines.food_per_meal_eur?.median ?? 0);
    if (foodMedianEur <= 0) continue;
    for (const day of dest.days) {
      const scheduledMeals = Math.min(
        3,
        day.activities.filter(
          (a) => (a.category ?? "").trim().toLowerCase() === "food",
        ).length,
      );
      const unscheduledMeals = 3 - scheduledMeals;
      const dailyLivingPerDay =
        unscheduledMeals * foodMedianEur + 0.8 * foodMedianEur;
      totalEur += dailyLivingPerDay;
    }
  }
  return Math.round(totalEur);
}

// Structured observability log emitted once at pipeline completion. Lets
// future budget-diagnosis runs grep one line per trip instead of stitching
// together [lodging_clamp]/[activity_clamp] entries by hand.
function logBudgetRollup(
  destinations: RankedDestination[],
  tripTotalEstimate: number,
  dailyLivingAdditiveEur: number,
  expectedRangeEur: [number, number] | null | undefined,
  estimationMethod: "calculated" | "llm_corrected" | undefined,
  currency: string,
): void {
  const perLeg = destinations
    .filter((d) => d.kind !== "transit")
    .map((d) => {
      const realDays = d.days.length;
      const nights = Math.max(0, realDays - 1);
      const accomPerNight = d.accommodation?.estimated_cost_per_person ?? 0;
      const accomTotal = accomPerNight * nights;
      const activityTotal = d.days.reduce(
        (s, day) =>
          s + day.activities.reduce((a, act) => a + (act.estimated_cost_per_person || 0), 0),
        0,
      );
      const foodMedianEur = d.price_baselines?.food_per_meal_eur?.median ?? null;
      return {
        leg: d.name,
        days: realDays,
        nights,
        accom_per_night: accomPerNight,
        accom_total: accomTotal,
        activity_total: activityTotal,
        food_median_eur: foodMedianEur,
      };
    });
  console.log(
    `[budget_rollup] currency=${currency} ` +
      `trip_total_estimate=${tripTotalEstimate} ` +
      `daily_living_additive_eur=${dailyLivingAdditiveEur} ` +
      `estimation_method=${estimationMethod ?? "calculated"} ` +
      `expected_range_eur=${expectedRangeEur ? `[${expectedRangeEur[0]},${expectedRangeEur[1]}]` : "null"} ` +
      `legs=${JSON.stringify(perLeg)}`,
  );
}

interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

interface ClaudeCallResult<T> {
  data: T | null;
  usage: ClaudeUsage;
}

interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

type ClaudeSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

// User content can be a plain string (single text block) or a structured array
// with optional cache_control breakpoints. Multipart content lets per-day
// callers cache the shared venue pool while only the per-day instruction
// varies, so subsequent calls in the same window get a cache hit on the
// expensive prefix. Anthropic permits up to 4 cache_control breakpoints across
// system + user content combined.
type ClaudeUserContentBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};
type ClaudeUserContent = string | ClaudeUserContentBlock[];

function normalizeUserContent(content: ClaudeUserContent):
  | string
  | ClaudeUserContentBlock[] {
  if (typeof content === "string") return content;
  // Drop empty blocks (an empty cached block is wasted overhead) and
  // collapse trivial 1-block arrays back to a string.
  const blocks = content.filter((b) => typeof b.text === "string" && b.text.length > 0);
  if (blocks.length === 0) return "";
  if (blocks.length === 1 && !blocks[0].cache_control) return blocks[0].text;
  return blocks;
}

// ---------------------------------------------------------------------------
// Stubs — implemented in subsequent commits
// ---------------------------------------------------------------------------

/**
 * Direct Anthropic Messages API call with prompt caching + forced tool use.
 *
 * - Uses `claude-haiku-4-5-20251001` (HAIKU_MODEL).
 * - Pass `cache_control: { type: "ephemeral" }` on any system block you want
 *   cached (put the stable portion — rules, schema — first; caller is
 *   responsible for ordering since Anthropic caches by prefix).
 * - Forces the model to return a single tool_use block for `tool.name`.
 * - Returns parsed tool input as T, plus full usage including cache tokens.
 *
 * Throws with actionable messages on auth/rate-limit/5xx/missing-tool-use.
 */
async function callClaudeHaiku<T = Record<string, unknown>>(
  apiKey: string,
  systemBlocks: ClaudeSystemBlock[],
  userContent: ClaudeUserContent,
  tool: ClaudeTool,
  maxTokens: number,
  pipelineStartedAt: number,
  step: string,
  // Optional override. Anthropic defaults to 1.0 when unset; pass 0 for
  // intent-extraction-shaped calls where determinism matters more than
  // creative variety (parseIntent, rankTripMetadata).
  temperature?: number,
): Promise<ClaudeCallResult<T>> {
  if (!apiKey) {
    throw new Error("callClaudeHaiku: ANTHROPIC_API_KEY is empty");
  }
  if (systemBlocks.length === 0) {
    throw new Error("callClaudeHaiku: at least one system block is required");
  }

  // Two-tiered abort budget:
  //   - global remaining = pipeline wall-clock minus elapsed (when this hits
  //     zero we're about to be SIGKILLed; throw a PipelineError so the loop
  //     short-circuits cleanly instead of cascading)
  //   - per-attempt cap = PER_ATTEMPT_MAX_MS (bounds tail latency for one
  //     call so a single stalled day can't burn the whole pipeline budget)
  // The actual abort timer is min(remaining, perAttempt). We track which
  // bound triggered so the catch block can distinguish a per-attempt
  // timeout (transient — caller's retry should re-run) from a global
  // budget exhaustion (terminal — caller should stop firing more calls).
  const remaining =
    PIPELINE_WALL_CLOCK_MS - (Date.now() - pipelineStartedAt) - PIPELINE_TIMEOUT_BUFFER_MS;
  if (remaining <= 0) {
    throw new PipelineError(
      step,
      "Trip generation took too long at rank step — try a shorter trip or fewer vibes.",
      `pipeline budget exhausted before "${step}" Anthropic call (elapsed ${Date.now() - pipelineStartedAt}ms)`,
    );
  }

  const attemptBudget = Math.min(remaining, PER_ATTEMPT_MAX_MS);
  const isPerAttemptCap = attemptBudget < remaining;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), attemptBudget);

  const body: Record<string, unknown> = {
    model: HAIKU_MODEL,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages: [{ role: "user", content: normalizeUserContent(userContent) }],
    tools: [
      {
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
      },
    ],
    tool_choice: { type: "tool", name: tool.name },
  };
  if (typeof temperature === "number") {
    body.temperature = temperature;
  }

  const callStart = Date.now();
  try {
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      const err = e as Error;
      if (controller.signal.aborted || err?.name === "AbortError") {
        if (isPerAttemptCap) {
          // Per-attempt cap fired (one slow call, but pipeline budget still
          // has room). Throw a transient Error so rankDayWithRetry's loop
          // re-runs against the same avoid list. PipelineError would
          // short-circuit past the retry.
          throw new Error(
            `Anthropic fetch exceeded per-attempt cap of ${attemptBudget}ms ` +
            `during step "${step}" (tool="${tool.name}", remaining_budget_ms=${remaining})`,
          );
        }
        throw new PipelineError(
          step,
          "Trip generation took too long at rank step — try a shorter trip or fewer vibes.",
          `Anthropic fetch aborted after ${attemptBudget}ms budget during step "${step}" (tool="${tool.name}")`,
        );
      }
      throw new Error(`Anthropic network error calling "${tool.name}": ${err.message}`);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const snippet = errBody.slice(0, 500);
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Anthropic auth failed (${res.status}) for tool "${tool.name}". ` +
            `Check ANTHROPIC_API_KEY in Supabase secrets. Body: ${snippet}`,
        );
      }
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        throw new Error(
          `Anthropic rate-limited (429) for tool "${tool.name}"` +
            (retryAfter ? ` — retry after ${retryAfter}s` : "") +
            `. Body: ${snippet}`,
        );
      }
      if (res.status >= 500) {
        throw new Error(
          `Anthropic server error ${res.status} for tool "${tool.name}". Body: ${snippet}`,
        );
      }
      throw new Error(`Anthropic API error ${res.status} for tool "${tool.name}". Body: ${snippet}`);
    }

    const fetchHeadersMs = Date.now() - callStart;

    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch (e) {
      const err = e as Error;
      if (controller.signal.aborted || err?.name === "AbortError") {
        if (isPerAttemptCap) {
          throw new Error(
            `Anthropic response body exceeded per-attempt cap of ${attemptBudget}ms ` +
            `during step "${step}" (tool="${tool.name}", remaining_budget_ms=${remaining})`,
          );
        }
        throw new PipelineError(
          step,
          "Trip generation took too long at rank step — try a shorter trip or fewer vibes.",
          `Anthropic response body aborted after ${attemptBudget}ms budget during step "${step}" (tool="${tool.name}")`,
        );
      }
      throw new Error(`Anthropic returned non-JSON body: ${err.message}`);
    }

    const usage: ClaudeUsage = {
      input_tokens:
        typeof (data as any)?.usage?.input_tokens === "number" ? (data as any).usage.input_tokens : 0,
      output_tokens:
        typeof (data as any)?.usage?.output_tokens === "number"
          ? (data as any).usage.output_tokens
          : 0,
      cache_creation_input_tokens:
        typeof (data as any)?.usage?.cache_creation_input_tokens === "number"
          ? (data as any).usage.cache_creation_input_tokens
          : 0,
      cache_read_input_tokens:
        typeof (data as any)?.usage?.cache_read_input_tokens === "number"
          ? (data as any).usage.cache_read_input_tokens
          : 0,
    };

    const totalMs = Date.now() - callStart;
    console.log(
      `[timing] llm.${step} fetch_headers_ms=${fetchHeadersMs} total_ms=${totalMs} ` +
        `input_tokens=${usage.input_tokens} output_tokens=${usage.output_tokens} ` +
        `cache_read=${usage.cache_read_input_tokens} max_tokens=${maxTokens}`,
    );

    const blocks: Array<Record<string, unknown>> = Array.isArray((data as any)?.content)
      ? ((data as any).content as Array<Record<string, unknown>>)
      : [];
    const toolBlock = blocks.find(
      (b) => b?.type === "tool_use" && b?.name === tool.name,
    );

    if (!toolBlock) {
      const textBlock = blocks.find((b) => b?.type === "text");
      const textSnippet =
        typeof (textBlock as { text?: unknown })?.text === "string"
          ? ((textBlock as { text: string }).text).slice(0, 500)
          : "";
      throw new Error(
        `Anthropic response did not include a tool_use block for "${tool.name}". ` +
          `stop_reason=${(data as any)?.stop_reason ?? "unknown"}. Text content: ${textSnippet}`,
      );
    }

    const input = (toolBlock as { input?: unknown }).input;
    if (!input || typeof input !== "object") {
      throw new Error(
        `Anthropic tool_use block for "${tool.name}" had no input object (got ${typeof input})`,
      );
    }

    return { data: input as T, usage };
  } finally {
    clearTimeout(timeoutId);
  }
}


const INTENT_SYSTEM_PROMPT = `You are extracting structured travel preferences from a user's trip-builder form submission.

Your output will be used to (1) pick a surprise destination when the user hasn't named one, (2) plan Google Places searches, and (3) steer an LLM ranker. So be concrete. Do not invent preferences the user did not express.

EXTRACTION RULES

destination:
- If the user provided a destination_hint (non-empty), copy it verbatim into destination.
- If destination_hint is empty or looks like a placeholder (TBD, surprise me, anywhere, etc.), return destination as an empty string. A separate step will pick one.
- Never invent a destination from thin air.

vibes:
- PRESERVE EVERY explicit vibe from the user's vibes[] array — never drop one. These are mandatory inclusion criteria for the trip, not soft hints.
- Normalize each preserved vibe to a short lowercase tag (e.g. "Nightlife" => "nightlife", "Hidden gems" => "hidden gems"). Keep multi-word tags intact; do not split "hidden gems" into two entries.
- THEN add vibes that are clearly implied by free_text (e.g. "we want to eat our way through" => add "foodie"; "chill beach days" => add "beach", "slow"). De-duplicate against the preserved set.
- Output is short lowercase tags, 1-3 words each. The downstream pipeline matches these tags against a Places-retrieval map — preserving the user's exact form selections (lowercased) is critical.

must_haves:
- Specific experiences the user explicitly asked for. Examples: "cooking class", "see the Northern Lights", "visit the Miffy Museum", "sunrise hike".
- Only from explicit statements in notes or free_text. Empty array if none.

must_avoids (CRITICAL — extract aggressively from text):
- Read notes and free_text carefully for negative signals: "no tourist traps", "nothing too loud", "no early mornings", "skip the obvious stuff", "no chains", "I hate museums", "nothing over 2 hours", "we don't drink".
- Normalize into short lowercase phrases that a downstream prompt can honor: "tourist traps", "loud nightlife", "early mornings", "chain restaurants", "museums", "long activities", "alcohol".
- Empty array if the user expressed no deal-breakers. Do not invent caution.

budget_tier:
- Map budget_level: "budget" => "budget", "mid-range" => "mid-range", "premium" => "premium".
- If free_text contradicts the form (user ticked mid-range but wrote "we're on a shoestring"), trust the text.

pace:
- Map form pace: "packed" => "active", "balanced" => "balanced", "relaxed" => "leisurely".
- If free_text contradicts (form says balanced but user writes "slow mornings, lots of downtime"), trust the text.

dietary:
- Start from dietary[]. Drop "none" / "No restrictions".
- Add any dietary signals from text (e.g. "we're plant-based" => "vegan").

group_composition:
- One short human phrase describing the group. Examples: "solo traveler", "couple", "family with young kids", "friends in their 30s", "multi-generational group".
- Infer from group_size + any signals in notes/free_text. For plain numbers without context, use "group of N".

duration_days (OPTIONAL — omit the field entirely when absent):
- Read notes and free_text for an explicit trip length: "10 day trip", "5 days in Lisbon", "weekend in Tokyo", "two weeks", "long weekend", "a week".
- Normalize to an integer 1..21. "weekend" => 2. "long weekend" => 3. "a week" / "one week" => 7. "two weeks" => 14. "10 days" => 10.
- OMIT this property entirely (do not include the key) when no explicit duration appears in the text. Do NOT guess from vibes or must_haves. Do NOT echo a default. Do NOT emit 0.
- The form may also supply a duration; the caller decides whether the form value or this extracted value wins. Your job is to faithfully report what the user TYPED.

named_destinations (OPTIONAL — omit the field entirely when absent):
- Read notes and free_text for explicit city / town / island / region names the user wants the trip to include.
- Return them in the order the user mentioned them, lowercased, each as a short locality string ("bangkok", "koh phangan", "lisbon", "kyoto"). Do NOT include the country unless the user wrote it inseparable from the place ("rio de janeiro" stays whole; "lisbon, portugal" becomes "lisbon").
- OMIT this property entirely (or pass an empty array) when the user didn't name any place. Do NOT invent destinations from vibes / must_haves. "EDM and nightlife" alone does NOT imply Bangkok — wait for an explicit place name.
- Country-only mentions ("Thailand") count as a region, not a city — include them only if the user wrote nothing more specific.

destinations (OPTIONAL — omit the field entirely when the user named zero or one place):
- When the user named MULTIPLE places (named_destinations.length >= 2), populate this array with one entry per place the trip should actually visit. Each entry has:
  * name: full geocodable string ("Bangkok, Thailand", "Koh Phangan, Thailand"). Add the country only when it disambiguates ("Cambridge, UK" vs "Cambridge, MA"); for famously-unambiguous islands/cities you may emit just the locality.
  * days_allocated: integer count of days for this leg (sums across the whole array MUST equal the trip's total duration_days, AFTER accounting for transit-day buffer the system will add for long hops between adjacent legs — when in doubt, allocate full days to the destinations and let the system insert a transit day inside one of them).
  * reasoning: one short phrase explaining the day count ("vibrant city worth 3 days for street food + culture", "island chill for the back end of the trip").

REASONING RULES for days_allocated:
- Honor explicit user signals first: "end with island chill" → more days at the end leg; "quick stop in X then on to Y" → fewer days for X.
- Otherwise allocate by destination character (rough typical-stay anchors that you can adjust by ±1):
    Tokyo / Bangkok / NYC / Paris / Istanbul: 3-5 days
    Smaller capitals (Lisbon, Vienna, Prague, Edinburgh): 2-4 days
    Beach / island destinations (Phuket, Koh Phangan, Bali, Santorini): 3-5 days
    Day-trip-scale towns (Bruges, Cinque Terre, Hallstatt): 1-2 days
- Sanity check: total days_allocated MUST equal duration_days (or the form-supplied trip length when you didn't extract one).

CAP RULE — apply BEFORE writing destinations[]:
- max_destinations = max(2, floor(duration_days / 2)). For a 10-day trip that's 5; for a 5-day trip that's 2; for a 3-day trip that's 2.
- If the user named MORE places than max_destinations, drop the least-anchored ones (the ones the user mentioned in passing rather than as a must-visit) and write adjustment_notice explaining which were dropped and why.
- If the user named EXACTLY max_destinations or fewer, include all of them and re-check pacing — if any leg ends up with < 2 days, raise it to 2 by trimming a longer leg. Note this in adjustment_notice.

adjustment_notice (OPTIONAL — omit when the user's request was honored as-is):
- One concise sentence describing what you adjusted: dropped destinations, rebalanced days, or merged similar legs. Examples:
  * "5 destinations in 10 days would be rushed. Suggesting 4: Bangkok (3), Chiang Mai (2), Krabi (2), Koh Phangan (3)."
  * "Allocated more time to Koh Phangan (5 days) than Bangkok (4 days) based on your 'end with island chill' note."
- OMIT this field entirely on single-destination trips and when the days_allocated split matches the most natural reading of the user's text.

Return exactly one tool_use call. Do not add commentary.`;

const INTENT_TOOL: ClaudeTool = {
  name: "record_parsed_intent",
  description: "Record the structured intent extracted from the trip-builder form.",
  input_schema: {
    type: "object",
    properties: {
      destination: {
        type: "string",
        description: "Copy of destination_hint, or empty string if none was provided.",
      },
      vibes: {
        type: "array",
        items: { type: "string" },
        description: "Short lowercase vibe tags.",
      },
      must_haves: {
        type: "array",
        items: { type: "string" },
        description: "Explicit positive requests. Empty array if none.",
      },
      must_avoids: {
        type: "array",
        items: { type: "string" },
        description:
          "Explicit negative signals from notes/free_text. Empty array if none. Examples: 'tourist traps', 'early mornings'.",
      },
      budget_tier: {
        type: "string",
        enum: ["budget", "mid-range", "premium"],
      },
      pace: {
        type: "string",
        enum: ["leisurely", "balanced", "active"],
      },
      dietary: {
        type: "array",
        items: { type: "string" },
        description: "Real dietary restrictions only. Empty array if none.",
      },
      group_composition: {
        type: "string",
        description: "Short phrase describing the group.",
      },
      duration_days: {
        type: "integer",
        minimum: 1,
        maximum: 21,
        description:
          "Trip length in days extracted from notes/free_text. Integer 1..21 when the user wrote an explicit duration ('10 day trip', 'weekend', 'two weeks'). OMIT this field entirely when no duration appeared in the text — do not emit 0 or a guess.",
      },
      named_destinations: {
        type: "array",
        items: { type: "string" },
        description:
          "Lowercased city / island / region names the user explicitly wrote in notes/free_text, in the order they were mentioned. OMIT this field or pass an empty array when none were named. Do not invent destinations from vibes.",
      },
      destinations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "Full geocodable destination string, e.g. 'Bangkok, Thailand' or 'Koh Phangan, Thailand'. Add country when it disambiguates.",
            },
            days_allocated: {
              type: "integer",
              minimum: 1,
              maximum: 21,
              description: "Days allocated to this leg. Sum across all entries equals trip duration.",
            },
            reasoning: {
              type: "string",
              description:
                "Short rationale for the day count, e.g. 'vibrant city worth 3 days for street food + culture'.",
            },
          },
          required: ["name", "days_allocated", "reasoning"],
        },
        description:
          "Multi-destination plan: one entry per leg with a day allocation. Populate ONLY when the user named MULTIPLE destinations (named_destinations.length >= 2). OMIT this field on single-destination requests; the caller will build a 1-entry array from intent.destination.",
      },
      adjustment_notice: {
        type: "string",
        description:
          "One sentence describing any adjustment you made (dropped destinations, rebalanced day allocation, etc.). OMIT this field when the user's request was honored as-is.",
      },
    },
    required: [
      "destination",
      "vibes",
      "must_haves",
      "must_avoids",
      "budget_tier",
      "pace",
      "dietary",
      "group_composition",
    ],
  },
};

function buildIntentUserMessage(body: TripBuilderRequest, destinationHint: string): string {
  const payload = {
    destination_hint: destinationHint,
    surprise_me: body.surprise_me === true,
    group_size: body.group_size ?? 1,
    budget_level: body.budget_level ?? "mid-range",
    pace: body.pace ?? "balanced",
    vibes: body.vibes ?? [],
    interests: body.interests ?? [],
    dietary: body.dietary ?? [],
    notes: body.notes ?? "",
    free_text: body.free_text ?? "",
  };
  return `Extract parsed intent for this trip-builder submission:\n\n${JSON.stringify(payload, null, 2)}`;
}

async function parseIntent(
  anthropicKey: string,
  body: TripBuilderRequest,
  destinationHint: string,
  logger: LLMLogger,
  pipelineStartedAt: number,
): Promise<Intent> {
  // Tool-call result fields are typed as `unknown` because duration_days and
  // named_destinations are optional in the schema (per PR #256 — making them
  // required + array-typed broke parseIntent for every prompt). The model may
  // omit either entirely; extraction below normalizes whatever shape arrives.
  let result: ClaudeCallResult<Record<string, unknown>>;
  try {
    result = await callClaudeHaiku<Record<string, unknown>>(
      anthropicKey,
      [{ type: "text", text: INTENT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      buildIntentUserMessage(body, destinationHint),
      INTENT_TOOL,
      1024,
      pipelineStartedAt,
      "parseIntent",
      0,
    );
  } catch (e) {
    // The streaming branch's outer catch swallows the dev-facing message into
    // a generic user-facing string. Log the real error here so production
    // logs surface schema-rejection / 4xx / network details immediately.
    const err = e as Error;
    console.error(
      `[parseIntent] callClaudeHaiku threw: name=${err?.name ?? "Error"} ` +
      `message=${err?.message ?? String(err)}`,
    );
    if (err?.stack) console.error(`[parseIntent] stack: ${err.stack}`);
    throw e;
  }

  await logger.log({
    feature: "trip_builder_intent",
    model: HAIKU_MODEL,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    cost_usd: computeHaikuCost(result.usage),
    cached: result.usage.cache_read_input_tokens > 0,
  });

  if (!result.data) {
    throw new Error("parseIntent: Claude returned no tool input");
  }
  const data = result.data as Record<string, unknown>;

  const rawNotes = [body.notes ?? "", body.free_text ?? ""].filter(Boolean).join("\n\n").trim();

  // Clamp duration_days defensively. The field is OPTIONAL in the schema;
  // the model may omit it (or emit null / 0 / out-of-range) when no duration
  // appeared in free_text. Anything not in 1..21 is treated as "no extracted
  // duration" so the form-supplied default still applies.
  const rawDur = data.duration_days;
  const durationDays =
    typeof rawDur === "number" && Number.isFinite(rawDur) && rawDur >= 1 && rawDur <= 21
      ? Math.round(rawDur)
      : null;

  // named_destinations is OPTIONAL — model may omit the field entirely.
  // Tolerate undefined / non-array / non-string entries.
  const rawNamed = data.named_destinations;
  const namedDestinations = Array.isArray(rawNamed)
    ? rawNamed
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const budgetRaw = data.budget_tier;
  const budgetTier: Intent["budget_tier"] =
    budgetRaw === "budget" || budgetRaw === "mid-range" || budgetRaw === "premium"
      ? budgetRaw
      : "mid-range";

  const paceRaw = data.pace;
  const pace: Intent["pace"] =
    paceRaw === "leisurely" || paceRaw === "balanced" || paceRaw === "active"
      ? paceRaw
      : "balanced";

  const stringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

  // destinations[]: optional in the schema. The model populates it when the
  // user named 2+ places; when it's omitted we leave the array empty here and
  // let buildIntentDestinations (called after parseIntent) materialize a
  // single-entry array from intent.destination once that's resolved.
  const rawDests = data.destinations;
  const parsedDestinations: IntentDestination[] = Array.isArray(rawDests)
    ? rawDests
        .map((d): IntentDestination | null => {
          if (!d || typeof d !== "object") return null;
          const obj = d as Record<string, unknown>;
          const name = typeof obj.name === "string" ? obj.name.trim() : "";
          const daysRaw = obj.days_allocated;
          const days = typeof daysRaw === "number" && Number.isFinite(daysRaw) && daysRaw >= 1 && daysRaw <= 21
            ? Math.round(daysRaw)
            : 0;
          const reasoning = typeof obj.reasoning === "string" ? obj.reasoning.trim() : "";
          if (!name || days < 1) return null;
          return { name, days_allocated: days, reasoning };
        })
        .filter((d): d is IntentDestination => d !== null)
    : [];

  const adjustmentNotice =
    typeof data.adjustment_notice === "string" && data.adjustment_notice.trim().length > 0
      ? data.adjustment_notice.trim()
      : null;

  return {
    destination: typeof data.destination === "string" ? data.destination : "",
    vibes: stringArray(data.vibes),
    must_haves: stringArray(data.must_haves),
    must_avoids: stringArray(data.must_avoids),
    budget_tier: budgetTier,
    pace,
    dietary: stringArray(data.dietary),
    group_composition: typeof data.group_composition === "string" ? data.group_composition : "group",
    raw_notes: rawNotes,
    duration_days: durationDays,
    named_destinations: namedDestinations,
    destinations: parsedDestinations,
    transit_legs: [],
    adjustment_notice: adjustmentNotice,
  };
}

// Materialize intent.destinations[] post-parseIntent. Called from the pipeline
// AFTER applyNamedDestination / pickSurpriseDestination have populated
// intent.destination, AND AFTER intent.duration_days reconciliation.
//
// Behavior matrix:
//   - LLM filled destinations[] (multi-leg user prompt): validate the days_allocated
//     sum equals numDays. If off, scale or pad/trim the last leg to make it
//     match (and append a note to adjustment_notice).
//   - LLM left destinations[] empty AND intent.destination is set: build a
//     1-entry array [{name: intent.destination, days_allocated: numDays, reasoning: ""}].
//   - Cap enforcement: max(2, floor(numDays / 2)). The LLM is instructed to
//     respect this; we re-enforce defensively in case it overshot.
function buildIntentDestinations(intent: Intent, numDays: number): void {
  const cap = Math.max(2, Math.floor(numDays / 2));

  // No multi-leg input from the LLM → build a single-leg trivial structure.
  if (intent.destinations.length === 0) {
    intent.destinations = [{
      name: intent.destination || "",
      days_allocated: numDays,
      reasoning: "",
    }];
    return;
  }

  // Enforce cap defensively. If the LLM emitted more legs than the cap, keep
  // the first `cap` (they were emitted in the order the user mentioned them,
  // so prefix-truncation matches user intent best).
  if (intent.destinations.length > cap) {
    const dropped = intent.destinations.slice(cap).map((d) => d.name);
    intent.destinations = intent.destinations.slice(0, cap);
    const droppedNotice =
      `Capped to ${cap} destinations for ${numDays} days; dropped: ${dropped.join(", ")}.`;
    intent.adjustment_notice = intent.adjustment_notice
      ? `${intent.adjustment_notice} ${droppedNotice}`
      : droppedNotice;
  }

  // Reconcile days_allocated total against numDays. If the LLM's split sums
  // wrong (overshoots or undershoots), rescale proportionally and round, then
  // absorb the rounding remainder into the longest leg.
  const sum = intent.destinations.reduce((n, d) => n + d.days_allocated, 0);
  if (sum !== numDays && intent.destinations.length > 0) {
    if (sum > 0) {
      // Proportional rescale.
      const scaled = intent.destinations.map((d) => ({
        ...d,
        days_allocated: Math.max(1, Math.round((d.days_allocated / sum) * numDays)),
      }));
      const scaledSum = scaled.reduce((n, d) => n + d.days_allocated, 0);
      let delta = numDays - scaledSum;
      // Distribute the rounding remainder into the longest legs (delta can be
      // negative — trim from the longest until it's at 1).
      const order = [...scaled.keys()].sort(
        (a, b) => scaled[b].days_allocated - scaled[a].days_allocated,
      );
      let i = 0;
      while (delta !== 0 && order.length > 0) {
        const idx = order[i % order.length];
        if (delta > 0) {
          scaled[idx].days_allocated += 1;
          delta -= 1;
        } else if (scaled[idx].days_allocated > 1) {
          scaled[idx].days_allocated -= 1;
          delta += 1;
        }
        i += 1;
        if (i > numDays * 4) break; // hard safety against pathological inputs
      }
      intent.destinations = scaled;
    } else {
      // Degenerate case (LLM emitted zeros) — fall back to even split.
      const each = Math.max(1, Math.floor(numDays / intent.destinations.length));
      intent.destinations = intent.destinations.map((d) => ({
        ...d,
        days_allocated: each,
      }));
      const fixSum = intent.destinations.reduce((n, d) => n + d.days_allocated, 0);
      if (fixSum < numDays && intent.destinations[0]) {
        intent.destinations[0].days_allocated += numDays - fixSum;
      }
    }
  }

  // Mirror first leg into intent.destination so legacy callsites keep working.
  if (intent.destinations[0]?.name) intent.destination = intent.destinations[0].name;
}

// ---------------------------------------------------------------------------
// Surprise destination picker (Step 3 — runs only when surprise_me=true)
// Takes parsed Intent (without destination) and picks a city that actually
// fits the user's vibes/budget/pace/must_haves/must_avoids. Prompt explicitly
// steers away from the five "obvious" defaults so returning users don't get
// the same suggestion every time.
// ---------------------------------------------------------------------------

const SURPRISE_SYSTEM_PROMPT = `You are a travel concierge who picks ONE destination city for a surprise trip based on a traveler's parsed preferences.

HARD RULES:
- Return exactly ONE destination in the form "City, Country" (e.g. "Porto, Portugal", "Oaxaca, Mexico", "Kyoto, Japan"). Never a region, country, or continent alone.
- The city MUST plausibly satisfy every must_have and avoid every must_avoid. If the must_avoids rule out a candidate, pick a different city. Dietary restrictions are not a reason to avoid a city; cuisine variety is abundant.
- The budget_tier MUST be realistic for the city. Do not suggest Zurich for a "budget" traveler or a remote village for "premium".
- The pace MUST fit the city's character. Active pace → cities with abundant structured activities. Leisurely pace → cities that reward wandering.

VARIETY RULES (critical — these override your defaults):
- Do NOT default to Paris, Barcelona, Rome, Tokyo, or Bali. These are over-suggested. Avoid them unless the user's vibes + must_haves make one of them uniquely correct and no comparable alternative exists.
- Prefer lesser-known but well-served cities: Porto, Valencia, Ljubljana, Kotor, Tbilisi, Oaxaca, Mexico City, Medellín, Cartagena, Cape Town, Marrakech, Fes, Istanbul, Tel Aviv, Amman, Jordan's Petra base, Kyoto, Kanazawa, Taipei, Hanoi, Chiang Mai, Siem Reap, Colombo, Kochi, Jaipur, Georgetown (Penang), Hoi An, Tallinn, Vilnius, Krakow, Bologna, Seville, Granada, Lyon, Edinburgh, Galway, Reykjavik, Bergen, Copenhagen, Trieste, Naples, Palermo, Marseille, Québec City, Montréal, Vancouver, Portland, Savannah, New Orleans, Buenos Aires, Valparaíso, Cusco, Quito, Ubud, Hội An, Luang Prabang, Kandy, Hampi, Pondicherry.
- If the user's preferences genuinely point at a well-known city (e.g. explicit vibe "romantic Parisian cafés"), you may choose it, but bias toward a sibling city that fits equally well.
- Pick a different region/continent each time when all else is equal — avoid cookie-cutter European answers when Latin America, Southeast Asia, or North Africa would fit.

OUTPUT: You must call the pick_destination tool with the chosen destination and a one-sentence rationale tying it to the user's parsed intent.`;

const SURPRISE_TOOL: ClaudeTool = {
  name: "pick_destination",
  description: "Pick one surprise destination that matches the parsed intent.",
  input_schema: {
    type: "object",
    properties: {
      destination: {
        type: "string",
        description: "City and country, formatted exactly as 'City, Country'.",
      },
      rationale: {
        type: "string",
        description: "One sentence explaining why this city fits the traveler's vibes/must_haves.",
      },
    },
    required: ["destination", "rationale"],
    additionalProperties: false,
  },
};

function buildSurpriseUserMessage(intent: Intent, numDays: number): string {
  const payload = {
    trip_length_days: numDays,
    vibes: intent.vibes,
    must_haves: intent.must_haves,
    must_avoids: intent.must_avoids,
    budget_tier: intent.budget_tier,
    pace: intent.pace,
    dietary: intent.dietary,
    group_composition: intent.group_composition,
    raw_notes: intent.raw_notes,
  };
  return `Pick a surprise destination for this traveler:\n\n${JSON.stringify(payload, null, 2)}`;
}

async function pickSurpriseDestination(
  anthropicKey: string,
  intent: Intent,
  numDays: number,
  logger: LLMLogger,
  pipelineStartedAt: number,
): Promise<string> {
  const result = await callClaudeHaiku<{ destination: string; rationale: string }>(
    anthropicKey,
    [{ type: "text", text: SURPRISE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    buildSurpriseUserMessage(intent, numDays),
    SURPRISE_TOOL,
    512,
    pipelineStartedAt,
    "pickSurpriseDestination",
  );

  await logger.log({
    feature: "trip_builder_surprise_destination",
    model: HAIKU_MODEL,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    cost_usd: computeHaikuCost(result.usage),
    cached: result.usage.cache_read_input_tokens > 0,
  });

  const picked = result.data?.destination?.trim();
  if (!picked) {
    throw new Error("pickSurpriseDestination: Claude returned no destination");
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Transit-legs estimator (Haiku, cached for 30 days)
//
// For multi-destination trips: takes the ordered destinations[] array and
// returns one transit-leg description per adjacent pair. Drives whether the
// skeleton inserts a full transit day, a half-day transit, or a smooth handoff.
//
// Cached in ai_response_cache under transit:v1:{sha256(from|to)} per pair —
// most pairs (Bangkok ↔ Koh Phangan, Tokyo ↔ Kyoto, etc.) are answered the
// same regardless of who's asking, so the cache hit rate after warmup is high.
// We don't bake user preferences into the cache key on purpose; transit
// reality is preference-independent.
//
// Returns transit_legs.length === destinations.length - 1 in normal cases.
// On any hard failure we return [] and the caller falls back to a "no
// transit day" assumption (smooth handoff). This is the right failure mode:
// missing a transit day at worst gives the user one rushed day; it never
// breaks the trip.
// ---------------------------------------------------------------------------

const TRANSIT_LEGS_SYSTEM_PROMPT = `You are estimating realistic transit between adjacent legs of a multi-destination trip.

For EACH adjacent pair (from → to) the caller will give you, return one entry with:
- estimated_duration_hours: realistic door-to-door travel time in hours, including transfers/buffers. Use 0.5 increments. Cite the typical mode in description.
- transit_type: one of "flight", "train", "drive", "ferry", "mixed". Pick the dominant mode; "mixed" only when no single mode covers the majority of door-to-door time (e.g. flight + ferry).
- needs_transit_day: true when total door-to-door time is 4+ hours OR the route requires an early-morning departure / late-evening arrival that wipes out a normal activity day.
- half_day_transit: true when 1.5-3 hours total — light morning activity at the origin + afternoon arrival activity at the destination is realistic. Mutually exclusive with needs_transit_day.
- description: ONE concise sentence the UI can show on a transit card, e.g. "Flight from BKK to USM (1h) + ferry to Koh Phangan (~3h), 5–6h total" or "Direct train, ~2h 40m".

DECISION RULES:
- < 1.5 hours total → needs_transit_day=false, half_day_transit=false (smooth handoff, no separate transit slot)
- 1.5–3 hours total → needs_transit_day=false, half_day_transit=true
- 3+ hours total OR awkward connections → needs_transit_day=true, half_day_transit=false

Be realistic about island/remote destinations: factor in mandatory transfers (e.g. Koh Phangan = flight to Surat Thani + bus + ferry). Be conservative on flight days (2 hours airport buffer + actual flight + 1 hour to hotel).

Return exactly one tool_use call with the legs array in order, one entry per adjacent pair.`;

const TRANSIT_LEGS_TOOL: ClaudeTool = {
  name: "record_transit_legs",
  description: "Record estimated transit between each adjacent pair of destinations.",
  input_schema: {
    type: "object",
    properties: {
      legs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from_index: { type: "integer", minimum: 0 },
            to_index: { type: "integer", minimum: 1 },
            estimated_duration_hours: {
              type: "number",
              minimum: 0,
              maximum: 48,
              description: "Door-to-door hours, 0.5 increments.",
            },
            transit_type: {
              type: "string",
              enum: ["flight", "train", "drive", "ferry", "mixed"],
            },
            needs_transit_day: { type: "boolean" },
            half_day_transit: { type: "boolean" },
            description: { type: "string" },
          },
          required: [
            "from_index",
            "to_index",
            "estimated_duration_hours",
            "transit_type",
            "needs_transit_day",
            "half_day_transit",
            "description",
          ],
        },
      },
    },
    required: ["legs"],
    additionalProperties: false,
  },
};

const TRANSIT_LEGS_CACHE_TTL_MS = 30 * 86_400_000; // 30 days

function transitPairCacheKeyShape(from: string, to: string): string {
  return JSON.stringify({
    from: from.toLowerCase().trim(),
    to: to.toLowerCase().trim(),
  });
}

interface TransitCachedLeg {
  estimated_duration_hours: number;
  transit_type: IntentTransitLeg["transit_type"];
  needs_transit_day: boolean;
  half_day_transit: boolean;
  description: string;
}

function normalizeRawTransitLeg(
  raw: unknown,
  fromIndex: number,
  toIndex: number,
): IntentTransitLeg | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const dur = obj.estimated_duration_hours;
  const ttype = obj.transit_type;
  const desc = obj.description;
  if (typeof dur !== "number" || !Number.isFinite(dur) || dur < 0) return null;
  if (
    ttype !== "flight" &&
    ttype !== "train" &&
    ttype !== "drive" &&
    ttype !== "ferry" &&
    ttype !== "mixed"
  ) return null;
  if (typeof desc !== "string") return null;
  // Recompute the day flags from duration so a confused LLM can't ship
  // contradictory hour/flag pairs (e.g. "1 hour" + "needs_transit_day=true").
  const hours = Math.round(dur * 2) / 2;
  const needsDay = hours >= 3;
  const halfDay = !needsDay && hours >= 1.5;
  return {
    from_index: fromIndex,
    to_index: toIndex,
    estimated_duration_hours: hours,
    transit_type: ttype,
    needs_transit_day: needsDay,
    half_day_transit: halfDay,
    description: desc.trim(),
  };
}

async function estimateTransitLegs(
  apiKey: string,
  destinations: IntentDestination[],
  svcClient: ReturnType<typeof createClient>,
  logger: LLMLogger,
  pipelineStartedAt: number,
): Promise<IntentTransitLeg[]> {
  if (destinations.length < 2) return [];

  // Check cache pair-by-pair first. We can return a fully-cached answer
  // without any LLM call when every pair is warm.
  const pairs: Array<{ from: number; to: number; key: string }> = [];
  for (let i = 0; i < destinations.length - 1; i++) {
    const shape = transitPairCacheKeyShape(destinations[i].name, destinations[i + 1].name);
    let key: string;
    try {
      key = `transit:v1:${await sha256Hex(shape)}`;
    } catch {
      // Hash failed (extreme edge); skip caching this pair so we still try LLM.
      key = "";
    }
    pairs.push({ from: i, to: i + 1, key });
  }

  const cached: Map<number, IntentTransitLeg> = new Map();
  if (pairs.every((p) => p.key)) {
    try {
      const keys = pairs.map((p) => p.key);
      const { data } = await svcClient
        .from("ai_response_cache")
        .select("cache_key, response_json")
        .in("cache_key", keys)
        .gt("expires_at", new Date().toISOString());
      if (Array.isArray(data)) {
        for (const row of data as Array<{ cache_key: string; response_json: unknown }>) {
          const idx = pairs.findIndex((p) => p.key === row.cache_key);
          if (idx < 0) continue;
          const resp = row.response_json as TransitCachedLeg | null;
          if (!resp || typeof resp !== "object") continue;
          const leg = normalizeRawTransitLeg(resp, pairs[idx].from, pairs[idx].to);
          if (leg) cached.set(idx, leg);
        }
      }
    } catch (e) {
      console.warn("[transit_legs] cache lookup failed:", (e as Error).message);
    }
  }

  if (cached.size === pairs.length) {
    const result: IntentTransitLeg[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const leg = cached.get(i);
      if (leg) result.push(leg);
    }
    console.log(`[transit_legs] cache hit pairs=${pairs.length}`);
    return result;
  }

  // At least one pair missing — issue a single LLM call for ALL pairs and let
  // the cached ones get rewritten with a fresh TTL. Cheaper than fanning out
  // per-pair calls.
  const userPayload = {
    destinations: destinations.map((d, i) => ({ index: i, name: d.name })),
  };
  let result: ClaudeCallResult<{ legs: unknown[] }>;
  try {
    result = await callClaudeHaiku<{ legs: unknown[] }>(
      apiKey,
      [{ type: "text", text: TRANSIT_LEGS_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      `Estimate transit for these adjacent legs:\n\n${JSON.stringify(userPayload, null, 2)}`,
      TRANSIT_LEGS_TOOL,
      512,
      pipelineStartedAt,
      "estimateTransitLegs",
    );
  } catch (e) {
    console.warn("[transit_legs] Haiku failed; assuming no transit days:", (e as Error).message);
    return [];
  }

  await logger.log({
    feature: "trip_builder_transit_legs",
    model: HAIKU_MODEL,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    cost_usd: computeHaikuCost(result.usage),
    cached: result.usage.cache_read_input_tokens > 0,
  });

  const rawLegs = Array.isArray(result.data?.legs) ? result.data!.legs : [];
  const legs: IntentTransitLeg[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const cachedLeg = cached.get(i);
    if (cachedLeg) {
      legs.push(cachedLeg);
      continue;
    }
    // Find the LLM's emission for this pair (prefer matching from_index/to_index;
    // tolerate index drift by falling back to position-i).
    const found = rawLegs.find((rl) => {
      if (!rl || typeof rl !== "object") return false;
      const o = rl as Record<string, unknown>;
      return o.from_index === pairs[i].from && o.to_index === pairs[i].to;
    }) ?? rawLegs[i];
    const leg = normalizeRawTransitLeg(found, pairs[i].from, pairs[i].to);
    if (leg) {
      legs.push(leg);
      // Write back to cache (fire-and-forget; single-row insert per pair).
      if (pairs[i].key) {
        const writeShape: TransitCachedLeg = {
          estimated_duration_hours: leg.estimated_duration_hours,
          transit_type: leg.transit_type,
          needs_transit_day: leg.needs_transit_day,
          half_day_transit: leg.half_day_transit,
          description: leg.description,
        };
        svcClient
          .from("ai_response_cache")
          .upsert({
            cache_key: pairs[i].key,
            response_json: writeShape as unknown as Record<string, unknown>,
            expires_at: new Date(Date.now() + TRANSIT_LEGS_CACHE_TTL_MS).toISOString(),
          })
          .then((r: { error: { message: string; code?: string } | null }) => {
            if (r.error && r.error.code !== "23505") {
              console.warn(`[transit_legs] cache write failed: ${r.error.message}`);
            }
          });
      }
    } else {
      // The LLM didn't give us a usable answer for this pair — assume smooth
      // handoff so the skeleton doesn't lose a day. The user-visible price is
      // a possibly-rushed day; better than dropping the leg entirely.
      legs.push({
        from_index: pairs[i].from,
        to_index: pairs[i].to,
        estimated_duration_hours: 0,
        transit_type: "drive",
        needs_transit_day: false,
        half_day_transit: false,
        description: "",
      });
    }
  }
  console.log(
    `[transit_legs] estimated pairs=${pairs.length} cache_hits=${cached.size} ` +
    `transit_days=${legs.filter((l) => l.needs_transit_day).length}`,
  );
  return legs;
}

// ---------------------------------------------------------------------------
// Budget sanity check (Haiku) — backstop validator for trip_total_estimate.
//
// PR #261's computeTripTotalEstimate is the source of truth (sum of all
// activity costs + per-leg accommodation × leg-day-count). This validator
// only kicks in for OUTLIERS: when the calculated total is wildly outside
// what Haiku considers plausible for the trip shape (destinations, days,
// budget tier). Two failure modes it defends against:
//   1. A future calculation regression that double-counts or zero-counts.
//   2. An LLM cost hallucination upstream (one venue with a 10x cost
//      estimate poisoning the per-day rollup).
//
// PRINCIPLES:
//   - The LLM never invents specific prices for specific venues — those
//     still come from Google Places via hydrateActivity.
//   - It only validates AGGREGATE ranges. Output is range, not prices.
//   - On any failure (timeout, parse error, etc.) we return null and the
//     caller keeps the calculated total. Backstop, not primary.
//   - 30-day cache keyed on (sorted destinations + days + budget tier) so
//     the per-trip cost on cache hits is ~0.
// ---------------------------------------------------------------------------

const BUDGET_VALIDATOR_SYSTEM_PROMPT = `You are a travel cost estimator. You assess whether a calculated budget is plausible for a given trip. You DO NOT invent costs or override calculated values — your job is sanity-checking and providing a fallback range.

You will receive: a list of destinations, total days, a budget tier ("budget" | "mid-range" | "premium"), and a calculated per-person total in EUR.

Return:
- plausible: true if the calculated total is within a reasonable range for that destination set + days + tier; false if it is wildly low or wildly high.
- expected_range_eur: [low, high] per-person total you'd expect for this trip — your fallback range, used as a midpoint substitute when the calculated total is rejected.
- confidence: "high" for well-known destinations and standard durations, "medium" for less-common destinations, "low" when you are guessing.
- rationale: ONE sentence explaining the range and why the calculated value is or isn't plausible.

GUIDANCE (per person per day, all-in: lodging share + food + activities + local transit):
- Budget Southeast Asia (Bangkok, Hanoi, Bali): €40–80.
- Mid-range Southeast Asia / Eastern Europe (Lisbon, Prague, Krakow): €80–150.
- Mid-range Western Europe (Paris, Amsterdam, Rome, Berlin): €110–210.
- Mid-range expensive Asia (Tokyo, Kyoto, Seoul, Singapore, Hong Kong): €130–240.
- Mid-range high-cost cities (London, Zurich, Reykjavik, NYC, San Francisco): €170–300.
- Budget tier: ~0.6x mid-range. Premium tier: ~2-3x mid-range.
- Add ~30-50% headroom for short trips (1-3 days) where fixed costs dominate.
- Multi-destination trips spend more on transit and lodging churn — bump the high end ~10-20%.
- A 4-star hotel ALONE in Tokyo/Paris/London is €130+/night; trips priced below €600/week in those cities are almost certainly underestimated.

CALL the validate_budget tool exactly once.`;

const BUDGET_VALIDATOR_TOOL: ClaudeTool = {
  name: "validate_budget",
  description: "Sanity-check a calculated trip budget total and return a fallback plausible range.",
  input_schema: {
    type: "object",
    properties: {
      plausible: { type: "boolean" },
      expected_range_eur: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: { type: "number", minimum: 0 },
        description: "[low, high] per-person total in EUR.",
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      rationale: { type: "string" },
    },
    required: ["plausible", "expected_range_eur", "confidence", "rationale"],
    additionalProperties: false,
  },
};

const BUDGET_VALIDATOR_CACHE_TTL_MS = 30 * 86_400_000; // 30 days

interface BudgetValidationResult {
  plausible: boolean;
  expected_range_eur: [number, number];
  confidence: "high" | "medium" | "low";
  rationale: string;
}

function budgetValidatorCacheKeyShape(
  destinations: string[],
  totalDays: number,
  budgetTier: string,
): string {
  const sortedDests = [...destinations]
    .map((d) => d.toLowerCase().trim())
    .filter((d) => d.length > 0)
    .sort();
  return JSON.stringify({
    destinations: sortedDests,
    days: totalDays,
    tier: budgetTier,
  });
}

function normalizeBudgetValidation(raw: unknown): BudgetValidationResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const range = o.expected_range_eur;
  if (!Array.isArray(range) || range.length !== 2) return null;
  const [lowRaw, highRaw] = range;
  const low = typeof lowRaw === "number" && Number.isFinite(lowRaw) ? lowRaw : NaN;
  const high = typeof highRaw === "number" && Number.isFinite(highRaw) ? highRaw : NaN;
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) return null;
  const conf = o.confidence;
  if (conf !== "high" && conf !== "medium" && conf !== "low") return null;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  if (typeof o.plausible !== "boolean") return null;
  return {
    plausible: o.plausible,
    expected_range_eur: [Math.round(low), Math.round(high)],
    confidence: conf,
    rationale,
  };
}

async function validateBudgetEstimate(
  apiKey: string,
  destinations: string[],
  totalDays: number,
  budgetTier: string,
  calculatedTotalEur: number,
  svcClient: ReturnType<typeof createClient>,
  logger: LLMLogger,
  pipelineStartedAt: number,
): Promise<BudgetValidationResult | null> {
  if (destinations.length === 0 || totalDays <= 0) {
    console.log(
      `[budget_validator] start skipped reason=empty_inputs ` +
      `destinations=[${destinations.join(",")}] days=${totalDays}`,
    );
    return null;
  }

  console.log(
    `[budget_validator] start calculated=${calculatedTotalEur} ` +
    `destinations=[${destinations.join(",")}] days=${totalDays} tier=${budgetTier}`,
  );

  // Cache lookup — keyed on (sorted destinations + days + tier). The
  // calculated total is NOT in the key: same trip shape gets the same
  // expected range regardless of what the calculator produced this run.
  const shape = budgetValidatorCacheKeyShape(destinations, totalDays, budgetTier);
  let cacheKey = "";
  try {
    // v2 — bumped when the system prompt's GUIDANCE table was widened to
    // include expensive-Asia and high-cost-city tiers. Old v1 entries had a
    // narrower Western-Europe-centric range that under-bid Tokyo/NYC trips.
    cacheKey = `budget_validator:v2:${await sha256Hex(shape)}`;
  } catch {
    cacheKey = "";
  }

  if (cacheKey) {
    try {
      const { data } = await svcClient
        .from("ai_response_cache")
        .select("response_json")
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (data?.response_json) {
        const cached = normalizeBudgetValidation(data.response_json);
        if (cached) {
          // Re-evaluate plausibility against THIS run's calculated total —
          // the cached `plausible` was computed against a previous run's
          // calc and isn't reusable. The range is preference-independent
          // (depends only on destinations/days/tier), so we keep it and
          // recompute plausible from the range.
          const [low, high] = cached.expected_range_eur;
          const plausibleNow = calculatedTotalEur >= low && calculatedTotalEur <= high;
          console.log(
            `[budget_validator] cache hit range=[${low},${high}] calc=${calculatedTotalEur} plausible=${plausibleNow}`,
          );
          return { ...cached, plausible: plausibleNow };
        }
      }
    } catch (e) {
      console.warn("[budget_validator] cache lookup failed:", (e as Error).message);
    }
  }

  const userPayload = {
    destinations,
    total_days: totalDays,
    budget_tier: budgetTier,
    calculated_total_eur: Math.round(calculatedTotalEur),
  };

  let result: ClaudeCallResult<Record<string, unknown>>;
  try {
    result = await callClaudeHaiku<Record<string, unknown>>(
      apiKey,
      [{ type: "text", text: BUDGET_VALIDATOR_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      `Validate this trip budget:\n\n${JSON.stringify(userPayload, null, 2)}`,
      BUDGET_VALIDATOR_TOOL,
      400,
      pipelineStartedAt,
      "validateBudgetEstimate",
    );
  } catch (e) {
    console.warn("[budget_validator] Haiku failed; skipping sanity check:", (e as Error).message);
    return null;
  }

  await logger.log({
    feature: "trip_builder_budget_validator",
    model: HAIKU_MODEL,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    cost_usd: computeHaikuCost(result.usage),
    cached: result.usage.cache_read_input_tokens > 0,
  }).catch((e) => console.warn("[budget_validator] logger.log failed:", (e as Error).message));

  const normalized = normalizeBudgetValidation(result.data);
  if (!normalized) {
    console.warn("[budget_validator] response failed to normalize; skipping sanity check");
    return null;
  }

  if (cacheKey) {
    svcClient
      .from("ai_response_cache")
      .upsert({
        cache_key: cacheKey,
        response_json: normalized as unknown as Record<string, unknown>,
        expires_at: new Date(Date.now() + BUDGET_VALIDATOR_CACHE_TTL_MS).toISOString(),
      })
      .then((r: { error: { message: string; code?: string } | null }) => {
        if (r.error && r.error.code !== "23505") {
          console.warn(`[budget_validator] cache write failed: ${r.error.message}`);
        }
      });
  }

  console.log(
    `[budget_validator] range=[${normalized.expected_range_eur[0]},${normalized.expected_range_eur[1]}] ` +
    `calc=${calculatedTotalEur} plausible=${normalized.plausible} confidence=${normalized.confidence}`,
  );
  return normalized;
}

// Pull the names of real-destination legs (skipping transit pseudo-legs)
// for the budget validator's cache key. Keeps the LLM grounded on the
// places the user actually spends days at.
function realDestinationNames(destinations: Array<{ name: string; kind?: string }>): string[] {
  const out: string[] = [];
  for (const d of destinations) {
    if (d.kind === "transit") continue;
    if (typeof d.name === "string" && d.name.trim()) out.push(d.name.trim());
  }
  return out;
}

// Total days excluding transit legs. Matches the per-person-per-day notion
// the validator's prompt is calibrated against.
function realDestinationDayCount(destinations: Array<{ days?: unknown; kind?: string }>): number {
  let n = 0;
  for (const d of destinations) {
    if (d.kind === "transit") continue;
    if (Array.isArray(d.days)) n += d.days.length;
  }
  return n;
}

// Apply Haiku's sanity check to a PipelineResult. Mutates result in-place,
// setting estimation_method + expected_range_eur and (when needed) replacing
// trip_total_estimate with the range midpoint. Logs a `[budget_anomaly]`
// line when the calculated value is rejected so post-deploy monitoring can
// alert on regression. Always sets estimation_method (defaults to
// "calculated") so downstream code can rely on the field being present.
function applyBudgetSanityCheck(
  result: PipelineResult,
  validation: BudgetValidationResult | null,
): void {
  result.estimation_method = "calculated";
  result.expected_range_eur = validation?.expected_range_eur ?? null;
  if (!validation) {
    console.log(`[budget_validator] decision use=calculated calc=${result.trip_total_estimate} (no validation result)`);
    return;
  }

  const [low, high] = validation.expected_range_eur;
  const calc = result.trip_total_estimate;
  const inRange = calc >= low && calc <= high;
  if (inRange) {
    console.log(
      `[budget_validator] decision use=calculated calc=${calc} range=[${low},${high}] in_range=true`,
    );
    return;
  }

  // Outlier thresholds: >35% below low (under-counts are the more
  // dangerous failure mode — broken priceLevel clamps, FX drift,
  // missing accommodation) OR >100% above high. Mild deviations stay as
  // the calculated value. Note: validation.plausible is ignored when calc
  // is out of range — Haiku's plausibility judgment can disagree with the
  // numeric range it just produced; the range is the source of truth.
  const wayBelow = calc < low * 0.65;
  const wayAbove = calc > high * 2;
  if (!wayBelow && !wayAbove) {
    console.log(
      `[budget_validator] decision use=calculated calc=${calc} range=[${low},${high}] ` +
      `out_of_range=true mild_deviation=true plausible=${validation.plausible}`,
    );
    return;
  }

  const midpoint = Math.round((low + high) / 2);
  console.warn(
    `[budget_anomaly] calculated=${calc} expected_range=[${low},${high}] ` +
    `confidence=${validation.confidence} replacement=${midpoint} ` +
    `direction=${wayBelow ? "below" : "above"} ` +
    `rationale="${validation.rationale.slice(0, 200)}"`,
  );
  console.log(
    `[budget_validator] decision use=corrected calc=${calc} range=[${low},${high}] ` +
    `replacement=${midpoint} direction=${wayBelow ? "below" : "above"}`,
  );
  result.trip_total_estimate = midpoint;
  result.estimation_method = "llm_corrected";
}

// ---------------------------------------------------------------------------
// Destination price baselines (Haiku) — per-destination market rates feeding
// the cost clamps. Tier-based hardcoded EUR bands (PR #264) treat every
// "mid-range" city the same, but a Tokyo mid-range lodging is ~€180/night
// while Bangkok mid-range is ~€85. Haiku gives us city-shaped low/median/high
// per-person/per-night EUR ranges; Google price_level still positions the
// specific venue within the band. Hardcoded bands stay as the fallback when
// the LLM call times out or returns garbage — no regression vs. PR #264.
//
// PRINCIPLES:
//   - LLM provides MARKET-LEVEL BASELINES for the city, never venue prices.
//   - Google price_level drives per-venue positioning inside the band.
//   - 30-day cache keyed on (destination, tier) — most calls are cache hits.
// ---------------------------------------------------------------------------

const PRICE_BASELINES_SYSTEM_PROMPT = `You are a travel cost analyst. For the given destination and budget tier, provide realistic per-person/per-night EUR price ranges based on typical market rates. Return median values that reflect what travelers actually pay, not aspirational pricing. You provide MARKET-LEVEL BASELINES, not prices for specific venues.

Return three categories of EUR ranges (low/median/high) per person:
- lodging_per_night_eur: cost share per traveler per night (assume double occupancy → roughly half of room rate). Examples — Tokyo mid-range: 130/180/280. Bangkok mid-range: 50/85/130. Lisbon premium: 180/250/400.
- food_per_meal_eur: typical per-meal cost (lunch or dinner at a sit-down spot). Examples — Tokyo mid-range: 18/35/65. Bangkok mid-range: 5/12/25. Lisbon premium: 35/55/95.
- activity_per_person_eur: typical paid attraction or experience entry per person. Examples — Tokyo mid-range: 15/30/60. Bangkok mid-range: 10/20/40. Lisbon premium: 25/45/85.

GUIDANCE:
- "low" = cheap end of the tier (still tier-appropriate, not the lowest possible).
- "median" = what most travelers in this tier actually pay.
- "high" = upper end of the tier before crossing into the next tier up.
- Adjust for the destination's actual cost level — expensive Asia (Tokyo, Singapore, Hong Kong) and high-cost cities (London, Zurich, Reykjavik, NYC) are well above mid-range Western Europe; SEA and Eastern Europe are well below.
- "luxury" tier = roughly 1.5-2x premium values; still real prices not vanity numbers.
- "budget" tier = hostels/guesthouses, street food and casual eateries, mostly free attractions plus occasional paid entries.

Output: call the emit_price_baselines tool exactly once with all three bands and a one-sentence rationale.`;

const PRICE_BASELINES_TOOL: ClaudeTool = {
  name: "emit_price_baselines",
  description: "Emit destination-level per-person EUR price baselines for lodging-per-night, food-per-meal, and activity-per-person.",
  input_schema: {
    type: "object",
    properties: {
      lodging_per_night_eur: {
        type: "object",
        properties: {
          low: { type: "number", minimum: 0 },
          median: { type: "number", minimum: 0 },
          high: { type: "number", minimum: 0 },
        },
        required: ["low", "median", "high"],
        additionalProperties: false,
      },
      food_per_meal_eur: {
        type: "object",
        properties: {
          low: { type: "number", minimum: 0 },
          median: { type: "number", minimum: 0 },
          high: { type: "number", minimum: 0 },
        },
        required: ["low", "median", "high"],
        additionalProperties: false,
      },
      activity_per_person_eur: {
        type: "object",
        properties: {
          low: { type: "number", minimum: 0 },
          median: { type: "number", minimum: 0 },
          high: { type: "number", minimum: 0 },
        },
        required: ["low", "median", "high"],
        additionalProperties: false,
      },
      rationale: { type: "string" },
    },
    required: [
      "lodging_per_night_eur",
      "food_per_meal_eur",
      "activity_per_person_eur",
      "rationale",
    ],
    additionalProperties: false,
  },
};

const PRICE_BASELINES_CACHE_TTL_MS = 30 * 86_400_000; // 30 days
// Hard cap so a slow Haiku call never stalls the trip pipeline. Cache misses
// fall back to hardcoded tier bands; we'd rather under-bid than block the
// rank stage waiting on a baseline.
const PRICE_BASELINES_TIMEOUT_MS = 4000;

interface PriceBand {
  low: number;
  median: number;
  high: number;
}

interface DestinationPriceBaselines {
  lodging_per_night_eur: PriceBand;
  food_per_meal_eur: PriceBand;
  activity_per_person_eur: PriceBand;
  rationale: string;
}

type PriceBaselineTier = Intent["budget_tier"] | "luxury";

function normalizePriceBand(raw: unknown): PriceBand | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const low = typeof o.low === "number" && Number.isFinite(o.low) ? o.low : NaN;
  const median = typeof o.median === "number" && Number.isFinite(o.median) ? o.median : NaN;
  const high = typeof o.high === "number" && Number.isFinite(o.high) ? o.high : NaN;
  if (![low, median, high].every((n) => Number.isFinite(n) && n >= 0)) return null;
  if (median < low || high < median) return null;
  return {
    low: Math.round(low * 100) / 100,
    median: Math.round(median * 100) / 100,
    high: Math.round(high * 100) / 100,
  };
}

function normalizePriceBaselines(raw: unknown): DestinationPriceBaselines | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lodging = normalizePriceBand(o.lodging_per_night_eur);
  const food = normalizePriceBand(o.food_per_meal_eur);
  const activity = normalizePriceBand(o.activity_per_person_eur);
  if (!lodging || !food || !activity) return null;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  return {
    lodging_per_night_eur: lodging,
    food_per_meal_eur: food,
    activity_per_person_eur: activity,
    rationale,
  };
}

function priceBaselinesCacheKeyShape(destination: string, tier: string): string {
  return JSON.stringify({
    destination: destination.toLowerCase().trim(),
    tier: tier.toLowerCase().trim(),
  });
}

async function estimateDestinationPriceBaselines(
  apiKey: string,
  destination: string,
  tier: PriceBaselineTier,
  svcClient: ReturnType<typeof createClient>,
  logger: LLMLogger,
  pipelineStartedAt: number,
): Promise<DestinationPriceBaselines | null> {
  if (!apiKey || !destination || !destination.trim()) {
    console.log(`[price_baselines] start skipped reason=empty_inputs destination="${destination}" tier=${tier}`);
    return null;
  }

  const shape = priceBaselinesCacheKeyShape(destination, tier);
  let cacheKey = "";
  try {
    cacheKey = `price_baselines:v1:${await sha256Hex(shape)}`;
  } catch {
    cacheKey = "";
  }

  if (cacheKey) {
    try {
      const { data } = await svcClient
        .from("ai_response_cache")
        .select("response_json")
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (data?.response_json) {
        const cached = normalizePriceBaselines(data.response_json);
        if (cached) {
          console.log(
            `[price_baselines] start destination=${destination} tier=${tier} cache_hit=true`,
          );
          console.log(
            `[price_baselines] result lodging_median=${cached.lodging_per_night_eur.median} ` +
            `food_median=${cached.food_per_meal_eur.median} ` +
            `activity_median=${cached.activity_per_person_eur.median}`,
          );
          return cached;
        }
      }
    } catch (e) {
      console.warn("[price_baselines] cache lookup failed:", (e as Error).message);
    }
  }

  console.log(
    `[price_baselines] start destination=${destination} tier=${tier} cache_hit=false`,
  );

  // Bound the LLM call separately from the pipeline budget so a slow tail
  // never blocks ranking. On timeout the caller falls back to hardcoded
  // bands and the build continues.
  const userPayload = { destination, tier };
  let result: ClaudeCallResult<Record<string, unknown>> | null = null;
  try {
    const callPromise = callClaudeHaiku<Record<string, unknown>>(
      apiKey,
      [{ type: "text", text: PRICE_BASELINES_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      `Estimate price baselines for this destination and tier:\n\n${JSON.stringify(userPayload, null, 2)}`,
      PRICE_BASELINES_TOOL,
      400,
      pipelineStartedAt,
      "estimateDestinationPriceBaselines",
      0,
    );
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), PRICE_BASELINES_TIMEOUT_MS),
    );
    const settled = await Promise.race([callPromise, timeoutPromise]);
    if (!settled) {
      console.warn(`[price_baselines] timeout after ${PRICE_BASELINES_TIMEOUT_MS}ms destination=${destination}`);
      return null;
    }
    result = settled;
  } catch (e) {
    console.warn("[price_baselines] Haiku failed; using fallback:", (e as Error).message);
    return null;
  }

  await logger.log({
    feature: "trip_builder_price_baselines",
    model: HAIKU_MODEL,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    cost_usd: computeHaikuCost(result.usage),
    cached: result.usage.cache_read_input_tokens > 0,
  }).catch((e) => console.warn("[price_baselines] logger.log failed:", (e as Error).message));

  const normalized = normalizePriceBaselines(result.data);
  if (!normalized) {
    console.warn(`[price_baselines] response failed to normalize destination=${destination}`);
    return null;
  }

  if (cacheKey) {
    svcClient
      .from("ai_response_cache")
      .upsert({
        cache_key: cacheKey,
        response_json: normalized as unknown as Record<string, unknown>,
        expires_at: new Date(Date.now() + PRICE_BASELINES_CACHE_TTL_MS).toISOString(),
      })
      .then((r: { error: { message: string; code?: string } | null }) => {
        if (r.error && r.error.code !== "23505") {
          console.warn(`[price_baselines] cache write failed: ${r.error.message}`);
        }
      });
  }

  console.log(
    `[price_baselines] result lodging_median=${normalized.lodging_per_night_eur.median} ` +
    `food_median=${normalized.food_per_meal_eur.median} ` +
    `activity_median=${normalized.activity_per_person_eur.median}`,
  );
  return normalized;
}

// Position a venue inside a destination baseline band given Google's
// PRICE_LEVEL_*. Returns EUR. Caller multiplies by FX for local currency.
//   1 → 0.7 × low      (very cheap end)
//   2 → median * 0.9   (slightly below median)
//   3 → median * 1.2   (slightly above median)
//   4 → median * 1.6   (high end)
//   FREE → 0
//   null/unknown → median (default)
function positionInPriceBand(band: PriceBand, priceLevel: string | null): number {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":           return 0;
    case "PRICE_LEVEL_INEXPENSIVE":    return band.low * 0.7;
    case "PRICE_LEVEL_MODERATE":       return band.median * 0.9;
    case "PRICE_LEVEL_EXPENSIVE":      return band.median * 1.2;
    case "PRICE_LEVEL_VERY_EXPENSIVE": return band.median * 1.6;
    default:                            return band.median;
  }
}

// Routes a non-lodging activity to the right baseline band. breakfast/lunch/
// dinner → food. Filler slots (rest, arrival, departure, transit_buffer)
// have no associated cost — caller skips the clamp. Everything else is an
// activity (museums, tours, nightlife, attractions, etc.) — except: if the
// place looks like a food venue (cafe/bakery/restaurant), route it to food.
function baselineCategoryFor(
  slotType: SlotType,
  placeTypes: string[] | null | undefined,
): "food" | "activity" | null {
  if (slotType === "breakfast" || slotType === "lunch" || slotType === "dinner") return "food";
  if (slotType === "rest" || slotType === "arrival" || slotType === "departure" || slotType === "transit_buffer") return null;
  if (placeTypes && placeTypes.length > 0) {
    const joined = placeTypes.join(" ");
    if (/cafe|bakery|coffee|restaurant|meal_/i.test(joined)) return "food";
  }
  return "activity";
}

// ---------------------------------------------------------------------------
// Per-venue accommodation cost (Haiku) — refines the destination-baseline
// approach for HOTELS specifically. Lodging dominates trip cost and has the
// highest variance: Park Hyatt Tokyo and a 4-star business hotel can both
// be Google price_level 3-4 yet differ 3-4x in real EUR. Destination
// baselines smooth that out, so we estimate per-venue here and let the
// baseline path act as the fallback for low-confidence properties.
//
// AI Feature Standards trade-off: this is a deliberate exception to "LLM
// never invents prices for specific places" — for budget estimation only,
// market estimation based on real venue characteristics is acceptable, and
// the existing "Estimated based on typical prices" disclaimer covers it.
//
// PRINCIPLES:
//   - confidence "high"/"medium" → use the LLM EUR estimate
//   - confidence "low" → caller falls back to destination baseline + price_level
//   - call timeout/parse error → caller falls back to destination baseline
//   - 30-day cache keyed on (hotel_name, destination)
// ---------------------------------------------------------------------------

const ACCOM_ESTIMATE_SYSTEM_PROMPT = `You are a travel cost analyst with knowledge of typical hotel pricing across global markets. For the given accommodation, estimate a realistic per-night EUR rate per person (assume double occupancy → roughly half the room rate). Use your knowledge of the specific property if known; otherwise estimate based on the city + neighborhood + Google price_level + star rating combination. Return median values reflecting what travelers actually pay, not aspirational pricing.

Confidence scale (be honest — this gates whether we trust the estimate or fall back to a destination baseline):
- "high"   = you recognize the specific property OR the chain in this city, and have a confident range.
- "medium" = you don't recognize the property but the city + neighborhood + price_level + star rating give you a confident estimate from comparable properties.
- "low"    = limited data: obscure property in an obscure city, or signals contradict each other (e.g. price_level 4 with rating 3.0 / 8 reviews). Caller will fall back to a destination baseline.

EXAMPLES:
- Park Hyatt Tokyo, Shinjuku, price_level 4, rating 4.7, 1500 reviews, premium tier → ~580 EUR/night, "high", "Park Hyatt Tokyo is a recognized luxury property; typical 500-700 EUR/night per person".
- Hotel Minato, Shibuya, price_level 3, rating 4.0, 200 reviews, mid-range → ~165 EUR/night, "medium", "Mid-range Tokyo hotel in Shibuya, typical 4-star pricing for area".
- Hotel Lariosik, Bishkek (no neighborhood), price_level 2, rating 4.2, 30 reviews, mid-range → "low", "Limited data on this property; defer to regional baseline".

OUTPUT: call the emit_accommodation_estimate tool exactly once.`;

const ACCOM_ESTIMATE_TOOL: ClaudeTool = {
  name: "emit_accommodation_estimate",
  description: "Emit a per-night per-person EUR cost estimate for a specific hotel along with a confidence level.",
  input_schema: {
    type: "object",
    properties: {
      estimated_eur_per_night: { type: "number", minimum: 0 },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      rationale: { type: "string" },
    },
    required: ["estimated_eur_per_night", "confidence", "rationale"],
    additionalProperties: false,
  },
};

const ACCOM_ESTIMATE_CACHE_TTL_MS = 30 * 86_400_000; // 30 days
// 4s soft cap so a slow Haiku call doesn't stall accommodation hydration.
// Cache misses fall back to the destination-baseline path; no regression.
const ACCOM_ESTIMATE_TIMEOUT_MS = 4000;

interface AccommodationEstimate {
  estimated_eur_per_night: number;
  confidence: "high" | "medium" | "low";
  rationale: string;
}

function normalizeAccommodationEstimate(raw: unknown): AccommodationEstimate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const eur = o.estimated_eur_per_night;
  const conf = o.confidence;
  if (typeof eur !== "number" || !Number.isFinite(eur) || eur < 0) return null;
  if (conf !== "high" && conf !== "medium" && conf !== "low") return null;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  return {
    estimated_eur_per_night: Math.round(eur * 100) / 100,
    confidence: conf,
    rationale,
  };
}

function accommodationEstimateCacheKeyShape(hotelName: string, destination: string): string {
  return JSON.stringify({
    hotel: hotelName.toLowerCase().trim(),
    destination: destination.toLowerCase().trim(),
  });
}

// Convert Google's enum string to a 0-4 numeric for the prompt payload.
// Returns null when Google has no price_level info — the prompt is
// shaped to use neighborhood + rating in that case.
function priceLevelEnumToNumber(priceLevel: string | null): number | null {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":           return 0;
    case "PRICE_LEVEL_INEXPENSIVE":    return 1;
    case "PRICE_LEVEL_MODERATE":       return 2;
    case "PRICE_LEVEL_EXPENSIVE":      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE": return 4;
    default:                           return null;
  }
}

async function estimateAccommodationCost(
  apiKey: string,
  hotelName: string,
  destination: string,
  neighborhood: string | null,
  priceLevel: number | null,
  starRating: number | null,
  reviewCount: number | null,
  tier: PriceBaselineTier,
  svcClient: ReturnType<typeof createClient>,
  logger: LLMLogger,
  pipelineStartedAt: number,
): Promise<AccommodationEstimate | null> {
  if (!apiKey || !hotelName?.trim() || !destination?.trim()) {
    console.log(
      `[hotel_estimate] start skipped reason=empty_inputs hotel="${hotelName}" destination="${destination}"`,
    );
    return null;
  }

  const shape = accommodationEstimateCacheKeyShape(hotelName, destination);
  let cacheKey = "";
  try {
    cacheKey = `hotel_estimate:v1:${await sha256Hex(shape)}`;
  } catch {
    cacheKey = "";
  }

  if (cacheKey) {
    try {
      const { data } = await svcClient
        .from("ai_response_cache")
        .select("response_json")
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (data?.response_json) {
        const cached = normalizeAccommodationEstimate(data.response_json);
        if (cached) {
          console.log(
            `[hotel_estimate] start hotel="${hotelName}" destination=${destination} cache_hit=true`,
          );
          console.log(
            `[hotel_estimate] result eur=${cached.estimated_eur_per_night} confidence=${cached.confidence} ` +
            `rationale="${cached.rationale.slice(0, 120)}"`,
          );
          return cached;
        }
      }
    } catch (e) {
      console.warn("[hotel_estimate] cache lookup failed:", (e as Error).message);
    }
  }

  console.log(
    `[hotel_estimate] start hotel="${hotelName}" destination=${destination} cache_hit=false`,
  );

  const userPayload = {
    hotel_name: hotelName,
    destination,
    neighborhood,
    price_level: priceLevel,
    star_rating: starRating,
    review_count: reviewCount,
    tier,
  };

  let result: ClaudeCallResult<Record<string, unknown>> | null = null;
  try {
    const callPromise = callClaudeHaiku<Record<string, unknown>>(
      apiKey,
      [{ type: "text", text: ACCOM_ESTIMATE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      `Estimate per-person/per-night EUR for this hotel:\n\n${JSON.stringify(userPayload, null, 2)}`,
      ACCOM_ESTIMATE_TOOL,
      400,
      pipelineStartedAt,
      "estimateAccommodationCost",
      0,
    );
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), ACCOM_ESTIMATE_TIMEOUT_MS),
    );
    const settled = await Promise.race([callPromise, timeoutPromise]);
    if (!settled) {
      console.warn(
        `[hotel_estimate] timeout after ${ACCOM_ESTIMATE_TIMEOUT_MS}ms hotel="${hotelName}"`,
      );
      return null;
    }
    result = settled;
  } catch (e) {
    console.warn(`[hotel_estimate] Haiku failed hotel="${hotelName}": ${(e as Error).message}`);
    return null;
  }

  await logger.log({
    feature: "trip_builder_hotel_estimate",
    model: HAIKU_MODEL,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    cost_usd: computeHaikuCost(result.usage),
    cached: result.usage.cache_read_input_tokens > 0,
  }).catch((e) => console.warn("[hotel_estimate] logger.log failed:", (e as Error).message));

  const normalized = normalizeAccommodationEstimate(result.data);
  if (!normalized) {
    console.warn(`[hotel_estimate] response failed to normalize hotel="${hotelName}"`);
    return null;
  }

  if (cacheKey) {
    svcClient
      .from("ai_response_cache")
      .upsert({
        cache_key: cacheKey,
        response_json: normalized as unknown as Record<string, unknown>,
        expires_at: new Date(Date.now() + ACCOM_ESTIMATE_CACHE_TTL_MS).toISOString(),
      })
      .then((r: { error: { message: string; code?: string } | null }) => {
        if (r.error && r.error.code !== "23505") {
          console.warn(`[hotel_estimate] cache write failed: ${r.error.message}`);
        }
      });
  }

  console.log(
    `[hotel_estimate] result eur=${normalized.estimated_eur_per_night} confidence=${normalized.confidence} ` +
    `rationale="${normalized.rationale.slice(0, 120)}"`,
  );
  return normalized;
}

// ---------------------------------------------------------------------------
// Status messages (rich streaming UX) — destination-specific micro-copy that
// the frontend rotates while waiting on the long rank_and_enrich stage.
//
// Fired fire-and-forget right after the destination is known. Hard-capped at
// STATUS_MESSAGES_TIMEOUT_MS so a slow Haiku response never blocks the
// pipeline; on any failure we return null and the frontend keeps its existing
// generic copy fallback.
//
// Cached in ai_response_cache keyed on (destination, vibes_sorted, must_haves_sorted).
// Same destination + same preferences reuses messages, keeping the per-trip
// added cost ~0 on repeat lookups.
// ---------------------------------------------------------------------------

const STATUS_MESSAGES_SYSTEM_PROMPT = `You are a knowledgeable local travel guide writing micro-copy for a trip-builder UI. Generate exactly 4 short status messages that show what the system is doing while it builds the user's itinerary, in a destination-specific way.

HARD RULES:
- Exactly 4 messages.
- Each message: 4-8 words, present continuous tense ("Hunting...", "Mapping...", "Tracking down...", "Finding..."), NO ending punctuation.
- Each message must reference something concrete about the destination — neighborhoods, dishes, landmarks, scenes a knowledgeable local would name. Generic copy that could apply to any city is FORBIDDEN.
- Pull on the user's vibes and must_haves when given (e.g. food trip → restaurants/markets; nightlife → bars/clubs; family → parks/kid-friendly spots).
- BANNED phrases (do not use these or close paraphrases): "Building your trip", "Crafting your itinerary", "Planning your adventure", "Preparing your getaway", "Curating recommendations". The frontend already shows generic copy as a fallback.
- Voice: warm, in-the-know local. Not marketing-speak.

EXAMPLES:
- Madrid food trip → ["Hunting tapas spots in La Latina","Mapping rooftop terraces for golden hour","Tracking down family-run tabernas","Finding the best Madrid neighborhoods for foodies"]
- Tokyo nightlife → ["Tracking down hidden bars in Golden Gai","Mapping Shibuya nightlife","Finding rooftop spots with neon views","Discovering after-hours ramen joints"]
- Lisbon generic → ["Mapping miradouros for sunset views","Finding the best fado houses","Tracking down local pastel de nata","Mapping Alfama's tile-clad streets"]

OUTPUT: call the emit_status_messages tool exactly once with an array of 4 strings.`;

const STATUS_MESSAGES_TOOL: ClaudeTool = {
  name: "emit_status_messages",
  description: "Emit 4 destination-specific status messages.",
  input_schema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: { type: "string" },
        description:
          "Exactly 4 destination-specific status messages, 4-8 words each, present continuous tense, no ending punctuation.",
      },
    },
    required: ["messages"],
    additionalProperties: false,
  },
};

const STATUS_MESSAGES_TIMEOUT_MS = 1500;
const STATUS_MESSAGES_CACHE_TTL_MS = 30 * 86_400_000; // 30 days

function buildStatusMessagesUserMessage(intent: Intent, destination: string): string {
  const payload = {
    destination,
    vibes: [...intent.vibes].sort(),
    must_haves: [...intent.must_haves].sort(),
  };
  return `Generate 4 status messages for this trip:\n${JSON.stringify(payload, null, 2)}`;
}

async function generateStatusMessages(
  apiKey: string,
  intent: Intent,
  destination: string,
  svcClient: ReturnType<typeof createClient>,
  logger: LLMLogger,
): Promise<string[] | null> {
  if (!apiKey || !destination) return null;

  const cacheShape = JSON.stringify({
    dest: destination.toLowerCase().trim(),
    vibes: [...intent.vibes].map((v) => v.toLowerCase().trim()).sort(),
    must_haves: [...intent.must_haves].map((m) => m.toLowerCase().trim()).sort(),
  });
  let cacheKey: string;
  try {
    cacheKey = `status_messages:v1:${await sha256Hex(cacheShape)}`;
  } catch {
    return null;
  }

  try {
    const { data: cached } = await svcClient
      .from("ai_response_cache")
      .select("response_json")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cached?.response_json) {
      const arr = (cached.response_json as { messages?: unknown }).messages;
      if (Array.isArray(arr)) {
        const messages = arr
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 4);
        if (messages.length > 0) {
          console.log(`[status_messages] cache hit count=${messages.length}`);
          return messages;
        }
      }
    }
  } catch (e) {
    console.warn("[status_messages] cache lookup failed:", (e as Error).message);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STATUS_MESSAGES_TIMEOUT_MS);
  const callStart = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 200,
        system: [{ type: "text", text: STATUS_MESSAGES_SYSTEM_PROMPT }],
        messages: [{ role: "user", content: buildStatusMessagesUserMessage(intent, destination) }],
        tools: [
          {
            name: STATUS_MESSAGES_TOOL.name,
            description: STATUS_MESSAGES_TOOL.description,
            input_schema: STATUS_MESSAGES_TOOL.input_schema,
          },
        ],
        tool_choice: { type: "tool", name: STATUS_MESSAGES_TOOL.name },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const snippet = await res.text().catch(() => "");
      console.warn(`[status_messages] HTTP ${res.status}: ${snippet.slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; name?: string; input?: { messages?: unknown } }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };
    const block = (json.content ?? []).find(
      (b) => b.type === "tool_use" && b.name === STATUS_MESSAGES_TOOL.name,
    );
    const arr = block?.input?.messages;
    if (!Array.isArray(arr)) return null;
    const messages = arr
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim().replace(/[.!?]+$/, ""))
      .filter(Boolean)
      .slice(0, 4);
    if (messages.length === 0) return null;

    const usage: ClaudeUsage = {
      input_tokens: json.usage?.input_tokens ?? 0,
      output_tokens: json.usage?.output_tokens ?? 0,
      cache_creation_input_tokens: json.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: json.usage?.cache_read_input_tokens ?? 0,
    };
    logger
      .log({
        feature: "trip_builder_status_messages",
        model: HAIKU_MODEL,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd: computeHaikuCost(usage),
        cached: usage.cache_read_input_tokens > 0,
      })
      .catch((e) => console.warn("[status_messages] logger.log failed:", (e as Error).message));

    svcClient
      .from("ai_response_cache")
      .insert({
        cache_key: cacheKey,
        response_json: { messages } as unknown as Record<string, unknown>,
        expires_at: new Date(Date.now() + STATUS_MESSAGES_CACHE_TTL_MS).toISOString(),
      })
      .then((r: { error: { message: string; code?: string } | null }) => {
        if (r.error && r.error.code !== "23505") {
          console.warn(`[status_messages] cache write failed: ${r.error.message}`);
        }
      });

    console.log(
      `[status_messages] generated count=${messages.length} ms=${Date.now() - callStart}`,
    );
    return messages;
  } catch (e) {
    const err = e as Error;
    if (controller.signal.aborted || err.name === "AbortError") {
      console.warn(`[status_messages] timeout after ${STATUS_MESSAGES_TIMEOUT_MS}ms`);
    } else {
      console.warn("[status_messages] failed:", err.message);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Step 4: pacing skeleton (pure code, no LLM)
//
// Emits an ordered list of slots per day. Slot types are granular enough that
// the query planner can derive distinct queries from them (e.g. "dinner" +
// vibe "lively" ≠ "dinner" + vibe "romantic"). Meal timing is driven by the
// MEAL_PATTERNS data table keyed by country; unknown countries fall back to
// the americas/asia default (lunch 12–14, dinner 19–21).
//
// Pacing rules (spec):
//   leisurely → 1 major attraction/day (2 on mid-trip "exploration" days)
//   balanced  → 2 major attractions/day (one morning, one afternoon)
//   active    → 3 major attractions/day (morning + two afternoon blocks)
//
// First day always lighter (arrival buffer); last day lighter (departure
// buffer). On trips ≥ 6 days with active pace, every 4th interior day becomes
// a rest day (breakfast + lunch + rest + dinner only).
// ---------------------------------------------------------------------------

function hhmm(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Derived display field. duration_minutes remains canonical (easier arithmetic
// for buffer math and day packing). The frontend prefers duration_hours for
// rendering ("2.5h" reads cleaner than "150 min"). Always populate both on
// every EnrichedActivity — do not let the LLM compute this.
function minutesToHours1dp(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

function addDaysIso(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function resolveMealPattern(countryCode: string | null): { lunch: [number, number]; dinner: [number, number] } {
  if (!countryCode) return DEFAULT_MEAL_PATTERN;
  return MEAL_PATTERNS[countryCode.toLowerCase()] ?? DEFAULT_MEAL_PATTERN;
}

function hasNightlifeSignal(intent: Intent): boolean {
  const haystack = [
    ...intent.vibes,
    ...intent.must_haves,
    intent.group_composition,
    intent.raw_notes,
  ]
    .join(" ")
    .toLowerCase();
  if (/family|kids|children|toddler/.test(haystack)) return false;
  return /nightlife|party|club|bar\b|cocktail|lively|live music|rooftop/.test(haystack);
}

// Skeleton themes are FALLBACKS only. The ranker is now required to write a
// specific, day-unique theme (see RANKER_DAY_SYSTEM_PROMPT). Middle days return
// an empty string here so we never seed the LLM with a generic label it might
// echo back. If the LLM also fails, dedupeDayThemes derives a theme from the
// day's activities (neighborhood + cuisine) downstream.
function themeForDay(opts: {
  isFirst: boolean;
  isLast: boolean;
  isRest: boolean;
  pace: Intent["pace"];
  destination: string;
}): string {
  const dest = opts.destination?.trim();
  if (opts.isFirst) return dest ? `Arrival in ${dest}` : "Arrival & settling in";
  if (opts.isLast) return dest ? `Last highlights & ${dest} farewell` : "Last highlights & departure";
  if (opts.isRest) return "Rest day — recharge";
  return "";
}

// ---------------------------------------------------------------------------
// Leg model — internal representation of the unified trip timeline.
//
// A trip is a sequence of legs. A leg is either:
//   - kind="destination": days spent at one named place (Bangkok, Koh Phangan)
//   - kind="transit":     a dedicated travel day between two destinations
// Half-day transits don't produce a transit leg — instead the TO destination's
// first day takes an arrival shape (afternoon-arrival slot list).
//
// Each leg's `index` matches the position in PipelineResult.destinations[]
// AND the destination_index field on every DaySkeleton/RankedDay it owns.
// Single-destination trips: legs[].length === 1.
// ---------------------------------------------------------------------------
interface Leg {
  index: number;
  kind: "destination" | "transit";
  name: string;
  geo: GeocodeResult | null;       // null for transit legs (no Places search)
  days_count: number;
  // For kind=destination: position in intent.destinations[]. For kind=transit: -1.
  intent_destination_index: number;
  // For kind=transit: copy of the TransitDayMeta that drove this insertion.
  transit_meta?: TransitDayMeta;
  // True iff arrival into this leg involves a half-day transit landing in
  // afternoon. When true, the leg's first day is shaped as an arrival day
  // (transit_buffer + dinner) instead of a normal first day.
  half_day_arrival?: boolean;
}

// Build the unified leg list. Inputs come from intent (destinations[] and
// transit_legs[]) and the parallel geocode pass.
//
// Transit-day insertion: when transit_legs[i].needs_transit_day is true, we
// steal ONE day from one of the two adjacent destination legs (preferring the
// longer one, but never reducing a leg below 1 day) and turn it into a
// dedicated transit leg. This keeps the trip's total day count fixed at
// numDays.
//
// If both adjacent legs are at 1 day already, we cannot insert a transit day
// without breaking the trip — in that case we degrade to a half-day arrival
// at the destination instead and log the compromise.
function buildLegs(
  intent: Intent,
  geos: GeocodeResult[],
  numDays: number,
): Leg[] {
  const legs: Leg[] = [];

  // Mutable copy of the day allocation so we can steal days for transit legs.
  const allocations = intent.destinations.map((d) => d.days_allocated);

  // Half-day arrival flags, indexed by intent.destinations[i] (i.e. the TO
  // destination of a half-day transit hop). Used by the skeleton to shape the
  // first day of that leg as an arrival day even when it's not the first day
  // of the trip.
  const halfDayArrival = new Array<boolean>(intent.destinations.length).fill(false);

  // Resolve each transit leg. We iterate in reverse so day-stealing from the
  // FROM-leg never disturbs an already-resolved transit ahead.
  // (Trying earlier-first works too in practice; reverse is just defensive.)
  const transitsToInsert: Array<{ afterLegIndex: number; meta: TransitDayMeta }> = [];
  for (const tl of intent.transit_legs) {
    if (tl.needs_transit_day) {
      const fromIdx = tl.from_index;
      const toIdx = tl.to_index;
      // Prefer to steal from the longer of the two adjacent destinations.
      let stealFrom: number | null = null;
      if (allocations[fromIdx] >= allocations[toIdx] && allocations[fromIdx] > 1) {
        stealFrom = fromIdx;
      } else if (allocations[toIdx] > 1) {
        stealFrom = toIdx;
      } else if (allocations[fromIdx] > 1) {
        stealFrom = fromIdx;
      }
      if (stealFrom !== null) {
        allocations[stealFrom] -= 1;
        transitsToInsert.push({
          afterLegIndex: fromIdx,
          meta: {
            from_index: fromIdx,
            to_index: toIdx,
            half_day: false,
            description: tl.description,
          },
        });
        continue;
      }
      // Both legs at 1 day — can't insert a full transit day. Fall back to
      // half-day arrival on the destination side and log.
      console.warn(
        `[buildLegs] cannot insert transit day between leg ${fromIdx} and ${toIdx} ` +
        `(both at 1 day); degrading to half-day arrival.`,
      );
      halfDayArrival[toIdx] = true;
      continue;
    }
    if (tl.half_day_transit) {
      halfDayArrival[tl.to_index] = true;
    }
  }

  // Build legs in order: dest, optional transit, dest, optional transit, ...
  let legCounter = 0;
  for (let i = 0; i < intent.destinations.length; i++) {
    legs.push({
      index: legCounter,
      kind: "destination",
      name: intent.destinations[i].name,
      geo: geos[i] ?? null,
      days_count: allocations[i],
      intent_destination_index: i,
      half_day_arrival: halfDayArrival[i] && i > 0,
    });
    legCounter += 1;
    const transit = transitsToInsert.find((t) => t.afterLegIndex === i);
    if (transit) {
      const fromName = intent.destinations[transit.meta.from_index]?.name ?? "Origin";
      const toName = intent.destinations[transit.meta.to_index]?.name ?? "Destination";
      legs.push({
        index: legCounter,
        kind: "transit",
        name: `${fromName} → ${toName}`,
        geo: null,
        days_count: 1,
        intent_destination_index: -1,
        transit_meta: transit.meta,
      });
      legCounter += 1;
    }
  }

  // Sanity check.
  const totalDays = legs.reduce((n, l) => n + l.days_count, 0);
  if (totalDays !== numDays) {
    console.warn(
      `[buildLegs] day-count drift: legs sum to ${totalDays} but trip is ${numDays} days. ` +
      `Adjusting last destination leg by ${numDays - totalDays}.`,
    );
    // Absorb the delta into the last destination leg.
    for (let i = legs.length - 1; i >= 0; i--) {
      if (legs[i].kind === "destination") {
        legs[i].days_count = Math.max(1, legs[i].days_count + (numDays - totalDays));
        break;
      }
    }
  }

  return legs;
}

// Slot list for a single day inside a destination leg. Shape depends on
// position-in-leg + position-in-trip + pace + rest-day rule.
function buildDestinationDaySlots(
  intent: Intent,
  pace: Intent["pace"],
  meal: { lunch: [number, number]; dinner: [number, number] },
  ctx: {
    isTripFirstDay: boolean;
    isTripLastDay: boolean;
    isLegFirstDay: boolean;
    isLegLastDay: boolean;
    isRest: boolean;
    halfDayArrival: boolean;
  },
): PacingSlot[] {
  const lunchStart = meal.lunch[0];
  const dinnerStart = meal.dinner[0];
  const wantsNightlife = hasNightlifeSignal(intent);
  const slots: PacingSlot[] = [];
  const primary = "primary";
  const transitHub = "transit_hub";

  // Trip-first OR half-day-arrival into a non-first leg both look the same:
  // afternoon arrival, optional lunch, one light sight, dinner.
  const isArrivalShape = ctx.isTripFirstDay || (ctx.isLegFirstDay && ctx.halfDayArrival);
  const isDepartureShape = ctx.isTripLastDay;

  if (isArrivalShape) {
    slots.push({ type: "arrival", start_time: hhmm(13, 0), duration_minutes: 180, region_tag_for_queries: transitHub });
    if (pace !== "leisurely") {
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 30), duration_minutes: 75, region_tag_for_queries: primary });
    }
    slots.push({ type: "afternoon_major", start_time: hhmm(16, 0), duration_minutes: 120, region_tag_for_queries: primary });
    slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
    return slots;
  }
  if (isDepartureShape) {
    slots.push({ type: "morning_major", start_time: hhmm(9, 30), duration_minutes: 120, region_tag_for_queries: primary });
    slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 75, region_tag_for_queries: primary });
    slots.push({ type: "departure", start_time: hhmm(15, 0), duration_minutes: 180, region_tag_for_queries: transitHub });
    return slots;
  }
  if (ctx.isRest) {
    slots.push({ type: "breakfast", start_time: hhmm(10, 0), duration_minutes: 60, region_tag_for_queries: primary });
    slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
    slots.push({ type: "rest", start_time: hhmm(14, 30), duration_minutes: 150, region_tag_for_queries: primary });
    slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
    return slots;
  }
  if (pace === "leisurely") {
    slots.push({ type: "afternoon_major", start_time: hhmm(15, 0), duration_minutes: 120, region_tag_for_queries: primary });
    slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
    if (wantsNightlife) {
      slots.push({ type: "nightlife", start_time: hhmm(dinnerStart + 2, 30), duration_minutes: 120, region_tag_for_queries: primary });
    }
    return slots;
  }
  if (pace === "active") {
    slots.push({ type: "breakfast", start_time: hhmm(8, 30), duration_minutes: 45, region_tag_for_queries: primary });
    slots.push({ type: "morning_major", start_time: hhmm(9, 30), duration_minutes: 150, region_tag_for_queries: primary });
    slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 60, region_tag_for_queries: primary });
    slots.push({ type: "afternoon_major", start_time: hhmm(14, 0), duration_minutes: 150, region_tag_for_queries: primary });
    slots.push({ type: "afternoon_major", start_time: hhmm(16, 45), duration_minutes: 105, region_tag_for_queries: primary });
    slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
    if (wantsNightlife) {
      slots.push({ type: "nightlife", start_time: hhmm(dinnerStart + 2, 30), duration_minutes: 120, region_tag_for_queries: primary });
    }
    return slots;
  }
  // Balanced (default).
  slots.push({ type: "morning_major", start_time: hhmm(10, 0), duration_minutes: 150, region_tag_for_queries: primary });
  slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 75, region_tag_for_queries: primary });
  slots.push({ type: "afternoon_major", start_time: hhmm(14, 30), duration_minutes: 150, region_tag_for_queries: primary });
  slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
  if (wantsNightlife) {
    slots.push({ type: "nightlife", start_time: hhmm(dinnerStart + 2, 30), duration_minutes: 120, region_tag_for_queries: primary });
  }
  return slots;
}

// Slot list for a transit day. Single transit_buffer slot covering most of
// the day plus a dinner at the destination so the ranker has at least one
// food anchor to enrich. The ranker is told to skip activity slots on transit
// days; only the dinner gets a real venue lookup.
function buildTransitDaySlots(
  meal: { lunch: [number, number]; dinner: [number, number] },
): PacingSlot[] {
  const dinnerStart = meal.dinner[0];
  return [
    { type: "transit_buffer", start_time: hhmm(8, 0), duration_minutes: 600, region_tag_for_queries: "transit_hub" },
    { type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: "primary" },
  ];
}

function buildSkeleton(
  intent: Intent,
  legs: Leg[],
  numDays: number,
  startDate: string,
): DaySkeleton[] {
  const base = startDate || new Date().toISOString().slice(0, 10);
  const days: DaySkeleton[] = [];
  let dayCounter = 0;

  for (const leg of legs) {
    // Per-leg meal pattern. Transit legs have no geo → fall back to default.
    const meal = resolveMealPattern(leg.geo?.country_code ?? null);

    for (let dayInLeg = 0; dayInLeg < leg.days_count; dayInLeg++) {
      const date = addDaysIso(base, dayCounter);
      const day_number = dayCounter + 1;
      const isTripFirstDay = numDays > 1 && dayCounter === 0;
      const isTripLastDay = numDays > 1 && dayCounter === numDays - 1;

      let slots: PacingSlot[];
      let theme: string;
      let transit: TransitDayMeta | undefined;

      if (leg.kind === "transit") {
        slots = buildTransitDaySlots(meal);
        theme = leg.transit_meta?.description
          ? `Travel: ${leg.name}`
          : `Travel day`;
        transit = leg.transit_meta;
      } else {
        const isLegFirstDay = dayInLeg === 0;
        const isLegLastDay = dayInLeg === leg.days_count - 1;
        // Rest days only apply within active-pace destination legs of >=4 days.
        // We use the position WITHIN the leg, not the whole trip — a rest day
        // mid-Bangkok shouldn't anchor on the trip-global day-4 rule.
        const isRest =
          intent.pace === "active" &&
          leg.days_count >= 4 &&
          !isLegFirstDay &&
          !isLegLastDay &&
          (dayInLeg + 1) % 4 === 0 &&
          !isTripFirstDay &&
          !isTripLastDay;

        slots = buildDestinationDaySlots(intent, intent.pace, meal, {
          isTripFirstDay,
          isTripLastDay,
          isLegFirstDay,
          isLegLastDay,
          isRest,
          halfDayArrival: !!leg.half_day_arrival,
        });

        // Theme for first/last leg-day uses themeForDay; otherwise empty (the
        // ranker writes the real theme). This matches the legacy single-leg
        // behavior: arrival day → "Arrival in X", departure day → "Last
        // highlights & X farewell", interior → "" (LLM-written).
        const isArrival = isTripFirstDay || (isLegFirstDay && leg.half_day_arrival);
        theme = themeForDay({
          isFirst: isArrival,
          isLast: isTripLastDay,
          isRest,
          pace: intent.pace,
          destination: leg.name,
        });

        // Half-day transit visibility: when this is a destination leg's first
        // day AND the arrival is a half-day transit (1.5–3h hop), surface the
        // transit metadata on the day itself. The frontend renders a transit
        // element on the day based on day.transit. The leg stays a real
        // destination (no dedicated transit pseudo-leg created), so day count
        // and accommodation remain unchanged — only the visual marker is
        // added. Full-day transits keep their dedicated transit leg above.
        if (isLegFirstDay && leg.half_day_arrival) {
          const tl = intent.transit_legs.find(
            (t) => t.to_index === leg.intent_destination_index && t.half_day_transit,
          );
          if (tl) {
            transit = {
              from_index: tl.from_index,
              to_index: tl.to_index,
              half_day: true,
              description: tl.description,
            };
          }
        }
      }

      days.push({
        date,
        day_number,
        theme,
        slots,
        destination_index: leg.index,
        transit,
      });
      dayCounter += 1;
    }
  }

  return enforceSlotCap(days, intent.pace);
}

// Per-day-aware, per-pace slot budget. The flat 18 cap (PR #179) starved
// activities on trips ≥5 days because the trim order didn't include meals —
// every cap hit shed activities while keeping all breakfast/lunch/dinner
// slots. The budget now scales with trip length AND with the user's pace
// (leisurely: 2.5/d cap 18, balanced: 4/d cap 36, active: 5.5/d cap 42).
function computeSlotBudget(numDays: number, pace: Intent["pace"]): number {
  return Math.min(
    Math.floor(numDays * SLOTS_PER_DAY_BUDGET[pace]),
    MAX_SLOTS_CEILING[pace],
  );
}

// Activity slot types — at least one must remain per non-rest day. Used by
// enforceSlotCap to detect over-trimming.
const ACTIVITY_SLOT_TYPES: ReadonlySet<SlotType> = new Set([
  "morning_major",
  "afternoon_major",
  "nightlife",
]);

// Cap total slots at computeSlotBudget(numDays, pace). Trim meals (breakfast,
// lunch) before activities — they're the redundant ones when over budget.
// Dinner is the social anchor of last resort and is never trimmed. On non-rest
// days we always keep at least one activity slot regardless of trim order.
// Lunch on a departure day is also protected: it's the day's only food anchor
// (no dinner before the flight), so trimming it leaves the bookend foodless.
function enforceSlotCap(days: DaySkeleton[], pace: Intent["pace"]): DaySkeleton[] {
  const budget = computeSlotBudget(days.length, pace);
  const totalSlots = () => days.reduce((n, d) => n + d.slots.length, 0);
  if (totalSlots() <= budget) return days;

  const trimOrder: SlotType[] = [
    "breakfast",
    "lunch",
    "afternoon_major",
    "morning_major",
    "nightlife",
    "rest",
  ];

  const countActivitySlots = (day: DaySkeleton): number =>
    day.slots.reduce((n, s) => n + (ACTIVITY_SLOT_TYPES.has(s.type) ? 1 : 0), 0);
  const isDepartureDay = (day: DaySkeleton): boolean =>
    day.slots.some((s) => s.type === "departure");

  for (const kind of trimOrder) {
    if (totalSlots() <= budget) break;
    const byLength = [...days].sort((a, b) => b.slots.length - a.slots.length);
    for (const day of byLength) {
      if (totalSlots() <= budget) break;
      // Don't trim the only food anchor off a departure day.
      if (kind === "lunch" && isDepartureDay(day)) continue;
      // Walk back-to-front so we drop the last instance first (e.g. the
      // second afternoon_major on an active day).
      for (let i = day.slots.length - 1; i >= 0; i--) {
        if (day.slots[i].type !== kind) continue;
        // For activity types, never strip the day's last activity — every
        // non-rest day must retain at least one thing to do.
        const isRestDay = day.slots.some((s) => s.type === "rest");
        if (
          ACTIVITY_SLOT_TYPES.has(kind) &&
          !isRestDay &&
          countActivitySlots(day) <= 1
        ) {
          break;
        }
        day.slots.splice(i, 1);
        break;
      }
    }
  }

  if (totalSlots() > budget) {
    console.warn(
      `[buildSkeleton] slot cap overrun after trim: ${totalSlots()}/${budget}. ` +
      `Shape may have atypical density.`,
    );
  }
  return days;
}

// ---------------------------------------------------------------------------
// Step 5b: buildPlacesQueries (pure code, aggressive dedup, 20-query cap)
//
// One broad query feeds multiple slots. "dinner restaurants <city>" covers
// every dinner slot across a 14-day trip; we do NOT fire per-day queries.
// Queries are keyed by (slot-type, vibe-tone, must-have-index) so we never
// emit the same text twice. Total output is hard-capped at 20.
//
// must_avoids are reflected in query phrasing where possible. Text Search
// doesn't support negative terms, so we prepend positive counter-phrases:
//   "chain restaurants" avoid → prefix "local independent" on food queries
//   "tourist traps"     avoid → prefix "authentic hidden" on attraction queries
//   "crowds"            avoid → prefix "quiet"           on cafe queries
// ---------------------------------------------------------------------------

const PLACES_RADIUS_METERS = 12000; // ~12 km — tight enough to stay in the city, wide enough for day trips.

const BUDGET_PRICE_LEVELS: Record<Intent["budget_tier"], string[]> = {
  budget:      ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE"],
  "mid-range": ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"],
  premium:     ["PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"],
};

function detectDinnerTone(vibes: string[]): "romantic" | "lively" | "" {
  const joined = vibes.join(" ").toLowerCase();
  if (/romantic|date|intimate|candlelit/.test(joined)) return "romantic";
  if (/lively|party|fun|social|buzzing|loud/.test(joined)) return "lively";
  return "";
}

function detectFoodVibe(vibes: string[]): string | null {
  const match = vibes.find((v) => /foodie|culinary|fine dining|street food|michelin|tapas|ramen|bbq/i.test(v));
  return match ?? null;
}

// Vibe → Places retrieval spec. Each user-selected vibe fires one extra
// Places query so the ranker sees venues that genuinely match the vibe.
// Without this map, the only vibe with dedicated retrieval was nightlife —
// the other 7 chips were essentially decorative (see PR for vibes fidelity
// fix).
//
// Constraints:
//   - Total Places queries are capped at MAX_PLACES_QUERIES_PER_TRIP (12).
//     Baseline (lodging + meals + attractions + nightlife) is ~6, so we have
//     ~5–6 budget for vibe queries — enough for all 8 chips with one query
//     each (some share types, dedupKey collapses overlap).
//   - includedType is a single Google Places type. For vibes that span
//     multiple types (Culture: museum + art_gallery + ...) we pick the most
//     representative type; the textBias keyword pulls in adjacent venues via
//     text search.
//   - Hidden gems has no type filter — Places has no "hidden gem" type. The
//     keyword bias plus an explicit ranker instruction (see RANKER_DAY_SYSTEM_PROMPT)
//     handle the off-tourist-trail preference.
//   - Photography rides on tourist_attraction with photogenic-keyword bias.
//     Venues with high photo counts surface naturally because Places' text
//     ranking favours review/photo volume.
interface VibeRetrievalSpec {
  matches: RegExp;
  includedType?: string;
  textBias: string;       // prepended to "<bias> <city>"
  poolKey: PoolKey;
  dedupKey: string;
}

const VIBE_PLACES_MAP: VibeRetrievalSpec[] = [
  // Food: caught by the existing meal queries; the vibe-driven query layers
  // an additional "best restaurants" pull into the restaurants pool.
  { matches: /^food$|foodie|culinary|cuisine|gastronomy/i,
    includedType: "restaurant", textBias: "best restaurants",
    poolKey: "restaurants", dedupKey: "vibe:food" },
  // Culture: museum is the canonical type; the keyword bias rakes in
  // galleries, historic sites, and religious landmarks via text match.
  { matches: /culture|cultural|history|historic|heritage|art\b/i,
    includedType: "museum", textBias: "museums galleries historic landmarks",
    poolKey: "attractions", dedupKey: "vibe:culture" },
  // Adventure: tourist_attraction is broad enough to catch tour operators,
  // adventure-park style listings; keyword bias targets the active-outdoor
  // operators specifically.
  { matches: /adventure|outdoor|active|hike|hiking|kayak|rafting|climb|zip ?line/i,
    includedType: "tourist_attraction", textBias: "outdoor adventure hiking kayak",
    poolKey: "attractions", dedupKey: "vibe:adventure" },
  // Relaxation: spa is the strongest signal; parks/beaches come in via
  // separate vibes (Nature) so we don't double-up here.
  { matches: /relax|relaxation|wellness|spa|chill|slow|unwind/i,
    includedType: "spa", textBias: "spa wellness retreat",
    poolKey: "experiences", dedupKey: "vibe:relax" },
  // Nightlife: bar is the dominant type; a second night_club entry lives in
  // the nightlife block in buildPlacesQueries to also surface clubs.
  { matches: /nightlife|party|club|bar\b|cocktail|lively|live music|rooftop/i,
    includedType: "bar", textBias: "bars cocktail nightlife",
    poolKey: "nightlife", dedupKey: "vibe:nightlife" },
  // Nature: park is the canonical type; viewpoint/waterfall/beach venues
  // come through the keyword bias.
  { matches: /^nature$|natural|park\b|forest|lake|beach|viewpoint|waterfall|garden/i,
    includedType: "park", textBias: "parks gardens viewpoints natural sights",
    poolKey: "attractions", dedupKey: "vibe:nature" },
  // Hidden gems: no type filter (Google has no such category). Pure keyword
  // bias steers Places' text ranking toward smaller venues; the ranker
  // prompt also prefers lower-review-count picks when this vibe is set.
  { matches: /hidden|hidden gem|off the beaten|local|authentic|underrated|secret/i,
    textBias: "local authentic hidden gems off the beaten path",
    poolKey: "attractions", dedupKey: "vibe:hidden" },
  // Photography: tourist_attraction + photogenic keywords. High-photo-count
  // venues bubble up naturally in Places' ranking.
  { matches: /photo|photography|instagram|view\b|viewpoint|lookout|sunset|skyline|scenic/i,
    includedType: "tourist_attraction", textBias: "scenic viewpoints lookouts photogenic spots",
    poolKey: "attractions", dedupKey: "vibe:photo" },
];

function matchedVibeSpecs(vibes: string[]): VibeRetrievalSpec[] {
  const matched: VibeRetrievalSpec[] = [];
  const seen = new Set<string>();
  for (const v of vibes) {
    for (const spec of VIBE_PLACES_MAP) {
      if (seen.has(spec.dedupKey)) continue;
      if (spec.matches.test(v)) {
        matched.push(spec);
        seen.add(spec.dedupKey);
      }
    }
  }
  return matched;
}

function budgetLodgingTerm(tier: Intent["budget_tier"]): string {
  if (tier === "premium") return "4 star boutique";
  if (tier === "budget") return "budget";
  return "boutique";
}

// Build per-leg query batch. Single-destination trips call this once with
// destinationIndex=0; multi-destination trips call it once per leg and the
// outer entry point combines the batches.
function buildPlacesQueriesForLeg(
  intent: Intent,
  legSkeletonDays: DaySkeleton[],
  center: { lat: number; lng: number; name: string },
  destinationIndex: number,
  perLegCap: number,
): PlacesSearchQuery[] {
  const city = center.name.split(",")[0].trim() || center.name;
  const locationBias = {
    circle: {
      center: { latitude: center.lat, longitude: center.lng },
      radius: PLACES_RADIUS_METERS,
    },
  };
  const priceLevels = BUDGET_PRICE_LEVELS[intent.budget_tier];

  const avoids = intent.must_avoids.map((s) => s.toLowerCase()).join(" | ");
  const avoidChain  = /chain|franchise|corporate/.test(avoids);
  const avoidTraps  = /tourist trap|touristy|overrated|crowded sight/.test(avoids);
  const avoidCrowds = /crowd|busy|loud|noisy/.test(avoids);

  const foodPrefix = avoidChain ? "local independent " : "";
  const sightPrefix = avoidTraps ? "authentic hidden " : "";
  const cafePrefix = avoidCrowds ? "quiet " : "";

  const slotTypesSeen = new Set<SlotType>();
  for (const day of legSkeletonDays) for (const slot of day.slots) slotTypesSeen.add(slot.type);

  const dinnerTone = detectDinnerTone(intent.vibes);
  const foodVibe = detectFoodVibe(intent.vibes);
  const wantsRooftop = intent.vibes.some((v) => /rooftop|skyline|view/i.test(v));

  const queries: PlacesSearchQuery[] = [];
  const seen = new Set<string>();
  const add = (dedupKey: string, q: Omit<PlacesSearchQuery, "destinationIndex">): void => {
    if (queries.length >= perLegCap) return;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    queries.push({ ...q, destinationIndex });
  };

  // ---- Lodging (always 1 query) ----
  const lodgingTerm = budgetLodgingTerm(intent.budget_tier);
  add(`lodging:${lodgingTerm}`, {
    textQuery: `${lodgingTerm} hotels ${city}`,
    includedType: "lodging",
    locationBias,
    poolKey: "lodging",
  });

  // ---- Breakfast (single shared query across all breakfast slots) ----
  if (slotTypesSeen.has("breakfast")) {
    add("breakfast:default", {
      textQuery: `${cafePrefix}breakfast cafes ${city}`,
      includedType: "cafe",
      locationBias,
      poolKey: "breakfast",
    });
  }

  // ---- Meals: one consolidated "restaurants" query feeds both lunch and
  //              dinner slots. The ranker picks meal-appropriate venues
  //              from the shared pool based on slot.type + venue signals
  //              (rating, types, price). Specialized tone/vibe queries
  //              still run separately so the ranker has biased options
  //              for dinner (romantic/lively) and lunch (foodie/street).
  const hasMeal = slotTypesSeen.has("lunch") || slotTypesSeen.has("dinner");
  if (hasMeal) {
    add("restaurants:base", {
      textQuery: `${foodPrefix}restaurants ${city}`,
      includedType: "restaurant",
      priceLevels,
      locationBias,
      poolKey: "restaurants",
    });
  }
  if (slotTypesSeen.has("lunch") && foodVibe) {
    add(`lunch:vibe:${foodVibe}`, {
      textQuery: `${foodPrefix}${foodVibe} ${city}`,
      includedType: "restaurant",
      priceLevels,
      locationBias,
      poolKey: "lunch",
    });
  }
  if (slotTypesSeen.has("dinner") && dinnerTone) {
    add(`dinner:${dinnerTone}`, {
      textQuery: `${foodPrefix}${dinnerTone} dinner restaurants ${city}`,
      includedType: "restaurant",
      priceLevels,
      locationBias,
      poolKey: "dinner",
    });
  }

  // ---- Attractions ----
  // Base "top attractions" query feeds morning/afternoon major slots. The
  // per-vibe specialization that used to live here (attractions:vibe:<topVibe>)
  // moved into VIBE_PLACES_MAP — it now fires for EVERY user-selected vibe,
  // not just the first one, and uses a real Places includedType.
  if (slotTypesSeen.has("morning_major") || slotTypesSeen.has("afternoon_major")) {
    add("attractions:base", {
      textQuery: `${sightPrefix}top attractions ${city}`,
      locationBias,
      poolKey: "attractions",
    });
  }

  // ---- Nightlife ----
  // Two typed queries (bars + clubs) so Google returns actual nightlife
  // venues, not the mixed-bag the old typeless "bars <city>" text search
  // produced. Vibe-driven nightlife retrieval (also typed) lives in
  // VIBE_PLACES_MAP below — both feed the same nightlife pool and dedupe by
  // place_id at batch-merge time.
  if (slotTypesSeen.has("nightlife")) {
    add("nightlife:bars", {
      textQuery: `${wantsRooftop ? "rooftop " : ""}bars ${city}`,
      includedType: "bar",
      locationBias,
      poolKey: "nightlife",
    });
    add("nightlife:clubs", {
      textQuery: `night clubs ${city}`,
      includedType: "night_club",
      locationBias,
      poolKey: "nightlife",
    });
  }

  // ---- Must-haves → specialized experience queries (fills remaining budget) ----
  for (const mh of intent.must_haves) {
    const dedupKey = `must_have:${mh.toLowerCase().trim()}`;
    add(dedupKey, {
      textQuery: `${mh} ${city}`,
      locationBias,
      poolKey: "experiences",
    });
  }

  // ---- Vibes → typed retrieval (one query per matched vibe) ----
  // Each user-selected vibe contributes one Places query with a real
  // includedType so the ranker sees venues that genuinely fit that vibe.
  for (const spec of matchedVibeSpecs(intent.vibes)) {
    add(spec.dedupKey, {
      textQuery: `${spec.textBias} ${city}`,
      ...(spec.includedType ? { includedType: spec.includedType } : {}),
      locationBias,
      poolKey: spec.poolKey,
    });
  }

  return queries;
}

// Multi-leg entry point. Iterates real-destination legs (transit legs are
// dinner-only; their dinner queries fall under the FROM destination's leg —
// the LLM's transit-day shaping handles the actual dinner slot). Single-
// destination trips end up with one batch tagged destinationIndex=0.
function buildPlacesQueries(
  intent: Intent,
  skeleton: DaySkeleton[],
  legs: Leg[],
): PlacesSearchQuery[] {
  const realLegs = legs.filter((l) => l.kind === "destination");
  const perLegCap = realLegs.length <= 1
    ? MAX_PLACES_QUERIES_PER_TRIP
    : Math.min(MAX_PLACES_QUERIES_PER_LEG, Math.floor(MAX_PLACES_QUERIES_PER_MULTI_TRIP / realLegs.length));

  const out: PlacesSearchQuery[] = [];
  for (const leg of realLegs) {
    if (!leg.geo) continue;
    // Skeleton days that belong to this leg. Transit-leg days are handled by
    // their adjacent destination legs' dinner pools.
    const legDays = skeleton.filter((d) => d.destination_index === leg.index);
    if (legDays.length === 0) continue;
    const legCenter = { lat: leg.geo.lat, lng: leg.geo.lng, name: leg.name };
    const legQueries = buildPlacesQueriesForLeg(intent, legDays, legCenter, leg.index, perLegCap);
    out.push(...legQueries);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 5a: geocodeDestination
//
// Resolves a destination string to { lat, lng, country_code, viewport } via
// the Places API (searchText). country_code (ISO-3166-1 alpha-2) feeds
// buildSkeleton's MEAL_PATTERNS lookup; lat/lng feed locationBias on every
// Places search; viewport is kept for future bounding-box queries.
//
// NOTE: we deliberately use the Places API here, not the legacy Geocoding
// API. This project's GOOGLE_PLACES_API_KEY is enabled for Places but NOT for
// the Geocoding API — calling maps.googleapis.com/maps/api/geocode/json with
// it returns 403 REQUEST_DENIED. This bug bit concierge-suggest in v2.7 and
// trip-builder v1.0; the Places-API pattern here mirrors concierge v2.8.
//
// places.types is included in the field mask so future admin-scale
// derivation (locality → admin_1 → country → radius) can use it without
// changing the request.
//
// Cached in ai_response_cache under "geocode:v1:{sha256 normalized}" for
// 30 days (cities don't move). We rely on this cache, NOT place_details_cache
// — that table exists but isn't populated in production today.
// ---------------------------------------------------------------------------

interface GeocodeResult {
  lat: number;
  lng: number;
  country_code: string | null;
  // Captured opportunistically. Used by resolveDestinationImageUrl to fetch a
  // Google Place Photo for the trip cover. Optional because cached entries
  // written before this field existed will deserialize without it.
  place_id?: string | null;
  viewport: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  } | null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Module-level flag: set to true if the current GOOGLE_PLACES_API_KEY is not
// enabled for the Geocoding API. Avoids retrying the cheaper endpoint on
// every request for the duration of the isolate.
let geocodingApiDisabled = false;

// Try the Geocoding API first ($5/1K) and fall back to Places Text Search
// ($20/1K for a Pro field mask on places:searchText). If REQUEST_DENIED
// comes back we flip a module-level flag so subsequent calls in this
// isolate skip straight to the fallback — no retry storm, no extra cost.
//
// NOTE for Oliver: to unlock the cheaper path, enable "Geocoding API" on
// the GOOGLE_PLACES_API_KEY in Google Cloud Console. Until then this
// function silently falls back and the per-trip cost stays at the old
// Places-searchText level for the geocode step.
async function geocodeDestination(
  googleKey: string,
  destination: string,
  svcClient: ReturnType<typeof createClient>,
  userId: string | null,
): Promise<GeocodeResult> {
  const normalized = destination.trim().toLowerCase();
  if (!normalized) {
    throw new PipelineError(
      "geocodeDestination",
      "Could not resolve destination",
      "empty destination after normalization",
    );
  }

  // Shared places_cache lookup — same table concierge-suggest uses. A trip
  // builder destination lookup now warms the cache for the concierge and
  // vice versa.
  const fnStart = Date.now();
  const cacheKey = buildGeocodeCacheKey(destination);
  const cached = await cacheGet<GeocodeResult>(svcClient, "geocode", cacheKey);
  if (cached) {
    console.log(`[timing] geocode cached ms=${Date.now() - fnStart}`);
    await logPlacesCall(svcClient, { userId, feature: "trip_builder", sku: "geocode", cached: true });
    return cached;
  }

  // ---- Try Geocoding API first ----
  //
  // OPS NOTE: if logs show repeated `Geocoding API REQUEST_DENIED` warnings
  // below, the GOOGLE_PLACES_API_KEY needs the **Geocoding API** explicitly
  // enabled in the Google Cloud Console (it's a separate API from Places).
  // Until enabled, every cold-cache trip pays an extra ~$0.02 Places search
  // call as the fallback. This is a manual ops task — don't try to fix from
  // code.
  if (!geocodingApiDisabled) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${googleKey}`;
      const apiStart = Date.now();
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data?.status === "OK" && data.results?.[0]) {
          const r = data.results[0];
          const countryComp = (r.address_components as Array<{ short_name: string; types: string[] }> | undefined)
            ?.find((c) => c.types?.includes("country"));
          const vpBox = r.geometry?.viewport as {
            northeast?: { lat: number; lng: number };
            southwest?: { lat: number; lng: number };
          } | undefined;
          const result: GeocodeResult = {
            lat: r.geometry.location.lat,
            lng: r.geometry.location.lng,
            country_code: countryComp?.short_name?.toLowerCase() ?? null,
            place_id: typeof r.place_id === "string" && r.place_id.length > 0 ? r.place_id : null,
            viewport:
              vpBox?.northeast && vpBox?.southwest
                ? { northeast: vpBox.northeast, southwest: vpBox.southwest }
                : null,
          };
          await cacheSet(svcClient, "geocode", cacheKey, result);
          console.log(
            `[timing] geocode geocoding_api fetch_ms=${Date.now() - apiStart} total_ms=${Date.now() - fnStart}`,
          );
          await logPlacesCall(svcClient, { userId, feature: "trip_builder", sku: "geocode" });
          return result;
        }
        if (data?.status === "REQUEST_DENIED") {
          // Key not enabled for Geocoding API — fall through and remember.
          geocodingApiDisabled = true;
          console.warn(
            "[geocodeDestination] Geocoding API is REQUEST_DENIED for this key. " +
            "Enable 'Geocoding API' on GOOGLE_PLACES_API_KEY to cut ~$0.015/trip. Falling back to places:searchText.",
          );
        } else if (data?.status === "ZERO_RESULTS") {
          // Real no-match; skip the fallback only to avoid re-bill for the
          // same empty answer.
          throw new PipelineError(
            "geocodeDestination",
            "Could not resolve destination",
            `Geocoding API returned ZERO_RESULTS for "${destination}"`,
          );
        } else {
          console.warn(`[geocodeDestination] Geocoding status=${data?.status}; falling back to Places.`);
        }
      } else {
        console.warn(`[geocodeDestination] Geocoding HTTP ${res.status}; falling back to Places.`);
      }
    } catch (err) {
      // PipelineError bubbles — anything else we treat as a transient fall back.
      if (err instanceof PipelineError) throw err;
      console.warn("[geocodeDestination] Geocoding threw; falling back to Places:", (err as Error).message);
    }
  }

  // ---- Fallback: Places searchText with a minimal mask ----
  const fbStart = Date.now();
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask":
          "places.id,places.location,places.types,places.displayName,places.formattedAddress,places.addressComponents,places.viewport",
      },
      body: JSON.stringify({ textQuery: destination, maxResultCount: 1 }),
    },
  );
  if (!res.ok) {
    const errBody = await res.text();
    console.error(
      `[geocodeDestination] HTTP ${res.status} for "${destination}": ${errBody.slice(0, 200)}`,
    );
    throw new PipelineError(
      "geocodeDestination",
      "Could not resolve destination",
      `places:searchText returned ${res.status}`,
    );
  }
  const data = (await res.json()) as {
    places?: Array<{
      id?: string;
      location?: { latitude: number; longitude: number };
      types?: string[];
      displayName?: { text?: string };
      formattedAddress?: string;
      addressComponents?: Array<{
        longText: string;
        shortText: string;
        types: string[];
      }>;
      viewport?: {
        low?: { latitude: number; longitude: number };
        high?: { latitude: number; longitude: number };
      };
    }>;
  };
  const first = data?.places?.[0];
  if (!first?.location) {
    console.error(
      `[geocodeDestination] no places for "${destination}" (places.length=${data?.places?.length ?? 0})`,
    );
    throw new PipelineError(
      "geocodeDestination",
      "Could not resolve destination",
      "places:searchText returned 0 matches",
    );
  }
  const countryComp = first.addressComponents?.find((c) => c.types?.includes("country"));
  const vp = first.viewport;
  const result: GeocodeResult = {
    lat: first.location.latitude,
    lng: first.location.longitude,
    country_code: countryComp?.shortText?.toLowerCase() ?? null,
    place_id: typeof first.id === "string" && first.id.length > 0 ? first.id : null,
    viewport:
      vp?.low && vp?.high
        ? {
            northeast: { lat: vp.high.latitude, lng: vp.high.longitude },
            southwest: { lat: vp.low.latitude, lng: vp.low.longitude },
          }
        : null,
  };

  await cacheSet(svcClient, "geocode", cacheKey, result);
  console.log(
    `[timing] geocode places_fallback fetch_ms=${Date.now() - fbStart} total_ms=${Date.now() - fnStart}`,
  );
  // Billed as Pro because Text Search with addressComponents is >= Pro tier.
  await logPlacesCall(svcClient, { userId, feature: "trip_builder", sku: "search_pro" });
  return result;
}

// Geocode every leg of a multi-destination trip in parallel. Returns the
// per-leg results in the SAME ORDER as `destinations[]`. The pipeline uses
// each leg's coordinates for its own Places location bias; the trip-level
// map_center is computed as the centroid of the leg coordinates (we don't
// use bounding-box midpoint because longitude wraparound near ±180° would
// produce a wrong center; centroid is correct enough at city scale and
// almost always within 50 km of either leg in the multi-destination cases
// we see in practice).
//
// Single-destination trips short-circuit to a 1-element array — the geocode
// cache layer makes this functionally identical to the legacy single call.
async function geocodeIntentDestinations(
  googleKey: string,
  destinations: IntentDestination[],
  svcClient: ReturnType<typeof createClient>,
  userId: string | null,
): Promise<GeocodeResult[]> {
  if (destinations.length === 0) {
    throw new PipelineError(
      "geocodeDestination",
      "Could not resolve destination",
      "intent.destinations is empty",
    );
  }
  return await Promise.all(
    destinations.map((d) => geocodeDestination(googleKey, d.name, svcClient, userId)),
  );
}

function computeMapCenter(geos: GeocodeResult[]): { lat: number; lng: number } {
  if (geos.length === 0) return { lat: 0, lng: 0 };
  if (geos.length === 1) return { lat: geos[0].lat, lng: geos[0].lng };
  const lat = geos.reduce((s, g) => s + g.lat, 0) / geos.length;
  const lng = geos.reduce((s, g) => s + g.lng, 0) / geos.length;
  return { lat, lng };
}

// Trip-level map zoom: zoomed in for single-destination trips, pulled out
// when legs span a wide area. The thresholds are deliberately coarse — the
// frontend can override based on viewport.
function computeMapZoom(geos: GeocodeResult[]): number {
  if (geos.length <= 1) return 12;
  let maxKm = 0;
  for (let i = 0; i < geos.length; i++) {
    for (let j = i + 1; j < geos.length; j++) {
      maxKm = Math.max(
        maxKm,
        haversineKm(geos[i].lat, geos[i].lng, geos[j].lat, geos[j].lng),
      );
    }
  }
  if (maxKm > 1500) return 4;
  if (maxKm > 500) return 6;
  if (maxKm > 200) return 7;
  if (maxKm > 80) return 9;
  return 11;
}

// ---------------------------------------------------------------------------
// resolveDestinationImageUrl
//
// Returns a stable, publicly-fetchable URL for the destination cover image.
// This is the replacement for the country-keyword PHOTO_DB lookup in
// src/lib/tripPhoto.ts — works for any destination Google indexes (Hamburg,
// Tbilisi, Cusco, Marrakech, Da Nang, …) without maintaining an allowlist.
//
// Strategy:
//   1. Google Place Photos (preferred). One Place Details call (PRO mask:
//      photos only) -> photos[0].name -> Place Photo Media at maxWidthPx=1600.
//      We download the binary and re-host it in the trip-attachments bucket
//      under covers/_ai/<sha256(place_id)>.jpg, then sign a 1-year URL.
//      Re-hosting is necessary because the Places photoUri is documented as
//      short-lived and we want the URL stored in trips.destination_image_url
//      to remain valid. The bucket SELECT policy keys on trip membership, so
//      reads of the /_ai/ path go through signed URLs (which bypass RLS).
//   2. Wikimedia Commons (fallback, no API key). Wikipedia REST returns the
//      lead image of the city's article; the URL lives on
//      upload.wikimedia.org and is permanent.
//   3. Null (caller falls back to the legacy keyword table).
//
// Never throws. Failures log and return null so the cover photo step cannot
// fail trip generation.
// ---------------------------------------------------------------------------

const AI_COVER_BUCKET = "trip-attachments";
const AI_COVER_PREFIX = "covers/_ai";
const AI_COVER_SIGNED_URL_SECONDS = 365 * 24 * 60 * 60; // 1 year

async function resolveDestinationImageUrl(
  placeId: string | null | undefined,
  destination: string,
  googleKey: string,
  svcClient: ReturnType<typeof createClient>,
): Promise<string | null> {
  // ---- Step 1: Google Place Photos ----
  if (placeId) {
    try {
      const detailsRes = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        {
          method: "GET",
          headers: {
            "X-Goog-Api-Key": googleKey,
            "X-Goog-FieldMask": "photos",
          },
        },
      );
      if (detailsRes.ok) {
        const detailsData = (await detailsRes.json()) as {
          photos?: Array<{ name?: string }>;
        };
        const photoName = detailsData?.photos?.[0]?.name;
        if (photoName) {
          const mediaUrl =
            `https://places.googleapis.com/v1/${photoName}/media` +
            `?maxWidthPx=1600&key=${encodeURIComponent(googleKey)}`;
          const photoRes = await fetch(mediaUrl, { redirect: "follow" });
          if (photoRes.ok) {
            const blob = await photoRes.blob();
            const placeIdHash = (await sha256Hex(placeId)).slice(0, 32);
            const storagePath = `${AI_COVER_PREFIX}/${placeIdHash}.jpg`;
            const { error: upErr } = await svcClient.storage
              .from(AI_COVER_BUCKET)
              .upload(storagePath, blob, {
                contentType: blob.type || "image/jpeg",
                upsert: true,
              });
            if (!upErr) {
              const { data: signed, error: signErr } = await svcClient.storage
                .from(AI_COVER_BUCKET)
                .createSignedUrl(storagePath, AI_COVER_SIGNED_URL_SECONDS);
              if (!signErr && signed?.signedUrl) {
                return signed.signedUrl;
              }
              console.warn(
                "[resolveDestinationImageUrl] createSignedUrl failed:",
                signErr?.message ?? "unknown",
              );
            } else {
              console.warn(
                "[resolveDestinationImageUrl] storage upload failed:",
                upErr.message,
              );
            }
          } else {
            console.warn(
              `[resolveDestinationImageUrl] Place Photo Media HTTP ${photoRes.status}`,
            );
          }
        }
      } else {
        console.warn(
          `[resolveDestinationImageUrl] Place Details HTTP ${detailsRes.status}`,
        );
      }
    } catch (err) {
      console.warn(
        "[resolveDestinationImageUrl] Place Photos path threw, falling back to Wikimedia:",
        (err as Error).message,
      );
    }
  }

  // ---- Step 2: Wikimedia Commons fallback ----
  try {
    const cleanTitle = destination.split(",")[0].trim().replace(/\s+/g, "_");
    if (!cleanTitle) return null;
    const wikiUrl =
      `https://en.wikipedia.org/w/api.php?action=query&format=json` +
      `&prop=pageimages&piprop=original&pithumbsize=1600&redirects=1` +
      `&titles=${encodeURIComponent(cleanTitle)}&origin=*`;
    const wikiRes = await fetch(wikiUrl);
    if (wikiRes.ok) {
      const wikiData = (await wikiRes.json()) as {
        query?: {
          pages?: Record<
            string,
            { original?: { source?: string }; thumbnail?: { source?: string } }
          >;
        };
      };
      const pages = wikiData?.query?.pages ?? {};
      for (const page of Object.values(pages)) {
        const src = page?.original?.source ?? page?.thumbnail?.source;
        if (typeof src === "string" && src.length > 0) return src;
      }
    } else {
      console.warn(
        `[resolveDestinationImageUrl] Wikimedia HTTP ${wikiRes.status}`,
      );
    }
  } catch (err) {
    console.warn(
      "[resolveDestinationImageUrl] Wikimedia fallback threw:",
      (err as Error).message,
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Step 5c: searchPlacesBatch
//
// Parallel Promise.all across all queries. Each query's results inherit that
// query's poolKey so the ranker knows which slot they feed. Places API is the
// new Text Search endpoint with the concierge-suggest field mask (price_level
// included so we can clamp costs in Step 7).
//
// Dedupe across the whole batch by place.id — a venue found by both the
// "dinner:base" and "dinner:romantic" queries is kept once, tagged with the
// FIRST pool that saw it (arbitrary but stable).
//
// Per-query failures are logged and tolerated (individual HTTP 5xx shouldn't
// sink the whole trip). Billing is logged at the call-count level by
// logPlacesByTier in the main handler — the fail-loud contract applies there.
// ---------------------------------------------------------------------------

// RANKING pass — Essentials SKU only. Enough signal to sort and pick
// finalists: rating/reviews drive Junto-Pick logic, but we can skip them
// at ranking time because the ranker prompt steers on types + distance +
// reviews descending (filled in at hydration). This is the big cost lever:
// 20 fat-mask calls @ $0.032 → 12 essentials calls @ $0.005 = ~92% cut.
const PLACES_RANKING_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus";

// HYDRATION pass — Pro fields for the ~15 venues the ranker actually picked.
// Called via the Place Details endpoint (/places/{id}) per finalist. We only
// pay this per-finalist, not per ranking candidate.
//
// regularOpeningHours.periods is included so the ranker can avoid putting a
// nightclub at 09:30 or a cocktail bar at 14:30 (real bug from production —
// see logOpeningHoursViolations for the post-rank validator). currentOpeningHours
// would respect special holiday hours but is twice the response size for the
// same reliability win we'd get most of the year — Plan: revisit if holiday
// trips show drift.
const PLACES_DETAILS_FIELD_MASK =
  "id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,priceRange,types,photos,googleMapsUri,businessStatus,addressComponents,regularOpeningHours";

// Currency code → symbol for formatting Places priceRange strings. Falls back
// to the raw code when unknown — "CHF 20-40" reads fine without a symbol.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$", CAD: "C$", CHF: "CHF ",
};

// Places v1 returns priceRange as { startPrice: { currencyCode, units }, endPrice: {...} }.
// We flatten it into a display string; downstream consumers (frontend +
// budgetCalc) parse it into a midpoint. Returns null if the shape is missing
// or malformed — never throw, never guess.
function formatPlacesPriceRange(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const pr = raw as {
    startPrice?: { currencyCode?: string; units?: string };
    endPrice?: { currencyCode?: string; units?: string };
  };
  const startUnits = pr.startPrice?.units ? Number(pr.startPrice.units) : null;
  const endUnits = pr.endPrice?.units ? Number(pr.endPrice.units) : null;
  const code = pr.startPrice?.currencyCode || pr.endPrice?.currencyCode || "";
  const symbol = CURRENCY_SYMBOLS[code] ?? (code ? `${code} ` : "");
  if (startUnits != null && Number.isFinite(startUnits) && endUnits != null && Number.isFinite(endUnits) && startUnits !== endUnits) {
    return `${symbol}${startUnits}-${endUnits}`;
  }
  if (startUnits != null && Number.isFinite(startUnits)) return `${symbol}${startUnits}`;
  if (endUnits != null && Number.isFinite(endUnits)) return `${symbol}${endUnits}`;
  return null;
}

interface PlacesBatchStats {
  live_calls: number;
  cache_hits: number;
}

// Ranking pass. One fetch per query with the Essentials field mask,
// cached per (query,bucketed-latlng,radius,type,price) for 7 days.
// Returns dedup'd BatchPlaceResult[]; hydration fields (rating, photos,
// priceLevel, priceRange, addressComponents) are filled later by
// hydrateFinalists for the venues the ranker actually picks.
async function searchPlacesBatch(
  queries: PlacesSearchQuery[],
  googleKey: string,
  svcClient: ReturnType<typeof createClient>,
): Promise<{ places: BatchPlaceResult[]; stats: PlacesBatchStats }> {
  const stats: PlacesBatchStats = { live_calls: 0, cache_hits: 0 };
  const batchStart = Date.now();

  const perQueryResults = await Promise.all(
    queries.map(async (q) => {
      const qStart = Date.now();
      const qLabel = q.textQuery.slice(0, 40).replace(/"/g, "'");
      const cacheKey = buildSearchCacheKey(
        q.textQuery,
        q.locationBias.circle.center.latitude,
        q.locationBias.circle.center.longitude,
        q.locationBias.circle.radius,
        q.includedType,
        q.priceLevels,
      );
      try {
        const cached = await cacheGet<Array<Record<string, unknown>>>(svcClient, "search", cacheKey);
        if (cached) {
          stats.cache_hits++;
          console.log(
            `[timing] places.search cached q="${qLabel}" pool=${q.poolKey} ms=${Date.now() - qStart}`,
          );
          return cached;
        }
      } catch (cacheErr) {
        // Don't fail the whole pipeline on a cache read error — just log and fetch live.
        console.warn(`[searchPlacesBatch] cache lookup failed for "${q.textQuery}":`, (cacheErr as Error).message);
      }

      try {
        const body = {
          textQuery: q.textQuery,
          ...(q.includedType ? { includedType: q.includedType } : {}),
          ...(q.priceLevels ? { priceLevels: q.priceLevels } : {}),
          locationBias: q.locationBias,
          maxResultCount: 10,
        };
        const fetchStart = Date.now();
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleKey,
            "X-Goog-FieldMask": PLACES_RANKING_FIELD_MASK,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          console.error(
            `[searchPlacesBatch] HTTP ${res.status} for "${q.textQuery}" (${q.poolKey})`,
          );
          console.log(
            `[timing] places.search live q="${qLabel}" pool=${q.poolKey} ms=${Date.now() - qStart} status=${res.status}`,
          );
          return [] as Array<Record<string, unknown>>;
        }
        stats.live_calls++;
        const data = (await res.json()) as { places?: Array<Record<string, unknown>> };
        const places = data.places ?? [];
        console.log(
          `[timing] places.search live q="${qLabel}" pool=${q.poolKey} ` +
            `fetch_ms=${Date.now() - fetchStart} total_ms=${Date.now() - qStart} results=${places.length}`,
        );
        // Awaited cache write — fire-and-forget used to be cancelled by the
        // Edge Functions runtime when the function exited, leaving the cache
        // empty between trips. Awaiting inside this map closure still keeps
        // the OUTER Promise.all parallel (each query awaits its own write
        // before resolving its result), at the cost of ~50-100ms per query
        // wall time (writes run concurrently with the other queries' fetches).
        try {
          await cacheSet(svcClient, "search", cacheKey, places);
        } catch (writeErr) {
          // cacheSet swallows errors itself, but defensively double-catch in
          // case future rewrites add a throw.
          console.warn(`[searchPlacesBatch] cache write threw for "${q.textQuery}":`, (writeErr as Error).message);
        }
        return places;
      } catch (err) {
        console.error(`[searchPlacesBatch] threw for "${q.textQuery}":`, err);
        return [] as Array<Record<string, unknown>>;
      }
    }),
  );

  console.log(
    `[timing] places.search.total queries=${queries.length} ` +
      `live=${stats.live_calls} cache=${stats.cache_hits} ms=${Date.now() - batchStart}`,
  );

  // Dedup by (place_id, destinationIndex). The same physical place can
  // legitimately surface in two different legs' query batches (rare — only
  // when legs are close enough that their location-bias circles overlap), in
  // which case we keep both copies tagged to their respective legs so the
  // ranker for each leg can use it. Within a single leg, dedup is by place_id
  // alone (the legacy behavior).
  const seen = new Set<string>();
  const out: BatchPlaceResult[] = [];
  for (let i = 0; i < perQueryResults.length; i++) {
    const pool = queries[i].poolKey;
    const destIdx = queries[i].destinationIndex;
    for (const p of perQueryResults[i]) {
      const id = p.id as string | undefined;
      if (!id) continue;
      const compoundKey = `${destIdx}:${id}`;
      if (seen.has(compoundKey)) continue;
      seen.add(compoundKey);
      out.push({
        id,
        displayName: (p.displayName as { text?: string } | undefined)?.text ?? null,
        formattedAddress: (p.formattedAddress as string) ?? null,
        location:
          (p.location as { latitude: number; longitude: number } | undefined) ?? null,
        // Hydration fields start null — filled in by hydrateFinalists for
        // the venues the ranker actually picks.
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        priceRange: null,
        types: (p.types as string[] | undefined) ?? [],
        photos: [],
        googleMapsUri: null,
        businessStatus: (p.businessStatus as string | null) ?? null,
        addressComponents: [],
        openingHours: null,
        poolKey: pool,
        destinationIndex: destIdx,
      });
    }
  }
  return { places: out, stats };
}

// Hydration pass. Per-finalist Place Details GET with the Pro field mask.
// Results are cached in places_cache under the "details" tier for 30 days —
// a venue that appears in multiple trips (or is also requested by the
// concierge) only pays the Details cost once per month.
//
// Safe to run with empty input — returns the input map unchanged.
async function hydrateFinalists(
  placeIds: string[],
  existingById: Map<string, BatchPlaceResult>,
  googleKey: string,
  svcClient: ReturnType<typeof createClient>,
): Promise<{ hydrated: Map<string, BatchPlaceResult>; stats: PlacesBatchStats }> {
  const stats: PlacesBatchStats = { live_calls: 0, cache_hits: 0 };
  const hydrated = new Map(existingById);
  const unique = Array.from(new Set(placeIds)).slice(0, MAX_FINALIST_CEILING);

  if (unique.length === 0) return { hydrated, stats };

  const batchStart = Date.now();

  await Promise.all(
    unique.map(async (id) => {
      const callStart = Date.now();
      const base = existingById.get(id);
      if (!base) return;

      // Cache first
      try {
        const cached = await cacheGet<Record<string, unknown>>(svcClient, "details", id);
        if (cached) {
          stats.cache_hits++;
          applyDetailsToBatch(base, cached);
          hydrated.set(id, base);
          console.log(`[timing] places.details cached id=${id} ms=${Date.now() - callStart}`);
          return;
        }
      } catch (cacheErr) {
        console.warn(`[hydrateFinalists] cache lookup failed for ${id}:`, (cacheErr as Error).message);
      }

      try {
        const fetchStart = Date.now();
        const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleKey,
            "X-Goog-FieldMask": PLACES_DETAILS_FIELD_MASK,
          },
        });
        if (!res.ok) {
          console.error(`[hydrateFinalists] HTTP ${res.status} for place_id=${id}`);
          console.log(
            `[timing] places.details live id=${id} ms=${Date.now() - callStart} status=${res.status}`,
          );
          return;
        }
        stats.live_calls++;
        const data = (await res.json()) as Record<string, unknown>;
        applyDetailsToBatch(base, data);
        hydrated.set(id, base);
        console.log(
          `[timing] places.details live id=${id} fetch_ms=${Date.now() - fetchStart} total_ms=${Date.now() - callStart}`,
        );
        // Awaited cache write — see searchPlacesBatch for rationale (the
        // fire-and-forget version raced the Edge Functions runtime exit and
        // many writes never landed, which is why production logs showed
        // cache=0 on second-trip-to-same-destination tests).
        try {
          await cacheSet(svcClient, "details", id, data);
        } catch (writeErr) {
          console.warn(`[hydrateFinalists] cache write threw for ${id}:`, (writeErr as Error).message);
        }
      } catch (err) {
        console.error(`[hydrateFinalists] threw for place_id=${id}:`, err);
      }
    }),
  );

  console.log(
    `[timing] places.details.total ids=${unique.length} ` +
      `live=${stats.live_calls} cache=${stats.cache_hits} ms=${Date.now() - batchStart}`,
  );

  return { hydrated, stats };
}

function applyDetailsToBatch(base: BatchPlaceResult, details: Record<string, unknown>): void {
  const displayName = (details.displayName as { text?: string } | undefined)?.text;
  if (displayName && !base.displayName) base.displayName = displayName;
  if (!base.formattedAddress && typeof details.formattedAddress === "string") {
    base.formattedAddress = details.formattedAddress;
  }
  const loc = details.location as { latitude: number; longitude: number } | undefined;
  if (loc && !base.location) base.location = loc;
  base.rating = (details.rating as number | null) ?? base.rating ?? null;
  base.userRatingCount = (details.userRatingCount as number | null) ?? base.userRatingCount ?? null;
  base.priceLevel = (details.priceLevel as string | null) ?? base.priceLevel ?? null;
  base.priceRange = formatPlacesPriceRange(details.priceRange) ?? base.priceRange ?? null;
  const types = details.types as string[] | undefined;
  if (Array.isArray(types) && types.length) base.types = types;
  const photos = details.photos as Array<{ name: string }> | undefined;
  if (Array.isArray(photos) && photos.length) base.photos = photos;
  base.googleMapsUri = (details.googleMapsUri as string | null) ?? base.googleMapsUri ?? null;
  base.businessStatus = (details.businessStatus as string | null) ?? base.businessStatus ?? null;
  const ac = details.addressComponents as AddressComponent[] | undefined;
  if (Array.isArray(ac) && ac.length) base.addressComponents = ac;
  // regularOpeningHours.periods: extract only if present + well-formed.
  // Cached details written before this PR added the field will lack it —
  // callers fall back to categoryFallbackHoursForTypes in that case.
  const roh = details.regularOpeningHours as { periods?: unknown } | undefined;
  const periods = roh?.periods;
  if (Array.isArray(periods) && periods.length > 0) {
    const parsed: OpeningHoursPeriod[] = [];
    for (const raw of periods) {
      const p = raw as { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } | null };
      const o = p.open;
      if (!o || typeof o.day !== "number" || typeof o.hour !== "number") continue;
      const open = { day: o.day, hour: o.hour, minute: o.minute ?? 0 };
      const c = p.close;
      const close = (c && typeof c.day === "number" && typeof c.hour === "number")
        ? { day: c.day, hour: c.hour, minute: c.minute ?? 0 }
        : null;
      parsed.push({ open, close });
    }
    if (parsed.length > 0) base.openingHours = parsed;
  }
}

// ---------------------------------------------------------------------------
// Step 6: searchEvents (optional enrichment — pipeline must not fail without it)
//
// Reuses the concierge-suggest pattern: Brave Search first, Google CSE
// fallback. We do NOT add a new LLM vendor. Event search is optional and
// tightly bounded:
//   - max 2 parallel queries
//   - max 10 candidates returned
//   - 24h TTL cache in ai_response_cache (events go stale fast)
//   - only fires when the trip actually cares about events
//
// Relevance heuristics (fire when ANY is true):
//   - skeleton has a nightlife slot, OR
//   - intent.vibes / must_haves include live-music / festival / events / cultural signals
//
// If no API keys are configured we warn and return [] — never throw.
// ---------------------------------------------------------------------------

const EVENTS_MAX_QUERIES = 2;
const EVENTS_MAX_RESULTS = 10;
const EVENT_VIBE_SIGNALS = /live music|festival|concert|gig|dj|event|cultural|theatre|theater|exhibition|opera|ballet/i;

function shouldSearchEvents(intent: Intent, skeleton: DaySkeleton[]): boolean {
  for (const day of skeleton) {
    for (const slot of day.slots) {
      if (slot.type === "nightlife") return true;
    }
  }
  const haystack = [...intent.vibes, ...intent.must_haves, intent.raw_notes].join(" ");
  return EVENT_VIBE_SIGNALS.test(haystack);
}

function classifyEventQuery(q: string): string {
  if (/festival/i.test(q)) return "festival";
  if (/concert|gig|live music|dj/i.test(q)) return "music";
  if (/exhibition|theatre|theater|opera|ballet|cultural/i.test(q)) return "culture";
  return "events";
}

// Parse "Event Name at Venue" → venue_name. Best effort; null when ambiguous.
function parseVenueFromTitle(title: string): string | null {
  const atIdx = title.toLowerCase().lastIndexOf(" at ");
  if (atIdx <= 0) return null;
  const venue = title.slice(atIdx + 4).trim();
  return venue.length > 1 && venue.length < 80 ? venue : null;
}

function buildEventQueries(destination: string, startDate: string, intent: Intent): string[] {
  const monthYear = (() => {
    try {
      const d = new Date(`${startDate}T00:00:00Z`);
      return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    } catch {
      return "";
    }
  })();
  const vibeSignal = intent.vibes.find((v) => EVENT_VIBE_SIGNALS.test(v)) ?? "events";
  const q1 = `${vibeSignal} ${destination} ${monthYear}`.trim();
  const q2 = `${destination} events ${monthYear} site:ra.co OR site:eventbrite.com OR site:dice.fm`.trim();
  return [q1, q2].slice(0, EVENTS_MAX_QUERIES);
}

interface RawEventHit {
  title: string;
  url: string | null;
  description: string;
}

async function fetchBraveHits(apiKey: string, queries: string[]): Promise<Array<{ q: string; hits: RawEventHit[] }>> {
  return await Promise.all(
    queries.map(async (q) => {
      try {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&freshness=pm`;
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": apiKey,
          },
        });
        if (!res.ok) {
          console.error(`[searchEvents] Brave HTTP ${res.status} for "${q}"`);
          return { q, hits: [] };
        }
        const data = (await res.json()) as {
          web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
        };
        const hits = (data.web?.results ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? null,
          description: r.description ?? "",
        }));
        return { q, hits };
      } catch (err) {
        console.error(`[searchEvents] Brave threw for "${q}":`, err);
        return { q, hits: [] };
      }
    }),
  );
}

async function fetchCseHits(
  apiKey: string,
  cseId: string,
  queries: string[],
): Promise<Array<{ q: string; hits: RawEventHit[] }>> {
  return await Promise.all(
    queries.map(async (q) => {
      try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(q)}&num=10&dateRestrict=m1`;
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`[searchEvents] CSE HTTP ${res.status} for "${q}"`);
          return { q, hits: [] };
        }
        const data = (await res.json()) as {
          items?: Array<{ title?: string; link?: string; snippet?: string }>;
        };
        const hits = (data.items ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.link ?? null,
          description: r.snippet ?? "",
        }));
        return { q, hits };
      } catch (err) {
        console.error(`[searchEvents] CSE threw for "${q}":`, err);
        return { q, hits: [] };
      }
    }),
  );
}

function normalizeEventHits(
  groups: Array<{ q: string; hits: RawEventHit[] }>,
): EventCandidate[] {
  const seen = new Set<string>();
  const out: EventCandidate[] = [];
  for (const { q, hits } of groups) {
    const category = classifyEventQuery(q);
    for (const h of hits) {
      if (!h.title) continue;
      const urlKey = h.url ?? `title:${h.title.toLowerCase()}`;
      if (seen.has(urlKey)) continue;
      seen.add(urlKey);
      out.push({
        name: h.title,
        date_iso: null,
        time: null,
        venue_name: parseVenueFromTitle(h.title),
        venue_place_id: null,
        url: h.url,
        category,
        description: h.description,
        confidence: 0.5, // snippet-match prior; ranker adjusts
      });
      if (out.length >= EVENTS_MAX_RESULTS) return out;
    }
  }
  return out;
}

async function searchEvents(
  destination: string,
  startDate: string,
  endDate: string,
  intent: Intent,
  skeleton: DaySkeleton[],
  svcClient: ReturnType<typeof createClient>,
  logger: LLMLogger,
  // Bypass shouldSearchEvents() — used by the cache-hit refresh path, where
  // the presence of event_url on cached activities is itself proof that
  // events were relevant for this intent (and the original skeleton, which
  // we no longer have on a cache hit, must have signalled it).
  forceSearch: boolean = false,
): Promise<EventCandidate[]> {
  // ---- Heuristic short-circuit ----
  if (!forceSearch && !shouldSearchEvents(intent, skeleton)) {
    await logger.log({
      feature: "events_search_skipped",
      model: "heuristic",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      cached: false,
    });
    return [];
  }

  // ---- Cache (24h TTL — events go stale fast) ----
  const shape = JSON.stringify({
    dest: destination.toLowerCase().trim(),
    start: startDate,
    end: endDate,
    vibes: [...intent.vibes].sort(),
  });
  const cacheKey = `events:v1:${await sha256Hex(shape)}`;
  const { data: cached, error: cacheErr } = await svcClient
    .from("ai_response_cache")
    .select("response_json")
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cacheErr) {
    throw new Error(`ai_response_cache events lookup failed: ${cacheErr.message}`);
  }
  if (cached?.response_json) {
    return cached.response_json as unknown as EventCandidate[];
  }

  // ---- Vendor selection ----
  const braveKey = Deno.env.get("BRAVE_API_KEY");
  const cseKey = Deno.env.get("GOOGLE_SEARCH_API_KEY");
  const cseId = Deno.env.get("GOOGLE_CSE_ID");
  const queries = buildEventQueries(destination, startDate, intent);

  let groups: Array<{ q: string; hits: RawEventHit[] }> = [];
  if (braveKey) {
    groups = await fetchBraveHits(braveKey, queries);
  } else if (cseKey && cseId) {
    groups = await fetchCseHits(cseKey, cseId, queries);
  } else {
    console.warn(
      "[searchEvents] No BRAVE_API_KEY and no GOOGLE_SEARCH_API_KEY+GOOGLE_CSE_ID configured — returning [].",
    );
    return [];
  }

  const events = normalizeEventHits(groups);

  // ---- Cache write (24h TTL) ----
  const { error: cacheInsErr } = await svcClient.from("ai_response_cache").insert({
    cache_key: cacheKey,
    response_json: events as unknown as Record<string, unknown>,
    expires_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
  });
  if (cacheInsErr && cacheInsErr.code !== "23505") {
    throw new Error(`ai_response_cache events insert failed: ${cacheInsErr.message}`);
  }

  return events;
}

// ===========================================================================
// Step 7: rankAndEnrich — the heart of the engine.
//
// Assigns venues from the pool to slots in the skeleton and writes opinionated
// editorial content for each. Single Haiku call for a whole trip with the
// static system prompt marked cache_control: ephemeral so prompt caching kicks
// in across trips (system prompt ≈ 2.5k tokens; cached reads cost 10x less).
//
// ABSOLUTE INVARIANT: every non-event activity's place_id must reference a
// venue that exists in the input pool. The validator in Step 8 drops anything
// that violates this — but we guard earlier at hydration time too.
//
// After the LLM returns, estimated_cost_per_person is clamped against the
// Google priceLevel → local-currency band, because LLMs routinely lie about
// prices (especially in non-USD currencies).
// ===========================================================================

// country_code (ISO-3166-1 alpha-2) → currency for the trip. Missing codes
// default to USD in resolveTripCurrency. Not exhaustive — covers the most
// common destinations; add rows as we expand.
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  us: "USD", ca: "CAD", mx: "MXN",
  br: "BRL", ar: "ARS", cl: "CLP", pe: "PEN", co: "COP", uy: "UYU",
  gb: "GBP", ie: "EUR",
  es: "EUR", pt: "EUR", fr: "EUR", de: "EUR", nl: "EUR", be: "EUR",
  at: "EUR", it: "EUR", gr: "EUR", fi: "EUR", ee: "EUR", lv: "EUR",
  lt: "EUR", sk: "EUR", si: "EUR", lu: "EUR", mt: "EUR", cy: "EUR",
  hr: "EUR",
  ch: "CHF", se: "SEK", no: "NOK", dk: "DKK", is: "ISK",
  pl: "PLN", cz: "CZK", hu: "HUF", ro: "RON", bg: "BGN", ua: "UAH",
  ru: "RUB", tr: "TRY",
  il: "ILS", ae: "AED", sa: "SAR", qa: "QAR", bh: "BHD", om: "OMR",
  kw: "KWD", jo: "JOD", lb: "LBP", eg: "EGP", ma: "MAD", tn: "TND",
  za: "ZAR", ke: "KES", ng: "NGN",
  jp: "JPY", cn: "CNY", hk: "HKD", tw: "TWD", kr: "KRW",
  sg: "SGD", my: "MYR", th: "THB", id: "IDR", ph: "PHP", vn: "VND",
  in: "INR", lk: "LKR", pk: "PKR", bd: "BDT", np: "NPR",
  au: "AUD", nz: "NZD",
};

// Rough local-currency bands for Google Places priceLevel (index 1..4).
// PRICE_LEVEL_FREE → 0. PRICE_LEVEL_UNSPECIFIED → no clamp applied.
// Bands are per-person for food/experiences, per-room-per-night for lodging.
// Approximations based on late-2024 FX — good enough for V1 clamping.
const PRICE_BANDS: Record<string, [number, number, number, number]> = {
  USD: [15, 40, 100, 300],
  EUR: [14, 35, 90,  275],
  GBP: [12, 35, 80,  240],
  CAD: [20, 55, 135, 400],
  AUD: [22, 60, 150, 450],
  NZD: [22, 60, 150, 450],
  CHF: [15, 40, 90,  275],
  SEK: [130, 380, 950, 2800],
  NOK: [140, 400, 1000, 3000],
  DKK: [90, 260, 650, 2000],
  ISK: [2000, 5500, 13500, 40000],
  PLN: [55, 160, 400, 1200],
  CZK: [300, 900, 2300, 6800],
  HUF: [4500, 13000, 33000, 100000],
  RON: [65, 180, 450, 1400],
  BGN: [25, 70, 175, 540],
  UAH: [600, 1600, 4000, 12000],
  RUB: [1400, 3800, 9500, 28000],
  TRY: [300, 900, 2500, 7500],
  ILS: [45, 130, 330, 1000],
  AED: [40, 110, 280, 850],
  SAR: [45, 130, 330, 1000],
  QAR: [45, 130, 330, 1000],
  EGP: [400, 1200, 3000, 9000],
  MAD: [120, 360, 900, 2700],
  ZAR: [200, 600, 1500, 4500],
  JPY: [1500, 4000, 10000, 30000],
  CNY: [80, 250, 700, 2000],
  HKD: [100, 300, 780, 2300],
  TWD: [400, 1200, 3000, 9000],
  KRW: [15000, 45000, 130000, 400000],
  SGD: [20, 55, 135, 400],
  MYR: [50, 150, 400, 1200],
  THB: [400, 1200, 3000, 9000],
  IDR: [75000, 200000, 500000, 1500000],
  PHP: [700, 2000, 5500, 16000],
  VND: [300000, 900000, 2400000, 7000000],
  INR: [400, 1200, 3500, 10000],
  LKR: [3000, 9000, 23000, 70000],
  MXN: [200, 600, 1500, 4500],
  BRL: [60, 180, 450, 1400],
  ARS: [10000, 30000, 75000, 220000],
  CLP: [10000, 28000, 70000, 210000],
  COP: [45000, 130000, 330000, 1000000],
  PEN: [40, 120, 300, 900],
};

function resolveTripCurrency(countryCode: string | null): string {
  if (!countryCode) return "USD";
  return COUNTRY_TO_CURRENCY[countryCode.toLowerCase()] ?? "USD";
}

// Google priceLevel enum → band index (1..4). 0 or unknown → -1 (skip clamp).
function priceLevelIndex(level: string | null): number {
  switch (level) {
    case "PRICE_LEVEL_FREE":          return 0;
    case "PRICE_LEVEL_INEXPENSIVE":   return 1;
    case "PRICE_LEVEL_MODERATE":      return 2;
    case "PRICE_LEVEL_EXPENSIVE":     return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":return 4;
    default:                           return -1;
  }
}

// ===========================================================================
// Opening-hours validation
// ---------------------------------------------------------------------------
// Real bug from production: Jigger & Spoon (cocktail bar) was scheduled at
// 14:30, Amber Club Lounge (nightclub) at 09:30. The skeleton assigns slot
// times by slot type (afternoon_major=14:30, morning_major=09:30, etc.) and
// the ranker had no opening-hours data — so it could happily file a bar into
// any open slot. Three layers of defence:
//   1. PLACES_DETAILS_FIELD_MASK now fetches regularOpeningHours.
//   2. The ranker digest exposes a compact "open Mon-Sat 17:00-02:00" string
//      AND the day prompt hard-rules venues must be open at slot.start_time.
//   3. Hydration drops any LLM pick whose Places hours data flatly contradicts
//      the slot start_time. logOpeningHoursViolations also runs post-pipeline
//      as observability for whatever slips past the prompt + drop layers.
// ---------------------------------------------------------------------------

// Convert "HH:MM" → minutes-from-midnight. Returns -1 on malformed input so
// callers get a stable failure mode rather than NaN propagation.
function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return -1;
  const h = Number(m[1]), mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return -1;
  return h * 60 + mi;
}

// 0=Sunday..6=Saturday from an ISO yyyy-mm-dd. UTC-based — slot.date is a
// pure calendar date, never a timestamp, so DST/timezone skew is irrelevant.
function isoDateToWeekday(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return -1;
  return d.getUTCDay();
}

// Tests whether (weekday, minutesIntoDay) falls inside any period. Handles
// cross-midnight periods (close.day !== open.day) by walking the period
// forward in (day,minute) space. Returns:
//   true  → venue is open at this moment
//   false → venue is closed at this moment AND we have hours data
//   null  → no hours data (caller must fall back to category-typical hours)
function isVenueOpenAt(
  periods: OpeningHoursPeriod[] | null,
  weekday: number,
  minutesIntoDay: number,
): boolean | null {
  if (!periods || periods.length === 0) return null;
  if (weekday < 0 || minutesIntoDay < 0) return null;
  // Normalise the query point to a single integer in [0, 7*1440).
  const queryPoint = weekday * 1440 + minutesIntoDay;
  for (const p of periods) {
    const openPt = p.open.day * 1440 + p.open.hour * 60 + p.open.minute;
    // 24h-open venues: close is null → period covers the entire week from open.
    if (!p.close) return true;
    let closePt = p.close.day * 1440 + p.close.hour * 60 + p.close.minute;
    // Cross-midnight wrap: bar opens Mon 22:00, closes Tue 04:00 →
    // close.day=2, openPt < closePt naturally. Cross-week wrap (close on
    // Sunday after a Saturday open) → add a full week to the close point.
    if (closePt <= openPt) closePt += 7 * 1440;
    // Account for queries at the cross-midnight tail of a Mon-opened period
    // hitting on Tuesday: Tue 02:00 = 2*1440 + 120 = 3000; openPt = 1320,
    // closePt = 1*1440+22*60 + 1440 = 1320+360+1440 = 3120. queryPoint=3000
    // is between 1320 and 3120 → matches. Or query lands BEFORE openPt by a
    // week's worth: shift queryPoint forward and retest.
    const shifted = queryPoint < openPt ? queryPoint + 7 * 1440 : queryPoint;
    if (shifted >= openPt && shifted < closePt) return true;
  }
  return false;
}

// Category-typical hours fallback for venues with no Places hours data.
// Intentionally permissive — we only want to BLOCK obvious mismatches
// (cocktail bar at 09:30) and never let a fallback prevent a valid pick.
// Each entry is [openMinutes, closeMinutes] where close > 1440 means cross-midnight.
const CATEGORY_FALLBACK_HOURS: Array<{ match: RegExp; range: [number, number] }> = [
  { match: /night_club/i,                      range: [22 * 60, 28 * 60] }, // 22:00 - 04:00
  { match: /bar(?!ber)|wine_bar|cocktail/i,    range: [16 * 60, 26 * 60] }, // 16:00 - 02:00
  { match: /restaurant/i,                      range: [11 * 60, 23 * 60] }, // 11:00 - 23:00
  { match: /cafe|bakery|coffee/i,              range: [7  * 60, 18 * 60] }, // 07:00 - 18:00
  { match: /museum|art_gallery|library/i,      range: [10 * 60, 18 * 60] }, // 10:00 - 18:00
  { match: /spa|hair_care|beauty_salon/i,      range: [10 * 60, 20 * 60] }, // 10:00 - 20:00
  { match: /park|natural_feature|tourist_attraction|landmark|church|mosque|temple/i,
    range: [8  * 60, 20 * 60] }, // permissive default for outdoor + sights
];

function categoryFallbackHoursForTypes(types: string[] | null | undefined): [number, number] | null {
  if (!types || types.length === 0) return null;
  const joined = types.join(" ");
  for (const e of CATEGORY_FALLBACK_HOURS) {
    if (e.match.test(joined)) return e.range;
  }
  return null;
}

// Combined check: try Places hours first, fall back to category hours, fall
// back to "unknown" (caller decides). Returns:
//   { open: true|false, source: "places" | "category" | "unknown" }
function checkVenueOpen(
  place: Pick<BatchPlaceResult, "openingHours" | "types"> | null,
  date: string,
  hhmm: string,
): { open: boolean; source: "places" | "category" | "unknown" } {
  if (!place) return { open: true, source: "unknown" };
  const minutesIntoDay = hhmmToMinutes(hhmm);
  const weekday = isoDateToWeekday(date);
  if (minutesIntoDay < 0 || weekday < 0) return { open: true, source: "unknown" };
  const placesAns = isVenueOpenAt(place.openingHours, weekday, minutesIntoDay);
  if (placesAns !== null) return { open: placesAns, source: "places" };
  const fallback = categoryFallbackHoursForTypes(place.types);
  if (!fallback) return { open: true, source: "unknown" };
  // Cross-midnight handling for fallback: close > 1440 means the close is on
  // the next day, so [open..1440) plus [0..close-1440) on the following day
  // are both "open". For a daytime query within [open, close mod 1440), match.
  const [open, close] = fallback;
  const inOpenSpan =
    minutesIntoDay >= open && (close > 1440
      ? true   // open from `open` until past midnight
      : minutesIntoDay < close);
  // Cross-midnight tail: 02:00 should match a "22:00 - 04:00" range. The
  // fallback ranges are weekday-agnostic so we treat each early-morning hour
  // as belonging to the previous calendar evening's range.
  const inWrapTail = close > 1440 && minutesIntoDay < (close - 1440);
  return { open: inOpenSpan || inWrapTail, source: "category" };
}

// Render hours for the ranker digest. One short string ("Mon-Sun 17:00-02:00",
// "Mon closed; Tue-Sun 10:00-18:00", or "hours unknown — assume typical
// daytime"). Keeps the prompt token cost down vs. full structured periods.
function digestHoursSummary(periods: OpeningHoursPeriod[] | null): string | null {
  if (!periods || periods.length === 0) return null;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDay: Record<number, string[]> = {};
  for (const p of periods) {
    if (!p.close) {
      byDay[p.open.day] = ["24h"];
      continue;
    }
    const oh = String(p.open.hour).padStart(2, "0");
    const om = String(p.open.minute).padStart(2, "0");
    const ch = String(p.close.hour).padStart(2, "0");
    const cm = String(p.close.minute).padStart(2, "0");
    (byDay[p.open.day] ??= []).push(`${oh}:${om}-${ch}:${cm}`);
  }
  const days = [];
  for (let i = 0; i < 7; i++) {
    if (byDay[i]) days.push(`${dayNames[i]} ${byDay[i].join(",")}`);
    else days.push(`${dayNames[i]} closed`);
  }
  return days.join("; ");
}

// ===========================================================================
// Realistic experience pricing
// ---------------------------------------------------------------------------
// Real production bug: a "neighbourhood wine aperitif" priced at AED 78
// (~€18) — that buys one glass of wine, not the 1-2 hour 2-3 drinks + small
// bites experience the activity is supposed to represent. The LLM was
// pricing at "menu minimum" rather than "realistic per-person experience
// cost", and clampCostPerPerson only had an upper bound — anything below
// the priceLevel band passed through.
//
// Fix: every (slot type × Places type) combo has an EXPERIENCE_COST_BAND
// in EUR. The band converts to trip currency via the existing PRICE_BANDS
// table (using the EUR vs local "moderate" band as an FX anchor — avoids
// duplicating an FX-table). priceLevel and budget_tier modulate it.
// clampCostPerPerson now enforces both the LLM upper bound (existing) AND
// the realistic floor (new).
// ---------------------------------------------------------------------------

// EUR experience cost ranges per category. Lower bound = "you'd feel
// shortchanged below this for that experience"; upper bound = "the upper
// end of a normal venue of this category". priceLevel + budget_tier
// modifiers below shift inside this band; the band itself stays category-
// shaped.
//
// Resolution order:
//   1. Place type (more specific — e.g. wine_bar in a nightlife slot
//      should use the wine_bar band [30,60], not the generic nightlife
//      [25,70]).
//   2. Slot type (used for meal slots and downtime where no place_type
//      gives extra signal).
//   3. null (caller skips floor/ceiling adjustment).
const EXPERIENCE_COST_BAND_EUR_PLACE: Array<{ match: RegExp; range: [number, number] }> = [
  { match: /night_club/i,                                  range: [35, 90] },
  { match: /wine_bar|cocktail/i,                           range: [30, 60] },
  { match: /bar(?!ber)/i,                                  range: [18, 40] },
  { match: /spa|hair_care|beauty_salon/i,                  range: [50, 200] },
  { match: /museum|art_gallery/i,                          range: [12, 35] },
  { match: /amusement_park|aquarium|zoo/i,                 range: [25, 60] },
  { match: /tourist_attraction|landmark|church|mosque|temple|historical_landmark/i,
                                                            range: [8, 30] },
  { match: /park|natural_feature/i,                        range: [0, 10] },
  { match: /cafe|bakery|coffee/i,                          range: [4, 12] },
  { match: /restaurant/i,                                  range: [22, 55] },
  // NOTE: lodging intentionally NOT in this list. Hotels are clamped via
  // clampLodgingCostPerNight (tier-aware EUR bands, distinct from the
  // food-scaled PRICE_BANDS used for activities). A single per-night band
  // here would either underbid premium hotels or overbid hostels.
];
const EXPERIENCE_COST_BAND_EUR_SLOT: Partial<Record<SlotType, [number, number]>> = {
  breakfast: [6, 18],
  lunch: [18, 45],
  dinner: [30, 80],
  rest: [0, 0],
  arrival: [0, 15],
  departure: [0, 15],
  transit_buffer: [0, 10],
  // Note: nightlife / morning_major / afternoon_major intentionally omitted —
  // those rely on place_type for disambiguation. A nightlife slot at a
  // wine_bar should price as a wine_bar (30-60), not a generic nightlife
  // band (25-70). Same for a morning_major at a museum vs a viewpoint.
};

function lookupExperienceBandEur(slotType: SlotType, placeTypes: string[] | null | undefined): [number, number] | null {
  if (placeTypes && placeTypes.length > 0) {
    const joined = placeTypes.join(" ");
    for (const e of EXPERIENCE_COST_BAND_EUR_PLACE) {
      if (e.match.test(joined)) return e.range;
    }
  }
  return EXPERIENCE_COST_BAND_EUR_SLOT[slotType] ?? null;
}

// PRICE_BANDS[currency][1] is the "moderate" band upper for the local
// currency. EUR moderate is 35. Ratio = local / EUR gives a stable FX
// anchor without maintaining a separate table that'd drift.
function eurToLocalMultiplier(currency: string): number {
  const local = (PRICE_BANDS[currency] ?? PRICE_BANDS.USD)[1];
  const eur = PRICE_BANDS.EUR[1];
  return local / eur;
}

function priceLevelMultiplier(priceLevel: string | null): number {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":           return 0;
    case "PRICE_LEVEL_INEXPENSIVE":    return 0.7;
    case "PRICE_LEVEL_MODERATE":       return 1.0;
    case "PRICE_LEVEL_EXPENSIVE":      return 1.5;
    case "PRICE_LEVEL_VERY_EXPENSIVE": return 2.5;
    default:                           return 1.0;
  }
}

function tierMultiplier(tier: Intent["budget_tier"]): number {
  if (tier === "budget") return 0.75;
  if (tier === "premium") return 1.4;
  return 1.0;
}

// Apply destination-level price baselines (if available) for a non-lodging
// activity. Returns the position-targeted cost in trip currency, OR null
// when baselines aren't available / don't apply (filler slot, no band for
// the category). The caller treats null as "fall back to hardcoded clamp".
//
// PRICE_LEVEL_FREE → 0 always. Unknown priceLevel on a free-coded place
// type (parks, public landmarks, churches) → null so the caller leaves the
// LLM value untouched (avoids bumping a "free" Jemaa el-Fnaa to a median).
function applyBaselinesForActivity(
  baselines: DestinationPriceBaselines,
  slotType: SlotType,
  placeTypes: string[] | null | undefined,
  priceLevel: string | null,
  currency: string,
): number | null {
  const category = baselineCategoryFor(slotType, placeTypes);
  if (!category) return null;
  if (priceLevel === "PRICE_LEVEL_FREE") return 0;
  // Free-coded place types with unknown priceLevel → don't override.
  // Otherwise we'd bump a public landmark to the activity median.
  if (priceLevel === null && placeTypes && placeTypes.length > 0) {
    if (/park|natural_feature|tourist_attraction|landmark|church|mosque|temple|historical_landmark/i
        .test(placeTypes.join(" "))) {
      return null;
    }
  }
  const band = category === "food"
    ? baselines.food_per_meal_eur
    : baselines.activity_per_person_eur;
  const eurTarget = positionInPriceBand(band, priceLevel);
  const fx = eurToLocalMultiplier(currency);
  return Math.max(0, Math.round(eurTarget * fx));
}

// Compute realistic floor + ceiling in trip currency. Returns null if the
// slot/types combo has no band entry — caller skips the floor/ceiling
// adjustment and falls back to the LLM value as-is.
function realisticCostBand(
  slotType: SlotType,
  placeTypes: string[] | null | undefined,
  priceLevel: string | null,
  budgetTier: Intent["budget_tier"],
  currency: string,
): { floor: number; ceiling: number } | null {
  const eurBand = lookupExperienceBandEur(slotType, placeTypes);
  if (!eurBand) return null;
  const [eurFloor, eurCeiling] = eurBand;
  if (eurCeiling === 0) return { floor: 0, ceiling: 0 };
  const fx = eurToLocalMultiplier(currency);
  const plMul = priceLevelMultiplier(priceLevel);
  const tierMul = tierMultiplier(budgetTier);
  // priceLevel modifier dominates (it's per-venue), tier modifier nudges
  // (trip-level lean). Keep the band relatively wide (floor untouched by
  // multipliers) so we don't over-clamp legitimate budget surprises.
  return {
    floor: Math.round(eurFloor * fx * tierMul),
    ceiling: Math.round(eurCeiling * fx * plMul * tierMul),
  };
}

// Clamp LLM-quoted cost against Google's priceLevel band AND the category
// realistic-experience floor in the trip's local currency. LLM may
// exceed the band by ≤ 20 % before we clamp upward — avoids noise on
// values that are plausibly right but unlucky. Below-floor values get
// raised so a "neighbourhood wine aperitif" priced at €18 becomes €30.
// Free venues always return 0. Warn (not throw) so the trip still ships.
function clampCostPerPerson(
  llmCost: number,
  priceLevel: string | null,
  currency: string,
  venueTitle: string,
  slotType: SlotType,
  placeTypes: string[] | null | undefined,
  budgetTier: Intent["budget_tier"],
  baselines: DestinationPriceBaselines | null = null,
  hotelEstimate: AccommodationEstimate | null = null,
): number {
  if (!Number.isFinite(llmCost) || llmCost < 0) llmCost = 0;
  // Hotels are per-room-per-night; the food-scaled PRICE_BANDS used below
  // would clamp a Tokyo 4-star hotel to ¥10,000/night. Route lodging to its
  // own band table.
  if (slotType === "lodging" || isLodgingTypes(placeTypes)) {
    return clampLodgingCostPerNight(
      llmCost, priceLevel, currency, venueTitle, budgetTier, baselines, hotelEstimate,
    );
  }

  // Destination-level baselines (Haiku) — when present, they replace the
  // hardcoded EUR bands. Google price_level still positions the venue
  // within the destination's band. Falls through to the hardcoded path
  // when baselines aren't available (no LLM call this run, or the
  // category doesn't map — filler slots, free-coded landmarks, etc.).
  if (baselines) {
    const baselineTarget = applyBaselinesForActivity(
      baselines, slotType, placeTypes, priceLevel, currency,
    );
    if (baselineTarget !== null) {
      console.log(
        `[activity_clamp] place="${venueTitle}" slot=${slotType} price_level=${priceLevel ?? "null"} ` +
        `raw=${llmCost} clamped=${baselineTarget} source=baselines`,
      );
      return baselineTarget;
    }
  }
  const idx = priceLevelIndex(priceLevel);
  if (idx === 0) return 0;

  const realistic = realisticCostBand(slotType, placeTypes, priceLevel, budgetTier, currency);

  // Step 1: existing priceLevel band ceiling clamp (only when priceLevel known).
  if (idx > 0) {
    const band = PRICE_BANDS[currency] ?? PRICE_BANDS.USD;
    const upper = band[idx - 1];
    const tolerated = upper * 1.2;
    if (llmCost > tolerated) {
      console.warn(
        `[rankAndEnrich] clamped-down "${venueTitle}" from ${llmCost} ${currency} → ${upper} ${currency} ` +
          `(priceLevel=${priceLevel}, band upper=${upper}, tolerated=${tolerated.toFixed(0)})`,
      );
      llmCost = upper;
    }
  }

  // Step 2: realistic-floor adjustment. Skip when no band entry. When the
  // LLM is below the floor by ≥ 15 %, raise to mid-band. The 15% slack is
  // tighter than the priceLevel-clamp's 20%-down tolerance because the
  // failure mode here is more conservative: LLMs systematically lowball
  // (menu minimums) more than they over-quote.
  //
  // SAFETY (floor only): skip the floor adjustment when priceLevel is
  // unknown AND the place type is ambiguous about whether the venue charges
  // (parks, churches, public landmarks). Without this, "Jemaa el-Fnaa"
  // (free) gets bumped from MAD 50 to MAD 196. The ceiling guard still runs
  // to catch over-quotes.
  const skipFloor = idx < 0 && /park|natural_feature|tourist_attraction|landmark|church|mosque|temple|historical_landmark/i.test((placeTypes ?? []).join(" "));
  if (realistic && realistic.ceiling > 0) {
    const tolerated = realistic.floor * 0.85;
    if (!skipFloor && llmCost < tolerated) {
      const target = Math.round((realistic.floor + realistic.ceiling) / 2);
      console.warn(
        `[rankAndEnrich] clamped-up "${venueTitle}" from ${llmCost} ${currency} → ${target} ${currency} ` +
          `(slot=${slotType}, realistic floor=${realistic.floor}, ceiling=${realistic.ceiling})`,
      );
      llmCost = target;
    } else if (llmCost > realistic.ceiling * 1.5) {
      // Realistic-ceiling guard catches over-quotes the priceLevel band
      // missed (e.g. a museum priced at €120 because it has expensive
      // priceLevel — but a realistic museum visit is €12-35 even premium).
      console.warn(
        `[rankAndEnrich] clamped-down(category) "${venueTitle}" from ${llmCost} ${currency} → ${realistic.ceiling} ${currency} ` +
          `(slot=${slotType}, realistic ceiling=${realistic.ceiling})`,
      );
      llmCost = realistic.ceiling;
    }
  }
  return Math.max(0, Math.round(llmCost));
}

// Tier-aware lodging EUR bands (per room per night). Distinct from the
// food-scaled PRICE_BANDS — a "moderate" Tokyo dinner is ¥4,000 but a
// moderate Tokyo 3-star is ¥15,000-25,000. Numbers are deliberately wide
// to cover real-world spread (capsule → ryokan → design hotel).
const LODGING_BAND_EUR_BY_TIER: Record<Intent["budget_tier"], { floor: number; ceiling: number }> = {
  "budget":    { floor: 35,  ceiling: 110 },
  "mid-range": { floor: 95,  ceiling: 280 },
  "premium":   { floor: 200, ceiling: 600 },
};

// Lodging-specific priceLevel modifier. Hotels span a wider quality/price
// range than food (hostel → 5-star is 10x; cheap eats → fine dining is 4x),
// so spread the multipliers further than the food-side priceLevelMultiplier.
function lodgingPriceLevelMultiplier(priceLevel: string | null): number {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":           return 0;
    case "PRICE_LEVEL_INEXPENSIVE":    return 0.65;
    case "PRICE_LEVEL_MODERATE":       return 1.0;
    case "PRICE_LEVEL_EXPENSIVE":      return 1.6;
    case "PRICE_LEVEL_VERY_EXPENSIVE": return 2.4;
    default:                           return 1.0;
  }
}

function isLodgingTypes(placeTypes: string[] | null | undefined): boolean {
  if (!placeTypes || placeTypes.length === 0) return false;
  return /(?:^|\b)(?:lodging|hotel|resort_hotel|motel|guest_house|hostel|bed_and_breakfast|inn|extended_stay_hotel)(?:\b|$)/i.test(
    placeTypes.join(" "),
  );
}

// Clamp lodging-per-night cost into a realistic band keyed on budget_tier
// and modulated by Google priceLevel. Floor adjustment lifts under-quotes
// to mid-band; ceiling adjustment caps obvious over-quotes. Never clamps
// to 0 (PRICE_LEVEL_FREE on a hotel is a Places-side data error, not a
// signal that the night is free).
function clampLodgingCostPerNight(
  llmCost: number,
  priceLevel: string | null,
  currency: string,
  venueTitle: string,
  budgetTier: Intent["budget_tier"],
  baselines: DestinationPriceBaselines | null = null,
  hotelEstimate: AccommodationEstimate | null = null,
): number {
  if (!Number.isFinite(llmCost) || llmCost < 0) llmCost = 0;

  // Per-venue Haiku estimate is preferred when confidence allows. Hotel
  // costs dominate trip totals and have venue-level variance the
  // destination band can't capture (Park Hyatt vs business hotel — both
  // price_level 4 in Tokyo, but 3-4x apart). On low confidence or no
  // estimate, fall through to the destination-baseline path.
  if (hotelEstimate && (hotelEstimate.confidence === "high" || hotelEstimate.confidence === "medium")) {
    const fx = eurToLocalMultiplier(currency);
    const target = Math.max(0, Math.round(hotelEstimate.estimated_eur_per_night * fx));
    console.log(
      `[lodging_clamp] place="${venueTitle}" price_level=${priceLevel ?? "null"} ` +
      `raw=${llmCost} clamped=${target} source=hotel_estimate confidence=${hotelEstimate.confidence}`,
    );
    return target;
  }

  // Destination-level baseline path. Replaces the hardcoded tier band
  // entirely; price_level positions the venue inside the city's lodging
  // band. Falls through on missing baselines.
  if (baselines) {
    const fx = eurToLocalMultiplier(currency);
    // PRICE_LEVEL_FREE on a hotel is bogus Google data — treat as unknown
    // (median) rather than free.
    const effectivePriceLevel = priceLevel === "PRICE_LEVEL_FREE" ? null : priceLevel;
    const targetEur = positionInPriceBand(baselines.lodging_per_night_eur, effectivePriceLevel);
    const target = Math.max(0, Math.round(targetEur * fx));
    const fallbackReason = hotelEstimate?.confidence === "low" ? "low_confidence" : "no_estimate";
    console.log(
      `[lodging_clamp] place="${venueTitle}" price_level=${priceLevel ?? "null"} ` +
      `raw=${llmCost} clamped=${target} source=baselines fallback_reason=${fallbackReason}`,
    );
    if (hotelEstimate?.confidence === "low") {
      console.log(
        `[hotel_estimate] fallback reason=low_confidence used_baseline=${target}`,
      );
    }
    return target;
  }

  const tierBand = LODGING_BAND_EUR_BY_TIER[budgetTier] ?? LODGING_BAND_EUR_BY_TIER["mid-range"];
  const fx = eurToLocalMultiplier(currency);
  // PRICE_LEVEL_FREE on a hotel is bogus Google data; treat as unknown.
  const plMul = priceLevel === "PRICE_LEVEL_FREE" ? 1.0 : lodgingPriceLevelMultiplier(priceLevel);
  const floor = Math.round(tierBand.floor * fx * plMul);
  const ceiling = Math.round(tierBand.ceiling * fx * plMul);
  const target = Math.round((floor + ceiling) / 2);

  // Floor: LLM ≥ 15% below floor → lift to mid-band. Mirrors
  // clampCostPerPerson's slack so a near-floor LLM quote isn't churned.
  const floorTolerated = floor * 0.85;
  if (llmCost < floorTolerated) {
    console.warn(
      `[hydrateActivity.lodging] clamped-up "${venueTitle}" from ${llmCost} ${currency} → ${target} ${currency} ` +
      `(tier=${budgetTier}, priceLevel=${priceLevel}, band=[${floor},${ceiling}])`,
    );
    return Math.max(0, target);
  }
  // Ceiling: LLM > 30% above ceiling → cap. Wider slack than the floor
  // because over-quotes are less destructive than zero-counts.
  if (llmCost > ceiling * 1.3) {
    console.warn(
      `[hydrateActivity.lodging] clamped-down "${venueTitle}" from ${llmCost} ${currency} → ${ceiling} ${currency} ` +
      `(tier=${budgetTier}, priceLevel=${priceLevel}, band=[${floor},${ceiling}])`,
    );
    return ceiling;
  }
  return Math.max(0, Math.round(llmCost));
}


// ---------------------------------------------------------------------------
// Activity schema reused by the per-day ranker tool below.
// ---------------------------------------------------------------------------

const RANKER_ACTIVITY_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: [
    "slot_index", "slot_type", "place_id", "is_event",
    "title", "description", "pro_tip", "why_for_you",
    "category", "estimated_cost_per_person",
  ],
  properties: {
    slot_index: { type: "integer", description: "0-based index into the day's slots array." },
    slot_type:  { type: "string",  description: "Must match skeleton slot.type exactly." },
    place_id:   { type: ["string", "null"], description: "Must come from the venue pool, or null for events/downtime." },
    is_event:   { type: "boolean" },
    title:      { type: "string" },
    description:{ type: "string", description: "2–3 sentences, specific not generic." },
    pro_tip:    { type: "string", description: "One actionable, specific tip." },
    why_for_you:{ type: "string", description: "Reference a concrete intent signal." },
    skip_if:    { type: ["string", "null"] },
    category:   { type: "string", description: "food | culture | nightlife | nature | transit | rest | experience | event" },
    estimated_cost_per_person: { type: "number", description: "In trip currency, honest expected spend." },
    dietary_notes: { type: ["string", "null"] },
  },
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Parallel per-day rank prompts (Part 1).
//
// To shrink wall time on cold trips, we replace the single 60s "all days at
// once" Anthropic call with N parallel per-day calls + 1 trip-metadata call.
// Each call generates a much smaller payload (~1 day worth of slots, or just
// the trip-level fields) and the slowest dominates wall time → first day
// renders ~3x faster.
//
// Caching strategy:
//   - System prompts are tagged cache_control: ephemeral. The per-day system
//     prompt is the SAME across all N calls in a single trip, so the second
//     and later parallel calls can hit Anthropic's prompt cache for the
//     prefix. (First-call writes the cache; concurrent calls within the same
//     trip race the write but still benefit on subsequent identical-prefix
//     trips within the 5-minute TTL.)
//   - The shared user-content block (intent + venue pool + events) is also
//     tagged cache_control on day calls so it caches across the N calls.
//   - The per-day instruction (skeleton for that day) is the only varying
//     part — it stays uncached.
//
// ---------------------------------------------------------------------------

const RANKER_DAY_SYSTEM_PROMPT = `You are an editorial trip curator for Junto. You receive a single day's pacing skeleton and a venue pool, and you must pick venues for each slot and write specific, honest, opinionated copy. The other days of this trip are being generated in parallel by separate calls — focus on YOUR day.

ABSOLUTE RULES — violating any of these makes your output useless:
1. Every activity you emit MUST reference a place_id that appears in the provided venue pool. NEVER invent a place_id. If the pool truly has no fit for a slot, emit place_id=null AND set is_event=false — the validator will drop the slot. Events from the events list are the only case where place_id may be null AND is_event=true.
2. Honor start_time and duration_minutes from the skeleton slot exactly as given. Do not reshape pacing. Your job is editorial, not scheduling.
3. Filter venues that violate intent.must_avoids BEFORE picking. If the only remaining pool candidates violate must_avoids, pick the least-bad and say so honestly in why_for_you.
4. slot_type must match the skeleton — if the slot is "dinner", do not pick a museum.
5. Pick exactly one activity per slot in the skeleton. If a slot is "arrival", "departure", "transit_buffer", or "rest", emit an activity whose category reflects the downtime (e.g. "transit" or "rest") with a short helpful description ("Arrive, check in, unpack" / "Return to the hotel; you've earned it"). place_id=null is acceptable for pure-downtime slots — set is_event=false.
6. Do not pick the venue listed in shared.accommodation_place_id — that's the lodging for the whole trip and is emitted separately.
7. HARD CONSTRAINT — DO NOT pick any place_id listed in shared.avoid_place_ids. Those venues are already used by earlier days of this trip. The system will silently drop any slot that reuses a claimed place_id, leaving the slot visibly empty in the user's itinerary. If the unclaimed pool is too thin to fill every slot, RETURN FEWER ACTIVITIES — emit place_id=null for slots you cannot fill from the unclaimed pool (set is_event=false, slot_type matching the skeleton, and a short description explaining "no suitable venue available — leave open"). An empty slot is acceptable. A reused claimed venue is not.
8. MULTI-DESTINATION ROUTING — HARD CONSTRAINT. The user message includes day.current_leg.{index, name, kind}. You MUST pick venues ONLY from legs[current_leg.index].venue_pool_by_category in the shared trip context. Picks from other legs' pools are silently dropped. If the day's current_leg.kind === "transit", DO NOT pick activity venues for any slot except dinner — emit place_id=null for transit_buffer/morning/afternoon slots (they're travel time, not sightseeing) and a one-sentence description naming the from→to route. Adjacent legs are surfaced in day.adjacent_legs so you can write narrative copy referencing the previous or next destination ("tomorrow you head to <next.name>") — but venues must come from the current leg only.

PACE DISCIPLINE — RESPECT THE EMPTY SPACE:
- intent.pace tells you how full the user wants their days to feel. The skeleton already encodes this — light-pace days have only an afternoon anchor + dinner; balanced has morning + lunch + afternoon + dinner; active stacks three anchors plus all three meals.
- When intent.pace = "leisurely" (Light), the empty space is INTENTIONAL. Do not densify the day through prose. Banned: "After lunch, swing by the cathedral and the museum before dinner" when only one afternoon slot exists. Banned: pro_tips that effectively schedule a second activity ("On your way to dinner, stop at the market and the viewpoint"). One anchor means one anchor — describe it well and let the rest of the day breathe.
- When intent.pace = "active", you can be more directive in pro_tips about chaining the day's anchors — that user wants the structure.

EDITORIAL VOICE — MANDATORY, NOT OPTIONAL:
- Never generic. "Great restaurant" is banned. "A cozy spot" is banned. "Popular with locals" is banned unless you can name the specific local tradition, regular dish, or community ritual that makes it popular. Every description cites something specific to THAT venue: a signature dish, a view, a founder's name, an architectural detail, a ritual, the year it opened, the pastry that sells out by 10am.
- why_for_you MUST reference a concrete signal from the user's parsed intent — a vibe, a must_have, a dietary preference, a pace descriptor, or their group_composition. If no real match exists, say so honestly. Do NOT fabricate a match.
- pro_tip MUST be actionable and specific. Banned: "Consider booking ahead", "Arrive early", "Check their website". Required format examples: "Book 2 weeks ahead for a terrace table overlooking the plaza", "Order the black cod miso — it's what regulars come back for", "Arrive 15 minutes before the 11am tour to beat the noon bus".
- skip_if is OPTIONAL but HONEST. Empty string or null when no genuine caveat.
- description is 2–3 sentences, evocative but concrete. No travel-brochure adjectives ("stunning", "breathtaking", "world-class", "iconic", "must-see") unless immediately grounded in a specific observation.

COST GUIDANCE — REALISTIC EXPERIENCE COST, NOT MENU MINIMUM:
- estimated_cost_per_person is the HONEST per-person spend a traveler actually expects to pay for the FULL experience — not the cheapest single item on the menu. The system enforces both an upper clamp (priceLevel band) AND a lower floor (category-realistic minimum) after you respond.
- Quote in the trip's local currency (shared.currency). NEVER quote USD when the trip currency is something else.
- Per-category realistic ranges (per person, in EUR — convert to local currency):
    breakfast cafe        : 6-18 EUR  (drink + light food)
    lunch restaurant      : 18-45 EUR (main + drink)
    dinner restaurant     : 30-80 EUR (main + 1-2 drinks)
    cocktail bar          : 30-60 EUR (2 drinks)
    wine bar / aperitif   : 30-60 EUR (2-3 drinks + small bites — NOT a single glass)
    casual bar            : 18-40 EUR (2 drinks)
    nightclub             : 35-90 EUR (cover + 2-3 drinks)
    cafe / coffee stop    : 4-12 EUR
    museum / gallery      : 12-35 EUR (ticket + cafe)
    landmark / sight      : 8-30 EUR  (ticket if applicable, otherwise lower)
    park / nature         : 0-10 EUR
    spa / wellness        : 50-200 EUR (treatment, varies sharply by tier)
    nightlife event       : 25-70 EUR
- Tier modifier: budget tier shifts down ~25%, premium shifts up ~40%. priceLevel modifier: 1=0.7x, 2=1.0x, 3=1.5x, 4=2.5x relative to category midpoint.
- For genuinely free attractions (most parks, churches, viewpoints), use 0 — the floor only applies when a non-zero band exists.
- The clamp will warn-and-correct if you under-quote (e.g. "wine bar 18 EUR" gets raised). The honest number is faster than getting clamped.

OPENING HOURS — HARD CONSTRAINT (DO NOT VIOLATE):
- Every slot has start_time (HH:MM) and the day has a date (YYYY-MM-DD). Compute the weekday from the date and check it against each candidate venue's hours field.
- If venue.hours indicates the venue is CLOSED at slot.start_time on that weekday, you MUST NOT pick that venue. Pick a different one from the same pool, or emit place_id=null with a short description if nothing in the pool fits.
- Banned: cocktail bar at 14:30, nightclub at 09:30, dinner restaurant at 11:30, museum at 21:00. These are real production failures the system is now guarded against — the validator post-filters violations and your slot will go empty if you pick wrong.
- venue.hours format: "Mon 10:00-18:00; Tue closed; Wed 10:00-18:00; ..." Each day lists open windows; "closed" means no hours that day; "24h" means continuous. Cross-midnight closes appear on the OPENING day (e.g. a bar open Mon 22:00 to Tue 02:00 shows as "Mon 22:00-02:00" — the close hour wraps).
- venue.hours may be null when Google Places didn't return hours. In that case, fall back to category-typical hours: bars open 16:00-02:00, nightclubs 22:00-04:00, restaurants 11:00-23:00, cafes 07:00-18:00, museums 10:00-18:00, spas 10:00-20:00. NEVER pick a bar/nightclub for a morning or early-afternoon slot even when hours are unknown.

VIBES — MANDATORY INCLUSION CRITERIA:
- Every vibe in intent.vibes is a HARD inclusion signal, not a soft preference. The user explicitly selected each one and expects to see it reflected in their itinerary.
- Across the WHOLE trip (not necessarily this single day) each vibe should be reflected in at least one activity. Coordinate via the venue pool — vibe-aligned venues live in dedicated entries (e.g. nightlife pool for nightlife vibe, parks/viewpoints in attractions for nature/photography vibes).
- For THIS day, prefer venues whose Place types or signature align with the user's vibes when picking activity slots, even when the slot type is generic ("morning_major", "afternoon_major"). Example: vibe = "culture" → prefer a museum venue from the attractions pool over a generic top sight.
- "hidden gems" / "local" / "authentic" / "off the beaten path" — when this vibe is present, prefer venues with FEWER reviews (e.g. 50–500) over the megasights with 50,000+ reviews, even if the latter have higher ratings. Cite the off-trail angle in why_for_you.
- "nightlife" — when this vibe is present AND the day's skeleton has a nightlife slot, the slot MUST be filled from the nightlife pool. Do not swap it for a generic activity.
- If a vibe TRULY cannot be honored on this day (e.g. user picked "beach" for an inland city), say so honestly in the affected activity's why_for_you. Do NOT silently drop the vibe — the validation layer downstream will flag any selected vibe that gets zero coverage.

DIETARY:
- If intent.dietary contains values, only pick food venues that plausibly serve them — or annotate dietary_notes with a specific caveat.
- dietary_notes is OPTIONAL. Only fill it for food activities when there's a real consideration.

MUST-AVOIDS HANDLING:
- "tourist traps" → skip the obvious top sights. Prefer the 4.3–4.6 neighborhood gem over the 4.7 megasight. Justify popular sights in why_for_you.
- "chain restaurants" → skip globally recognized chains.
- "crowds" → prefer venues with 50–500 reviews where rating is still ≥ 4.2.
- "loud" → avoid venues with "lively" / "bustling" / "party" markers.

JUNTO PICKS:
- is_junto_pick is computed later by code — do NOT set it yourself.

EVENTS (may be empty):
- The events list contains snippets from web search — dates often missing or wrong. Only slot an event when there's a nightlife slot for it AND the event genuinely fits the trip's vibes. When you do include an event, set is_event=true and place_id=null.

DAY THEME — MANDATORY, MUST BE SPECIFIC:
- The "theme" field is a 2–5 word label that summarises THIS day for the day picker. It is NOT a slot; it is the headline.
- MUST be specific to THIS day's actual venues — name a neighborhood, landmark, cuisine, or activity type the user will actually do. Examples: "Old Town & coffee culture", "Harbor views & seafood", "Museums & quiet streets", "Markets & nightlife", "Coastal escape", "Speicherstadt & fish market", "Alfama fado night".
- BANNED generic templates (do NOT emit any of these or close paraphrases): "Slow wandering", "Cultural exploration", "Full exploration", "Balanced exploration", "Free day", "Free time", "Exploration", "City highlights", "Sightseeing", "Day of leisure". If your draft theme is generic, rewrite it.
- Bookend days (arrival / departure) get a slightly templated theme but STILL name the destination or a specific anchor. Good: "Arrival & first taste of Lisbon", "Hamburg farewell over harbor lunch". Bad: "Arrival & settling in", "Last highlights & departure".
- The skeleton input may include an empty or placeholder theme — IGNORE IT and write your own based on the venues you picked.
- Other days of this trip are being generated in parallel; you cannot see their themes. Pick the most distinctive feature of YOUR day so collisions are unlikely.

OUTPUT: you MUST call the emit_day tool with the day's structured response. Do not include any text outside the tool call.`;

const RANKER_METADATA_SYSTEM_PROMPT = `You are an editorial trip curator for Junto. You write the trip-level fields (title, summary, packing list) and pick the trip's accommodation. The per-day itinerary is being generated in parallel by separate calls — you do not see the chosen day activities. Lean on the user's parsed intent + the venue pool to write copy that fits the WHOLE trip arc.

ABSOLUTE RULES:
1. accommodation.place_id MUST come from the lodging pool. NEVER invent a place_id. If the lodging pool is empty, set place_id=null and explain in description.
2. trip_title is 4–7 words, evocative, grounded in one specific thing the user is doing (a ritual, a season, a neighborhood). Not "Amazing Portugal Getaway". Try "Porto's Riverside Food & Port Nights".
3. trip_summary is 2–3 sentences. Name one thing the traveler will taste, one thing they'll see, one thing they'll feel. No adjective spam.
4. packing_suggestions is 5–8 items, weather-specific and activity-specific. Not "comfortable shoes" — "closed-toe walking shoes for the cobblestones on Rua das Flores".
5. Honor intent.pace, intent.budget_tier, and intent.must_avoids in the trip narrative.
6. NEVER quote USD when the trip currency is something else.
7. Do NOT include emojis, decorative symbols, or pictographs in titles. Use only plain text, punctuation, and standard characters. Premium and mature aesthetic.

ACCOMMODATION:
- Pick ONE lodging for the whole destination from the lodging pool. Prefer rating ≥ 4.3, reviews 100+, and a priceLevel consistent with intent.budget_tier. If the pool is thin, pick the best available and note the limitation.
- description, pro_tip, why_for_you follow the same EDITORIAL VOICE rules as activities: cite specific details, no travel-brochure adjectives, no generic phrases. estimated_cost_per_person is per person per night in the trip's local currency, assuming double occupancy (~half the room rate). The pipeline clamps this against the destination's lodging baseline and a per-hotel Haiku estimate, both of which are also per-person/double-occupancy, so the value that ships always represents per-person cost.

OUTPUT: call the emit_trip_metadata tool exactly once. No prose outside the tool call.`;

// Per-day tool schema. activities[] reuses the same RANKER_ACTIVITY_SCHEMA the
// monolithic ranker uses, so the rest of the pipeline (hydration, validation,
// affiliate URL building) doesn't need to change.
const RANKER_DAY_TOOL: ClaudeTool = {
  name: "emit_day",
  description: "Emit one day's ranked itinerary. Call exactly once.",
  input_schema: {
    type: "object",
    required: ["day_number", "theme", "activities"],
    properties: {
      day_number: { type: "integer" },
      theme: { type: "string" },
      activities: { type: "array", items: RANKER_ACTIVITY_SCHEMA },
    },
    additionalProperties: false,
  },
};

const RANKER_METADATA_TOOL: ClaudeTool = {
  name: "emit_trip_metadata",
  description: "Emit trip-level metadata + accommodation. Call exactly once.",
  input_schema: {
    type: "object",
    required: ["trip_title", "trip_summary", "packing_suggestions", "accommodation"],
    properties: {
      trip_title: { type: "string", description: "4–7 words, specific, grounded." },
      trip_summary: { type: "string", description: "2–3 sentences, concrete." },
      packing_suggestions: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 10,
      },
      accommodation: {
        type: "object",
        required: ["place_id", "title", "description", "pro_tip", "why_for_you", "estimated_cost_per_person"],
        properties: {
          place_id: { type: ["string", "null"] },
          title: { type: "string" },
          description: { type: "string" },
          pro_tip: { type: "string" },
          why_for_you: { type: "string" },
          skip_if: { type: ["string", "null"] },
          estimated_cost_per_person: { type: "number", description: "Per room per night in trip currency." },
          dietary_notes: { type: ["string", "null"] },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
};

// Per-pace ranker max_tokens — per-day call budget. Active days top out around
// 7 slots × ~250 tokens of editorial = ~1.8k output; we set 4k to leave plenty
// of headroom for verbose copy without truncation.
const DAY_MAX_TOKENS: Record<Intent["pace"], number> = {
  leisurely: 2_500,
  balanced: 3_500,
  active: 4_500,
};
const METADATA_MAX_TOKENS = 1_500;
const COPY_MAX_TOKENS = 600;

// Trip title + summary regenerator. Runs AFTER the per-day rankers complete,
// so it sees the ACTUAL venues in the itinerary (not just the candidate pool
// the metadata writer sees in parallel). Eliminates the confabulation bug
// where summaries name venues like "WONDERS CLUB" that never made it into
// any day's pick. Source-of-truth fix per CLAUDE.md AI Features rule:
// "Never trust LLM to generate factual data like venue names."
const RANKER_COPY_SYSTEM_PROMPT = `You are an editorial trip curator for Junto. You write the FINAL trip title and summary using only the actual venues that appear in the user's itinerary.

ABSOLUTE RULES — violating these makes your output a lie:
1. ALLOWLIST: You will receive a venue allowlist. The trip_summary may name venues ONLY from that list. Spelling MUST match the allowlist verbatim — do not paraphrase, abbreviate, translate, or "tidy up" venue names.
2. NEVER invent a venue name. NEVER name a bar, restaurant, museum, hotel, neighborhood-as-brand, or any proper-noun venue that is not in the allowlist. If you cannot remember whether something is on the list, do not name it.
3. If you want to convey atmosphere without naming a specific venue, use generic terms ("cocktail bars in the old town", "hilltop viewpoints", "back-street trattorias"). Generic phrasing is preferred over a fabricated name.
4. trip_title is 4-7 words, evocative, grounded in the trip's actual character. May reference a neighborhood, a ritual, a season, or an anchor activity. Naming a specific venue in the title is allowed ONLY if that venue appears in the allowlist AND is genuinely the trip's anchor (rare — usually skip).
5. MULTI-DESTINATION TITLES — when trip_shape.destinations contains 2+ entries, the title MUST capture the trip's geographic spread. Name the primary cities (not just the first one) or use a connector that conveys the route. Examples:
   - "Tokyo & Kyoto: Neon Streets, Quiet Temples"
   - "Bangkok to Koh Phangan: City Lights & Island Chill"
   - "Lisbon, Porto & the Coast"
   - "Roman Ruins, Florentine Markets" (city names implicit when paired with anchors)
   Single-destination trips keep the existing single-city title shape.
6. trip_summary is 2-3 sentences. Name one thing the traveler will taste, one thing they'll see, one thing they'll feel. Concrete over generic. No adjective spam. For multi-destination trips, weave in at least one beat per major destination so the summary doesn't read as if only one city exists.
7. Honor intent.pace, intent.budget_tier, and intent.must_avoids in the narrative.
8. NEVER quote USD when the trip currency is something else.
9. Do NOT include emojis, decorative symbols, or pictographs.
10. The downstream validation layer will scan your output for any proper-noun venue not in the allowlist. Mismatches are logged as confabulation. Do not gamble.

OUTPUT: call the emit_trip_copy tool exactly once. No prose outside the tool call.`;

const RANKER_COPY_TOOL: ClaudeTool = {
  name: "emit_trip_copy",
  description: "Emit grounded trip title + summary. Call exactly once.",
  input_schema: {
    type: "object",
    required: ["trip_title", "trip_summary"],
    properties: {
      trip_title: { type: "string", description: "4-7 words, specific, grounded." },
      trip_summary: { type: "string", description: "2-3 sentences. Only names venues from the allowlist." },
    },
    additionalProperties: false,
  },
};

interface RawTripCopy {
  trip_title: string;
  trip_summary: string;
}

// Builds the user message for rankTripCopy. Surfaces the allowlist as a
// machine-readable JSON list AND a top-of-prompt cognitive emphasis block,
// mirroring the CLAIMED PLACES dual-surface pattern in buildDayInstruction —
// long lists buried in nested JSON get under-attended by the model.
function buildCopyInstruction(
  intent: Intent,
  destination: string,
  venueAllowlist: string[],
  accommodationName: string | null,
  currency: string,
  numDays: number,
): string {
  const allowList = accommodationName
    ? [...venueAllowlist, accommodationName]
    : [...venueAllowlist];
  const dedupAllow = Array.from(new Set(allowList.filter((s) => s && s.trim().length > 0)));

  const allowlistBlock = dedupAllow.length > 0
    ? `VENUE ALLOWLIST — HARD CONSTRAINT — these are the ONLY proper-noun venues you may name in trip_summary. Spell each one EXACTLY as written:\n${dedupAllow.map((n) => `  - ${n}`).join("\n")}\n\n`
    : `VENUE ALLOWLIST — HARD CONSTRAINT — the itinerary contains no nameable venues. Write a generic but specific summary using neighborhoods/cuisines/activity types only.\n\n`;

  // Multi-destination trip_shape: surface every leg by name + days_allocated
  // so the title prompt can reference all cities, not just the first. The
  // legacy `destination` field is kept for back-compat with the prompt's
  // older single-destination wording.
  const destinationsList = intent.destinations.map((d) => ({
    name: d.name,
    days_allocated: d.days_allocated,
  }));
  const isMultiDest = destinationsList.length >= 2;
  const multiDestBlock = isMultiDest
    ? `MULTI-DESTINATION TRIP — ${destinationsList.length} legs: ${destinationsList.map((d) => `${d.name} (${d.days_allocated}d)`).join(" -> ")}. The trip_title MUST reference at least the primary city of each leg (or use a route connector like "X to Y" / "X & Y"). The trip_summary MUST weave in at least one beat per major destination.\n\n`
    : "";

  const payload = {
    trip_shape: {
      destination,
      destinations: destinationsList,
      num_days: numDays,
      pace: intent.pace,
      budget_tier: intent.budget_tier,
      currency,
    },
    intent: {
      vibes: intent.vibes,
      must_haves: intent.must_haves,
      must_avoids: intent.must_avoids,
      dietary: intent.dietary,
      group_composition: intent.group_composition,
    },
    venue_allowlist: dedupAllow,
  };
  return `Generate the FINAL trip_title and trip_summary. Call emit_trip_copy exactly once.\n\n${multiDestBlock}${allowlistBlock}${JSON.stringify(payload)}`;
}

// ---------------------------------------------------------------------------
// User-message builder. All dynamic content goes HERE, not in the system
// prompt, so the system prompt stays cacheable across trips.
// ---------------------------------------------------------------------------

interface VenueDigestEntry {
  place_id: string;
  displayName: string | null;
  types: string[];
  rating: number | null;
  reviews: number | null;
  priceLevel: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  // Compact "Mon 10:00-18:00; Tue closed; ..." summary so the ranker can
  // honour opening hours when picking a slot. Null when Places didn't return
  // hours (cached pre-PR or venue genuinely lacks data) — ranker is told to
  // treat null as "assume category-typical hours" via the day prompt.
  hours: string | null;
}

function dedupeByIdKeepFirst(venues: BatchPlaceResult[]): BatchPlaceResult[] {
  const seen = new Set<string>();
  const out: BatchPlaceResult[] = [];
  for (const v of venues) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out;
}

function digestVenue(p: BatchPlaceResult): VenueDigestEntry {
  return {
    place_id: p.id,
    displayName: p.displayName,
    types: p.types,
    rating: p.rating,
    reviews: p.userRatingCount,
    priceLevel: p.priceLevel,
    address: p.formattedAddress,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    hours: digestHoursSummary(p.openingHours),
  };
}

// Shared context text used across all parallel per-day calls + the metadata
// call. By keeping this string identical and tagged with cache_control on the
// caller side, Anthropic's prompt cache can serve every call after the first
// from cache (~10x cheaper, ~50% faster TTFB).
//
// IMPORTANT: this string MUST be deterministic for a given (intent, pool,
// events) triplet. Object key order in JSON.stringify matters; we pin it
// explicitly above.
// Group pool venues by (destinationIndex, poolKey) so multi-destination trips
// can present each leg's candidate pool separately to the ranker.
function groupVenuesByLegAndPool(
  venues: BatchPlaceResult[],
): Map<number, Map<PoolKey, BatchPlaceResult[]>> {
  const out = new Map<number, Map<PoolKey, BatchPlaceResult[]>>();
  for (const v of venues) {
    const legIdx = v.destinationIndex ?? 0;
    let legMap = out.get(legIdx);
    if (!legMap) {
      legMap = new Map();
      out.set(legIdx, legMap);
    }
    const arr = legMap.get(v.poolKey) ?? [];
    arr.push(v);
    legMap.set(v.poolKey, arr);
  }
  return out;
}

// Merge the shared "restaurants" pool into lunch+dinner per leg so each
// per-day call sees rich meal options. Mirrors the legacy single-leg
// behavior, applied independently to each leg's pool map.
function mergeLegRestaurantPool(
  legPool: Map<PoolKey, BatchPlaceResult[]>,
): Map<PoolKey, BatchPlaceResult[]> {
  const merged = new Map(legPool);
  const shared = merged.get("restaurants") ?? [];
  if (shared.length > 0) {
    const lunch = merged.get("lunch") ?? [];
    const dinner = merged.get("dinner") ?? [];
    merged.set("lunch", dedupeByIdKeepFirst([...lunch, ...shared]));
    merged.set("dinner", dedupeByIdKeepFirst([...dinner, ...shared]));
    merged.delete("restaurants");
  }
  return merged;
}

function buildSharedContextText(
  intent: Intent,
  legs: Leg[],
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
  events: EventCandidate[],
  currency: string,
  countryCode: string | null,
): string {
  // venuesByPool is the trip-wide map (used for backward-compat at construction
  // time and for accommodation picking). For multi-destination context we
  // re-derive a per-leg view so each leg gets its own venue_pool_by_category.
  const allVenues: BatchPlaceResult[] = [];
  for (const arr of venuesByPool.values()) for (const v of arr) allVenues.push(v);
  const byLeg = groupVenuesByLegAndPool(allVenues);

  // Per-leg pool digest. Transit legs get an empty pool — the ranker is told
  // to skip activity-style picks on transit days; only the dinner slot may be
  // filled from the TO leg's pool, which the per-day instruction surfaces.
  const legsContext = legs.map((leg) => {
    if (leg.kind === "transit") {
      return {
        index: leg.index,
        name: leg.name,
        kind: "transit" as const,
        days_count: leg.days_count,
        transit: leg.transit_meta ?? null,
        venue_pool_by_category: {},
      };
    }
    const legPool = byLeg.get(leg.index) ?? new Map<PoolKey, BatchPlaceResult[]>();
    const merged = mergeLegRestaurantPool(legPool);
    const pool: Record<string, VenueDigestEntry[]> = {};
    for (const [key, venues] of merged.entries()) {
      const sorted = [...venues].sort((a, b) => {
        const ra = a.rating ?? 0, rb = b.rating ?? 0;
        if (rb !== ra) return rb - ra;
        return (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
      });
      pool[key] = sorted.slice(0, 15).map(digestVenue);
    }
    return {
      index: leg.index,
      name: leg.name,
      kind: "destination" as const,
      days_count: leg.days_count,
      country_code: leg.geo?.country_code ?? null,
      venue_pool_by_category: pool,
    };
  });

  const payload = {
    intent: {
      destination: intent.destination,
      country_code: countryCode,
      currency,
      vibes: intent.vibes,
      must_haves: intent.must_haves,
      must_avoids: intent.must_avoids,
      budget_tier: intent.budget_tier,
      pace: intent.pace,
      dietary: intent.dietary,
      group_composition: intent.group_composition,
      raw_notes: intent.raw_notes,
      // Surface the multi-destination structure in shared context so the
      // ranker reasoning can mention adjacent legs ("tomorrow you head to X").
      destinations: intent.destinations.map((d) => ({
        name: d.name, days_allocated: d.days_allocated, reasoning: d.reasoning,
      })),
    },
    legs: legsContext,
    events: events.map((e) => ({
      name: e.name,
      date_iso: e.date_iso,
      time: e.time,
      venue_name: e.venue_name,
      url: e.url,
      category: e.category,
      description: e.description,
      confidence: e.confidence,
    })),
  };
  return `Trip context (shared across all per-day calls):\n${JSON.stringify(payload)}`;
}

// Per-day instruction. Tells the LLM which day to generate, which venue is
// reserved for accommodation (so it doesn't duplicate it as a slot pick), and
// which place_ids earlier-resolved days have claimed (best-effort dedup hint
// — the runtime also dedupes after the fact).
function buildDayInstruction(
  day: DaySkeleton,
  legs: Leg[],
  accommodationPlaceId: string | null,
  avoidPlaceIds: string[],
): string {
  // Intentionally do NOT pass day.theme. The skeleton's theme is a generic
  // fallback ("" for middle days, "Arrival in X" / "X farewell" for bookends);
  // showing it to the LLM would let it echo the placeholder. The system prompt
  // tells the ranker to invent a specific 2–5 word theme from the venues it
  // picks. Dedup + derive happens downstream if the LLM fails to comply.
  // weekday: 0=Sunday..6=Saturday, computed once per day so the ranker can
  // map slot.start_time + day.weekday against venue.hours without parsing
  // the date itself. Mirrors the calculation in checkVenueOpen.
  const dayWeekdayIdx = isoDateToWeekday(day.date);
  const dayWeekdayName = dayWeekdayIdx >= 0
    ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayWeekdayIdx]
    : null;
  const currentLeg = legs[day.destination_index] ?? legs[0];
  const prevLeg = day.destination_index > 0 ? legs[day.destination_index - 1] : null;
  const nextLeg = day.destination_index < legs.length - 1 ? legs[day.destination_index + 1] : null;
  const slotPayload = {
    day: {
      day_number: day.day_number,
      date: day.date,
      weekday: dayWeekdayName,
      slots: day.slots.map((s, i) => ({
        slot_index: i,
        type: s.type,
        start_time: s.start_time,
        duration_minutes: s.duration_minutes,
        region_tag: s.region_tag_for_queries,
      })),
      // Multi-destination routing. The ranker MUST pick venues from
      // legs[current_leg.index].venue_pool_by_category in shared context.
      // Cross-leg picks are silently dropped at hydrate time.
      current_leg: {
        index: currentLeg?.index ?? 0,
        name: currentLeg?.name ?? "",
        kind: currentLeg?.kind ?? "destination",
        ...(day.transit
          ? { transit: {
              from_index: day.transit.from_index,
              to_index: day.transit.to_index,
              description: day.transit.description,
            } }
          : {}),
      },
      // Adjacent-leg context lets the ranker reference upcoming/previous
      // destinations in narrative copy ("tomorrow you head to X"). Empty
      // strings for trip start/end.
      adjacent_legs: {
        previous: prevLeg ? { name: prevLeg.name, kind: prevLeg.kind } : null,
        next: nextLeg ? { name: nextLeg.name, kind: nextLeg.kind } : null,
      },
    },
    shared: {
      accommodation_place_id: accommodationPlaceId,
      // avoid_place_ids is intentionally surfaced both here (machine-readable,
      // canonical location) and in the CLAIMED PLACES block below (cognitive
      // emphasis). The dual-surface is deliberate: long avoid lists buried in
      // nested JSON get under-attended by the model, but removing the field
      // from `shared` would silently break any downstream consumer that reads
      // the structured form.
      avoid_place_ids: avoidPlaceIds,
    },
  };
  // Claimed places get top-of-prompt placement when non-empty. Sequential
  // ranking sends a populated list every day after day 1; this block makes
  // the constraint visually obvious and harder for the model to skip.
  // Plain text emphasis (no emoji or special chars) per project style.
  const claimedBlock = avoidPlaceIds.length > 0
    ? `CLAIMED PLACES — HARD CONSTRAINT — ${avoidPlaceIds.length} venue(s) already used by earlier days of this trip. DO NOT pick any of these place_ids; the system will silently drop any slot that reuses one. Emit place_id=null for slots you cannot fill from the unclaimed pool — fewer activities is the correct outcome:\n${avoidPlaceIds.map((id) => `  - ${id}`).join("\n")}\n\n`
    : "";
  return `Generate THIS day only. Call emit_day exactly once.\n\n${claimedBlock}${JSON.stringify(slotPayload)}`;
}

function buildMetadataInstruction(
  intent: Intent,
  numDays: number,
  startDate: string,
  endDate: string,
): string {
  const payload = {
    trip_shape: {
      destination: intent.destination,
      num_days: numDays,
      start_date: startDate,
      end_date: endDate,
      pace: intent.pace,
      budget_tier: intent.budget_tier,
    },
  };
  return `Generate trip-level metadata + accommodation. Call emit_trip_metadata exactly once.\n${JSON.stringify(payload)}`;
}

// ---------------------------------------------------------------------------
// Hydration — take a ranker pick + pool venue → EnrichedActivity.
// Fields the LLM produced (editorial + cost) are clamped/passed through;
// factual fields (coords, photos, rating) come from the pool.
// ---------------------------------------------------------------------------

interface RawRankerActivity {
  slot_index: number;
  slot_type: string;
  place_id: string | null;
  is_event: boolean;
  title: string;
  description: string;
  pro_tip: string;
  why_for_you: string;
  skip_if: string | null;
  category: string;
  estimated_cost_per_person: number;
  dietary_notes: string | null;
}

// Photo URLs are now produced by the mirror-to-Storage path
// (mirrorPhotosForPlaces in _shared/places/photoMirror.ts) — call sites pass
// the resulting Storage URLs into hydrateActivity directly. The previous
// buildPhotoUrls helper baked GOOGLE_PLACES_API_KEY into every <img src>
// returned to the client and was retired in the photo-loading optimization
// PR.

// Neighborhood preference order: the first address component that carries one
// of these types wins. Google returns these in decreasing granularity, so
// sublocality_level_1 (e.g. "Kreuzberg") is preferred over sublocality, and
// both over the generic "neighborhood" tag.
const NEIGHBORHOOD_TYPE_PRIORITY = [
  "sublocality_level_1",
  "sublocality",
  "neighborhood",
];

function extractNeighborhood(components: AddressComponent[]): string | null {
  if (!components?.length) return null;
  for (const wanted of NEIGHBORHOOD_TYPE_PRIORITY) {
    const hit = components.find((c) => c.types?.includes(wanted));
    if (hit?.longText) return hit.longText;
  }
  return null;
}

// Lightweight fuzzy-match for events — the ranker copies title text from the
// snippet most of the time, so a normalized substring check is enough. We
// avoid Levenshtein here because event names can be long and the marginal
// benefit isn't worth the CPU when we already have the candidate list.
function normalizeEventKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchEventCandidate(
  title: string,
  description: string,
  events: EventCandidate[],
): EventCandidate | null {
  if (!events.length) return null;
  const t = normalizeEventKey(title);
  const d = normalizeEventKey(description);
  if (!t && !d) return null;

  let best: { ev: EventCandidate; score: number } | null = null;
  for (const ev of events) {
    const n = normalizeEventKey(ev.name);
    if (!n) continue;
    let score = 0;
    if (t && n.includes(t)) score += 3;
    else if (t && t.includes(n)) score += 2;
    if (d && n && d.includes(n)) score += 1;
    if (ev.venue_name) {
      const v = normalizeEventKey(ev.venue_name);
      if (v && (t.includes(v) || d.includes(v))) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { ev, score };
  }
  return best?.ev ?? null;
}

function hydrateActivity(
  raw: RawRankerActivity,
  slot: PacingSlot,
  place: BatchPlaceResult | null,
  // Mirrored Supabase Storage URLs for this place's hero photos. The caller
  // looks them up via photoUrlByPlaceId.get(place.id); empty array means the
  // mirror failed or the place had no photos. NEVER pass raw Google URLs
  // here — they would embed the API key and be persisted to the client.
  photoUrls: string[],
  currency: string,
  budgetTier: Intent["budget_tier"],
  events: EventCandidate[] = [],
  baselines: DestinationPriceBaselines | null = null,
  hotelEstimate: AccommodationEstimate | null = null,
): EnrichedActivity | null {
  // Non-event activities without a pool match get dropped here.
  if (!raw.is_event && !place) return null;

  // For events, try to bind a url from the snippet pool. No match → null URL,
  // warn for observability, validator later keeps the row but the decorate
  // loop will emit an empty event_direct URL.
  let event_url: string | null = null;
  if (raw.is_event) {
    const match = matchEventCandidate(raw.title ?? "", raw.description ?? "", events);
    if (match?.url) {
      event_url = match.url;
    } else {
      console.warn(
        `[hydrateActivity] event "${raw.title}" had no candidate url match (events pool size=${events.length})`,
      );
    }
  }

  const duration_minutes = slot.duration_minutes;
  const duration_hours = minutesToHours1dp(duration_minutes);

  const clampedCost = place
    ? clampCostPerPerson(
        raw.estimated_cost_per_person,
        place.priceLevel,
        currency,
        raw.title,
        slot.type,
        place.types,
        budgetTier,
        baselines,
        hotelEstimate,
      )
    : Math.max(0, Math.round(raw.estimated_cost_per_person ?? 0));

  const title = stripEmojis(raw.title) || stripEmojis(place?.displayName) || "Activity";

  return {
    place_id: place?.id ?? "",
    title,
    description: raw.description?.trim() ?? "",
    pro_tip: raw.pro_tip?.trim() ?? "",
    why_for_you: raw.why_for_you?.trim() ?? "",
    skip_if: raw.skip_if?.trim() ? raw.skip_if.trim() : null,
    category: raw.category?.trim() || "experience",
    start_time: slot.start_time,
    duration_minutes,
    duration_hours,
    location_name: place?.formattedAddress ?? "",
    neighborhood: place ? extractNeighborhood(place.addressComponents) : null,
    latitude: place?.location?.latitude ?? 0,
    longitude: place?.location?.longitude ?? 0,
    rating: place?.rating ?? null,
    user_rating_count: place?.userRatingCount ?? null,
    // Snapshot for downstream validators. Empty array (not omitted) when no
    // place — keeps JSON shape stable across event/non-event rows.
    place_types: place?.types ?? [],
    // Sourced directly from Places — never from the ranker. Even if the LLM
    // fabricates these on RawRankerActivity (it can't — schema doesn't expose
    // the fields), we'd overwrite here.
    price_level: place?.priceLevel ?? null,
    priceRange: place?.priceRange ?? null,
    // Storage-mirrored URLs are passed in; never construct Google URLs with
    // the API key here. Empty array if the place has no photos or every
    // mirror attempt failed.
    photos: place ? photoUrls : [],
    google_maps_url: place?.googleMapsUri ?? null,
    estimated_cost_per_person: clampedCost,
    currency,
    booking_url: "",          // filled in Step 8
    booking_partner: "google_maps", // default; Step 8 overrides
    is_junto_pick: false,     // set by Step 8
    dietary_notes: raw.dietary_notes?.trim() || undefined,
    event_url,
  };
}

interface RawRankerAccommodation {
  place_id: string | null;
  title: string;
  description: string;
  pro_tip: string;
  why_for_you: string;
  skip_if: string | null;
  estimated_cost_per_person: number;
  dietary_notes: string | null;
}


// ---------------------------------------------------------------------------
// Day-theme post-processing — dedup duplicates and replace generic fallbacks.
// Per-day calls run in parallel and cannot see each other's themes, so even
// with a strict system prompt two days can land on the same label. Bookend
// fallbacks ("Arrival in X", "X farewell") and the empty-string fallback for
// middle days both flow through here too. We walk in day_number order so
// day 1 always gets first claim on its theme, and later collisions are
// rewritten using the day's own activity venues.
// ---------------------------------------------------------------------------

const GENERIC_THEME_PATTERNS: RegExp[] = [
  /^slow wandering$/i,
  /^cultural exploration$/i,
  /^free (day|time)$/i,
  /^(full |balanced )?exploration$/i,
  /^rest day(\s|$).*/i,
  /^city highlights$/i,
  /^sightseeing$/i,
  /^day of leisure$/i,
  /^day \d+$/i,
];

function isGenericTheme(s: string | undefined | null): boolean {
  if (!s) return true;
  const t = s.trim();
  if (!t) return true;
  return GENERIC_THEME_PATTERNS.some((rx) => rx.test(t));
}

function normalizeTheme(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const MEAL_CATEGORY_RX = /dinner|lunch|breakfast|brunch|food|cafe|coffee|restaurant|bistro|trattoria|bakery/i;

function shortFoodLabel(meal: EnrichedActivity): string {
  const haystack = `${meal.title} ${meal.dietary_notes ?? ""} ${meal.category}`.toLowerCase();
  if (/seafood|fish|harbor|oyster/.test(haystack)) return "seafood";
  if (/coffee|cafe|kaffee|espresso/.test(haystack)) return "coffee culture";
  if (/wine|vineyard|cellar/.test(haystack)) return "wine";
  if (/market|mercado|markt/.test(haystack)) return "market eats";
  if (/bbq|grill|asado/.test(haystack)) return "grilled fare";
  if (/ramen|sushi|izakaya/.test(haystack)) return "Japanese food";
  if (/tapas|pintxos/.test(haystack)) return "tapas";
  if (/pastry|bakery|patisserie/.test(haystack)) return "pastries";
  return "local food";
}

// Build a deterministic theme from a day's activities. Tries each unique
// neighborhood paired with a meal cuisine clue before falling back to an
// activity title. Skips candidates already taken so duplicates don't recur.
function deriveDayTheme(
  activities: EnrichedActivity[],
  dayNumber: number,
  taken: Set<string>,
): string {
  const isMeal = (a: EnrichedActivity) => MEAL_CATEGORY_RX.test(a.category);
  const neighborhoods: string[] = [];
  for (const a of activities) {
    if (a.neighborhood && !neighborhoods.includes(a.neighborhood)) {
      neighborhoods.push(a.neighborhood);
    }
  }
  const meal = activities.find((a) => isMeal(a) && a.title);
  for (const n of neighborhoods) {
    const cuisine = meal ? shortFoodLabel(meal) : null;
    const candidate = cuisine ? `${n} & ${cuisine}` : `${n} highlights`;
    if (!taken.has(normalizeTheme(candidate))) return candidate;
  }
  const firstNonMeal = activities.find((a) => !isMeal(a) && a.title);
  if (firstNonMeal?.title) {
    const words = firstNonMeal.title.split(/\s+/).slice(0, 3).join(" ");
    const candidate = `${words} day`;
    if (!taken.has(normalizeTheme(candidate))) return candidate;
  }
  return `Day ${dayNumber} highlights`;
}

// Mutates each day's theme in place. Resolves a single day at a time so it
// works for both the streaming emit-as-you-go path and the batch path.
function resolveDayTheme(day: RankedDay, taken: Set<string>): void {
  const original = day.theme?.trim() ?? "";
  let candidate = original;
  if (isGenericTheme(candidate) || (candidate && taken.has(normalizeTheme(candidate)))) {
    candidate = deriveDayTheme(day.activities, day.day_number, taken);
  }
  if (taken.has(normalizeTheme(candidate))) {
    candidate = deriveDayTheme(day.activities, day.day_number, taken);
  }
  day.theme = candidate;
  taken.add(normalizeTheme(candidate));
}

// ---------------------------------------------------------------------------
// Parallel rank — N per-day calls + 1 metadata call, all in flight at once.
// ---------------------------------------------------------------------------

interface RawRankerDay {
  day_number: number;
  theme: string;
  activities: RawRankerActivity[];
}

interface RawTripMetadata {
  trip_title: string;
  trip_summary: string;
  packing_suggestions: string[];
  accommodation: RawRankerAccommodation;
}

// Pick the best lodging upfront (pure code, no LLM) so per-day calls can be
// told which place_id to skip + the metadata call can edit copy for it. Sort
// by (rating desc, reviews desc) and take the top — same heuristic the
// existing ranker leans on, but we don't need an LLM round-trip for the pick.
// Defensive filter: even though buildPlacesQueries asks Google for
// includedType="lodging", the Places API occasionally returns mixed-type
// results (e.g. a hotel restaurant or a hotel-adjacent venue with a
// non-lodging primary type). And the LLM metadata call's
// `accommodation.place_id` can land on ANY pool member; we need to refuse
// non-lodging picks before they ship as a hotel card. Returns true iff the
// place's types[] intersects LODGING_TYPES.
function isLodgingPlace(place: BatchPlaceResult | null | undefined): boolean {
  if (!place || !Array.isArray(place.types)) return false;
  for (const t of place.types) if (LODGING_TYPES.has(t)) return true;
  return false;
}

function pickAccommodationPlaceId(
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
): string | null {
  const lodging = (venuesByPool.get("lodging") ?? []).filter(isLodgingPlace);
  if (lodging.length === 0) return null;
  const sorted = [...lodging].sort((a, b) => {
    const ra = a.rating ?? 0, rb = b.rating ?? 0;
    if (rb !== ra) return rb - ra;
    return (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
  });
  return sorted[0]?.id ?? null;
}

// Per-leg accommodation. Returns one place_id per real-destination leg
// (transit legs get null — they don't have lodging). The first lodging entry
// in each leg's pool (sorted by rating + reviews) wins. Used by multi-leg
// ranking so each destination gets its own accommodation card.
function pickAccommodationPlaceIdsByLeg(
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
  legs: Leg[],
): Map<number, string | null> {
  const lodging = (venuesByPool.get("lodging") ?? []).filter(isLodgingPlace);
  const out = new Map<number, string | null>();
  for (const leg of legs) {
    if (leg.kind !== "destination") {
      out.set(leg.index, null);
      continue;
    }
    const candidates = lodging.filter((v) => (v.destinationIndex ?? 0) === leg.index);
    if (candidates.length === 0) {
      out.set(leg.index, null);
      continue;
    }
    const sorted = [...candidates].sort((a, b) => {
      const ra = a.rating ?? 0, rb = b.rating ?? 0;
      if (rb !== ra) return rb - ra;
      return (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
    });
    out.set(leg.index, sorted[0]?.id ?? null);
  }
  return out;
}

// Maximum lodging alternatives to surface in the accommodation event for
// in-app SWAP. Frontend renders up to this many; fewer is fine for remote
// destinations where the lodging pool is thin.
const MAX_ACCOMMODATION_ALTERNATIVES = 5;

// Pick alternative lodging place_ids for a given leg (excluding the chosen
// hotel). Uses the same lodging-type filter as pickAccommodationPlaceIdsByLeg
// (PR #261's isLodgingPlace) so non-hotels never slip through. Same leg-scoped
// candidate pool means alternatives come from the same neighborhood/area as
// the chosen hotel via Places' location bias.
//
// Sort: rating desc, then review-count desc — same heuristic as the primary
// pick, so the "best of the rest" surfaces first. Caller hydrates each id
// the same way as the chosen hotel (hydrateActivity + buildAffiliateUrl).
//
// Returns an array of BatchPlaceResult of length 0..MAX_ACCOMMODATION_ALTERNATIVES.
// 0 is acceptable for remote destinations with a single lodging candidate.
function pickAccommodationAlternativesForLeg(
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
  legIdx: number,
  excludePlaceId: string | null,
): BatchPlaceResult[] {
  const lodging = (venuesByPool.get("lodging") ?? []).filter(isLodgingPlace);
  const candidates = lodging.filter(
    (v) => (v.destinationIndex ?? 0) === legIdx && v.id !== excludePlaceId,
  );
  if (candidates.length === 0) return [];
  candidates.sort((a, b) => {
    const ra = a.rating ?? 0, rb = b.rating ?? 0;
    if (rb !== ra) return rb - ra;
    return (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
  });
  return candidates.slice(0, MAX_ACCOMMODATION_ALTERNATIVES);
}

// Validate a metadata-supplied accommodation place_id. Returns the place_id
// only when the place exists in the lodging pool AND has a lodging-typed
// types[]. Otherwise returns null and logs the rejection so the caller can
// fall back to the per-leg auto-pick. Catches the "LLM picks a sushi
// restaurant for the hotel" failure mode (the metadata call's
// accommodation.place_id is unconstrained — it can come from any pool —
// because LLMs occasionally violate the system prompt instruction to pick
// from the lodging pool only).
function validateMetaAccommodationPlaceId(
  candidatePlaceId: string | null,
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
): string | null {
  if (!candidatePlaceId) return null;
  const lodging = (venuesByPool.get("lodging") ?? []).filter(isLodgingPlace);
  const match = lodging.find((p) => p.id === candidatePlaceId);
  if (match) return candidatePlaceId;
  // Diagnostic: was the place id ANYWHERE in the trip pool? If so, log the
  // type mismatch so we can see what the LLM actually picked.
  for (const arr of venuesByPool.values()) {
    for (const p of arr) {
      if (p.id === candidatePlaceId) {
        console.warn(
          `[accommodation] REJECT meta place_id="${candidatePlaceId}" "${p.displayName}" — ` +
          `not a lodging place (types=${JSON.stringify(p.types?.slice(0, 5) ?? [])}, pool=${p.poolKey}). ` +
          `Falling back to per-leg auto-pick.`,
        );
        return null;
      }
    }
  }
  console.warn(
    `[accommodation] REJECT meta place_id="${candidatePlaceId}" — not in trip pool at all. ` +
    `Falling back to per-leg auto-pick.`,
  );
  return null;
}

// One per-day Anthropic call. Returns the raw tool input on success, null on
// any failure (caller decides whether to retry / skeleton-fallback).
//
// Uses prompt caching on the system block + the shared user-content block so
// the second-and-later parallel calls can hit Anthropic's prompt cache for
// the expensive prefix. The per-day instruction varies and stays uncached.
async function rankDay(
  anthropicKey: string,
  intent: Intent,
  day: DaySkeleton,
  legs: Leg[],
  sharedContext: string,
  accommodationPlaceId: string | null,
  avoidPlaceIds: string[],
  pipelineStartedAt: number,
  step: string,
): Promise<{ data: RawRankerDay | null; usage: ClaudeUsage }> {
  const result = await callClaudeHaiku<RawRankerDay>(
    anthropicKey,
    [{ type: "text", text: RANKER_DAY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    [
      { type: "text", text: sharedContext, cache_control: { type: "ephemeral" } },
      { type: "text", text: buildDayInstruction(day, legs, accommodationPlaceId, avoidPlaceIds) },
    ],
    RANKER_DAY_TOOL,
    DAY_MAX_TOKENS[intent.pace],
    pipelineStartedAt,
    step,
  );
  return result;
}

// Grounded title + summary regenerator. Runs AFTER day rankings complete so
// it can be told the actual chosen venues as an allowlist. The output
// overwrites the trip_title + trip_summary the parallel rankTripMetadata
// call produced from the (broader, often confabulation-prone) candidate pool.
async function rankTripCopy(
  anthropicKey: string,
  intent: Intent,
  destination: string,
  venueAllowlist: string[],
  accommodationName: string | null,
  currency: string,
  numDays: number,
  pipelineStartedAt: number,
): Promise<{ data: RawTripCopy | null; usage: ClaudeUsage }> {
  return await callClaudeHaiku<RawTripCopy>(
    anthropicKey,
    [{ type: "text", text: RANKER_COPY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    [
      { type: "text", text: buildCopyInstruction(intent, destination, venueAllowlist, accommodationName, currency, numDays) },
    ],
    RANKER_COPY_TOOL,
    COPY_MAX_TOKENS,
    pipelineStartedAt,
    "rankTripCopy",
    0,
  );
}

// Trip-level fields + accommodation. Runs in parallel with the per-day calls.
async function rankTripMetadata(
  anthropicKey: string,
  intent: Intent,
  numDays: number,
  startDate: string,
  endDate: string,
  sharedContext: string,
  pipelineStartedAt: number,
): Promise<{ data: RawTripMetadata | null; usage: ClaudeUsage }> {
  return await callClaudeHaiku<RawTripMetadata>(
    anthropicKey,
    [{ type: "text", text: RANKER_METADATA_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    [
      { type: "text", text: sharedContext, cache_control: { type: "ephemeral" } },
      { type: "text", text: buildMetadataInstruction(intent, numDays, startDate, endDate) },
    ],
    RANKER_METADATA_TOOL,
    METADATA_MAX_TOKENS,
    pipelineStartedAt,
    "rankTripMetadata",
    0,
  );
}

// Per-day Promise wrapper that retries once on transient failure (parse,
// network, or 5xx) before resolving to a skeleton-only fallback. This keeps
// "one bad day" from sinking the whole trip, per CLAUDE.md AI Features rule:
// "Wrap all AI calls in try/catch with user-facing toast errors."
//
// Returns:
//   { day_number, theme, activities, source: "llm"|"fallback" }
//   - source="llm" → activities populated by the model
//   - source="fallback" → empty activities; caller decides skeleton-only
//     rendering or per-day error event
async function rankDayWithRetry(
  anthropicKey: string,
  intent: Intent,
  day: DaySkeleton,
  legs: Leg[],
  sharedContext: string,
  accommodationPlaceId: string | null,
  avoidPlaceIds: string[],
  pipelineStartedAt: number,
  logger: LLMLogger,
): Promise<{
  raw: RawRankerDay | null;
  usage: ClaudeUsage;
  source: "llm" | "fallback";
}> {
  const step = `rankDay#${day.day_number}`;
  let lastErr: unknown = null;
  let lastUsage: ClaudeUsage | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await rankDay(
        anthropicKey,
        intent,
        day,
        legs,
        sharedContext,
        accommodationPlaceId,
        avoidPlaceIds,
        pipelineStartedAt,
        step,
      );
      lastUsage = result.usage;
      // Best-effort log per attempt so the cost dashboard sees retries.
      await logger.log({
        feature: `trip_builder_rank_day`,
        model: HAIKU_MODEL,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cost_usd: computeHaikuCost(result.usage),
        cached: result.usage.cache_read_input_tokens > 0,
      }).catch((e) => console.error(`[${step}] logger.log failed:`, (e as Error).message));
      if (result.data) {
        return { raw: result.data, usage: result.usage, source: "llm" };
      }
      // No tool input — treat as transient and retry once.
      lastErr = new Error("rankDay returned no tool input");
    } catch (e) {
      lastErr = e;
      console.warn(`[${step}] attempt ${attempt + 1} failed:`, (e as Error).message);
    }
  }
  console.error(`[${step}] both attempts failed; falling back to skeleton-only:`, (lastErr as Error)?.message);
  return {
    raw: null,
    usage: lastUsage ?? { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    source: "fallback",
  };
}

// Build a fallback transit-day activity. Used in place of an LLM call for
// dedicated transit days — the LLM has no useful work to do (no venues to
// pick), and skipping the call saves wall time + cost. The fallback emits one
// transit_buffer activity with the route description.
function buildTransitDayFallback(day: DaySkeleton): RawRankerDay {
  const transit = day.transit;
  const description = transit?.description
    ? transit.description
    : `Travel day between destinations`;
  const slotIdx = day.slots.findIndex((s) => s.type === "transit_buffer");
  const useIdx = slotIdx >= 0 ? slotIdx : 0;
  return {
    day_number: day.day_number,
    theme: `Travel day`,
    activities: [
      {
        slot_index: useIdx,
        slot_type: day.slots[useIdx]?.type ?? "transit_buffer",
        place_id: null,
        is_event: false,
        title: "Travel day",
        description,
        pro_tip: "Pack snacks, charge devices, and plan a light dinner near your new hotel.",
        why_for_you: "Long travel days deserve their own breathing room — don't try to squeeze sightseeing in.",
        skip_if: null,
        category: "transit",
        estimated_cost_per_person: 0,
        dietary_notes: null,
      },
    ],
  };
}

// rankInParallel — parallel orchestrator used by the non-streaming JSON path.
// Returns a fully-assembled PipelineResult (still pre-junto-picks, pre-validate,
// pre-affiliate-decorate; the caller chains those steps the same way it did
// for the old monolithic rankAndEnrich).
async function rankInParallel(
  anthropicKey: string,
  intent: Intent,
  skeleton: DaySkeleton[],
  legs: Leg[],
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
  events: EventCandidate[],
  googleKey: string,
  geos: GeocodeResult[],
  startDate: string,
  endDate: string,
  logger: LLMLogger,
  pipelineStartedAt: number,
  svcClient: ReturnType<typeof createClient>,
): Promise<PipelineResult> {
  // Trip-level currency anchored to leg 0's country. Cross-country trips
  // reasonably surface the first destination's currency to the user; the
  // budget UI lets them override.
  const tripCountryCode = geos[0]?.country_code ?? null;
  const currency = resolveTripCurrency(tripCountryCode);
  const numDays = skeleton.length;

  // Trip-wide place index (covers all legs), plus per-leg lookup so a day's
  // hydrate step can confirm a picked place_id belongs to the day's leg.
  const placeById = new Map<string, BatchPlaceResult>();
  for (const venues of venuesByPool.values()) for (const v of venues) placeById.set(v.id, v);
  const placeByIdByLeg = new Map<number, Map<string, BatchPlaceResult>>();
  for (const venues of venuesByPool.values()) {
    for (const v of venues) {
      const idx = v.destinationIndex ?? 0;
      let m = placeByIdByLeg.get(idx);
      if (!m) { m = new Map(); placeByIdByLeg.set(idx, m); }
      m.set(v.id, v);
    }
  }

  const accomByLeg = pickAccommodationPlaceIdsByLeg(venuesByPool, legs);
  const allAccomIds = new Set<string>();
  for (const id of accomByLeg.values()) if (id) allAccomIds.add(id);
  // Trip-level accommodation hint (used by metadata call, which still emits a
  // single trip_metadata.accommodation). For single-leg trips this matches
  // the legacy behavior exactly; for multi-leg, the metadata call's
  // accommodation lands on whichever leg the chosen place_id belongs to.
  const accommodationPlaceId = accomByLeg.get(0) ?? pickAccommodationPlaceId(venuesByPool);
  const sharedContext = buildSharedContextText(intent, legs, venuesByPool, events, currency, tripCountryCode);

  // Mode selection — see streaming-path comment for rationale.
  const sequentialRanking = numDays >= SEQUENTIAL_RANKING_MIN_DAYS;
  console.log(
    `[rankInParallel] mode=${sequentialRanking ? "sequential" : "parallel"} ` +
    `numDays=${numDays} pool_size=${placeById.size}`,
  );

  // ---- Per-leg destination price baselines (Haiku, ~$0.0005/leg, 30-day
  // cache). Fires in parallel with metadata + day rankers; awaited before
  // hydrate so per-activity clamping can use city-shaped EUR ranges instead
  // of the hardcoded tier bands. Failures are non-fatal — clamps fall back
  // to PR #264's hardcoded LODGING_BAND_EUR_BY_TIER + PRICE_BANDS path.
  const baselinesPromise: Promise<Map<number, DestinationPriceBaselines | null>> = Promise.all(
    legs
      .filter((leg) => leg.kind === "destination" && leg.name)
      .map(async (leg) => {
        try {
          const b = await estimateDestinationPriceBaselines(
            anthropicKey, leg.name, intent.budget_tier, svcClient, logger, pipelineStartedAt,
          );
          return [leg.index, b] as [number, DestinationPriceBaselines | null];
        } catch (e) {
          console.warn(`[price_baselines] leg ${leg.index} (${leg.name}) failed:`, (e as Error).message);
          return [leg.index, null] as [number, DestinationPriceBaselines | null];
        }
      }),
  ).then((entries) => new Map(entries));

  // ---- Per-venue accommodation cost (Haiku, ~$0.005/leg, 30-day cache).
  // For the chosen accommodation per leg we estimate the per-night EUR cost
  // directly from the property's name + city + neighborhood + price_level
  // + rating. Hotel cost dominates the trip total and has venue-level
  // variance that destination baselines can't capture. Alternatives keep
  // the destination-baseline path (cheaper; less impactful since they're
  // only seen via SWAP). On low confidence or any failure the clamp falls
  // back to the destination-baseline + price_level path. ----
  const hotelEstimatesPromise: Promise<Map<string, AccommodationEstimate | null>> = Promise.all(
    legs
      .filter((leg) => leg.kind === "destination" && leg.name)
      .map(async (leg) => {
        const placeId = accomByLeg.get(leg.index) ?? null;
        if (!placeId) return null;
        const place = placeById.get(placeId);
        if (!place) return null;
        const neighborhood = extractNeighborhood(place.addressComponents);
        try {
          const est = await estimateAccommodationCost(
            anthropicKey,
            place.displayName ?? placeId,
            leg.name,
            neighborhood,
            priceLevelEnumToNumber(place.priceLevel),
            place.rating ?? null,
            place.userRatingCount ?? null,
            intent.budget_tier,
            svcClient,
            logger,
            pipelineStartedAt,
          );
          return [placeId, est] as [string, AccommodationEstimate | null];
        } catch (e) {
          console.warn(`[hotel_estimate] leg ${leg.index} hotel="${place.displayName}" failed:`, (e as Error).message);
          return [placeId, null] as [string, AccommodationEstimate | null];
        }
      }),
  ).then((entries) => {
    const out = new Map<string, AccommodationEstimate | null>();
    for (const e of entries) if (e) out.set(e[0], e[1]);
    return out;
  });

  // Metadata fires in parallel either way.
  const metadataPromise = rankTripMetadata(
    anthropicKey, intent, numDays, startDate, endDate, sharedContext, pipelineStartedAt,
  ).then(async (res) => {
    if (res.usage) {
      await logger.log({
        feature: "trip_builder_rank_metadata", model: HAIKU_MODEL,
        input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
        cost_usd: computeHaikuCost(res.usage),
        cached: res.usage.cache_read_input_tokens > 0,
      }).catch(() => {});
    }
    return res;
  }).catch((e) => {
    console.error("[rankInParallel] metadata failed:", (e as Error).message);
    return {
      data: null,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    };
  });

  // ---- Walk in skeleton order. In sequential mode, each day's call sees
  // the cumulative seenIds for ITS OWN LEG (built by the prior day's hydrate
  // step) as avoid_place_ids, so the LLM is told what's claimed within the
  // leg instead of guessing. Cross-leg place_id reuse is allowed (different
  // physical destinations rarely share venues, and forcing trip-wide unique
  // when legs are far apart is wasteful). Receipt-time dedup is per-leg too.
  // ----
  const seenIdsByLeg = new Map<number, Set<string>>();
  const getSeenForLeg = (idx: number): Set<string> => {
    let s = seenIdsByLeg.get(idx);
    if (!s) { s = new Set(); seenIdsByLeg.set(idx, s); }
    return s;
  };
  const ranked_days: RankedDay[] = [];
  const seenThemes = new Set<string>();
  let fallbackDays = 0;
  let thinDays = 0;

  // Mirror Google Place photos to the public `place-photos` Storage bucket
  // for every candidate place in parallel with metadata + day rankers.
  // hydrateActivity reads from this map to populate EnrichedActivity.photos
  // — failures-to-mirror resolve to an empty array per place, never a Google
  // URL with the API key. Wall-time impact is negligible: mirror typically
  // completes in 1-3s while the rank step takes 5-30s.
  const allCandidatePlaces: BatchPlaceResult[] = [];
  for (const venues of venuesByPool.values()) {
    for (const v of venues) allCandidatePlaces.push(v);
  }
  const photoMirrorPromise = mirrorPhotosForPlaces(
    svcClient,
    googleKey,
    allCandidatePlaces,
    { max: 1 },
  ).catch((e) => {
    console.warn("[rankInParallel] photo mirror batch threw:", (e as Error).message);
    return new Map<string, string[]>();
  });

  // Await baselines + hotel estimates + photo mirror before any hydrate runs.
  // All three promises fired in parallel with metadata + day rankers; on
  // cache hit they resolve in ~50ms, on miss in ~1-3s — well under the rank
  // step's 5-30s critical path. Per-leg failures resolve to null/empty
  // entries; clamps fall back to PR #264's hardcoded bands and photos to [].
  const [baselinesByLeg, hotelEstimatesByPlaceId, photoUrlByPlaceId] = await Promise.all([
    baselinesPromise, hotelEstimatesPromise, photoMirrorPromise,
  ]);

  const hydrateDay = (
    day: DaySkeleton,
    rawDay: RawRankerDay | null,
    source: "llm" | "fallback",
  ) => {
    const legIdx = day.destination_index;
    const legSeen = getSeenForLeg(legIdx);
    const legPool = placeByIdByLeg.get(legIdx) ?? new Map();
    const legAccomId = accomByLeg.get(legIdx) ?? null;
    const legBaselines = baselinesByLeg.get(legIdx) ?? null;
    const theme = rawDay?.theme?.trim() || day.theme;
    const activities: EnrichedActivity[] = [];
    const rawActs = Array.isArray(rawDay?.activities) ? rawDay!.activities : [];
    const dropReasons: string[] = [];
    for (let i = 0; i < day.slots.length; i++) {
      const slot = day.slots[i];
      const rawAct = rawActs.find((a) => a?.slot_index === i);
      if (!rawAct) continue;
      if (rawAct.place_id && legSeen.has(rawAct.place_id)) {
        dropReasons.push("dedup");
        continue;
      }
      // Drop picks that collide with this leg's accommodation place_id
      // (the accommodation is rendered separately at the destination level).
      if (legAccomId && rawAct.place_id === legAccomId) {
        dropReasons.push("accommodation_collision");
        continue;
      }
      // Multi-destination scope check: drop picks that don't belong to this
      // leg's pool. This covers both off-leg picks (LLM mistake) and leg
      // boundaries where the same place_id exists in neighboring legs (we
      // keep the day's-leg copy only).
      const place = rawAct.place_id ? legPool.get(rawAct.place_id) ?? null : null;
      if (!rawAct.is_event && rawAct.place_id && !place) {
        dropReasons.push("place_id_not_in_leg_pool");
        continue;
      }
      // Hard-drop: Places returned hours AND those hours say the venue is
      // closed at slot.start_time.
      if (place) {
        const openCheck = checkVenueOpen(place, day.date, slot.start_time);
        if (!openCheck.open && openCheck.source === "places") {
          console.warn(
            `[opening_hours] drop: place_id=${place.id} "${place.displayName}" ` +
            `closed at ${day.date} ${slot.start_time} (slot=${slot.type})`,
          );
          dropReasons.push("closed_at_slot");
          continue;
        }
      }
      const activity = hydrateActivity(
        rawAct, slot, place, place ? (photoUrlByPlaceId.get(place.id) ?? []) : [],
        currency, intent.budget_tier, events, legBaselines,
      );
      if (!activity) {
        dropReasons.push("hydrate_failed");
        continue;
      }
      if (place) legSeen.add(place.id);
      activities.push(activity);
    }
    const rankedDay: RankedDay = {
      date: day.date, day_number: day.day_number, theme, activities,
      destination_index: legIdx,
      ...(day.transit ? { transit: day.transit } : {}),
    };
    resolveDayTheme(rankedDay, seenThemes);
    ranked_days.push(rankedDay);

    const minActivities = day.transit ? 1 : Math.max(2, Math.floor(day.slots.length * 0.5));
    if (activities.length < minActivities) {
      thinDays++;
      const reason =
        source === "fallback" ? "rank_failed"
        : dropReasons.length > 0 ? dropReasons.join(",")
        : "unknown";
      console.warn(
        `[rankInParallel] thin day day_number=${day.day_number} leg=${legIdx} ` +
        `kept=${activities.length} slots=${day.slots.length} ` +
        `mode=${sequentialRanking ? "sequential" : "parallel"} ` +
        `claimed_in_leg=${legSeen.size} leg_pool_size=${legPool.size} ` +
        `reason=${reason}`,
      );
    }
  };

  // Helper: rank one day. Transit days bypass the LLM entirely (we generate a
  // structured fallback). Real-destination days call rankDayWithRetry.
  const rankOneDay = async (day: DaySkeleton, avoidIds: string[]) => {
    if (day.transit) {
      return {
        raw: buildTransitDayFallback(day),
        source: "llm" as const,
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      };
    }
    return await rankDayWithRetry(
      anthropicKey, intent, day, legs, sharedContext,
      accomByLeg.get(day.destination_index) ?? null,
      avoidIds, pipelineStartedAt, logger,
    );
  };

  if (sequentialRanking) {
    let budgetExhausted = false;
    for (const day of skeleton) {
      if (!budgetExhausted) {
        const remainingMs =
          PIPELINE_WALL_CLOCK_MS - (Date.now() - pipelineStartedAt) - PIPELINE_TIMEOUT_BUFFER_MS;
        if (remainingMs <= 0) {
          budgetExhausted = true;
          console.warn(
            `[rankInParallel] remaining_budget_exhausted ` +
            `day_number=${day.day_number} numDays=${numDays} ` +
            `elapsed_ms=${Date.now() - pipelineStartedAt} ` +
            `pipeline_budget_ms=${PIPELINE_WALL_CLOCK_MS} ` +
            `skipping_remaining_days=true`,
          );
        }
      }
      if (budgetExhausted) {
        fallbackDays++;
        hydrateDay(day, null, "fallback");
        continue;
      }
      const avoidIds = Array.from(getSeenForLeg(day.destination_index));
      const settled = await rankOneDay(day, avoidIds);
      if (settled.source === "fallback") fallbackDays++;
      hydrateDay(day, settled.raw, settled.source);
    }
  } else {
    const dayPromises = skeleton.map((day) =>
      rankOneDay(day, []).then((res) => ({ day, ...res })),
    );
    const settledDays = await Promise.all(dayPromises);
    settledDays.sort((a, b) => a.day.day_number - b.day.day_number);
    for (const settled of settledDays) {
      if (settled.source === "fallback") fallbackDays++;
      hydrateDay(settled.day, settled.raw, settled.source);
    }
  }

  const metaResult = await metadataPromise;
  const meta = metaResult.data;

  const totalKept = ranked_days.reduce((n, d) => n + d.activities.length, 0);
  console.log(
    `[rankInParallel] summary mode=${sequentialRanking ? "sequential" : "parallel"} ` +
    `days=${numDays} total_activities=${totalKept} ` +
    `fallback_days=${fallbackDays} thin_days=${thinDays}`,
  );

  // ---- Grounded title + summary (overwrites parallel-metadata's copy) ----
  // The parallel rankTripMetadata call writes title/summary from the broader
  // candidate pool — it can name venues that didn't survive the day rankers'
  // selection. Re-run a narrow Claude call now that we know which venues are
  // ACTUALLY in the itinerary, with that list as a strict allowlist. On
  // failure, fall back to the parallel call's output (current behavior).
  const venueAllowlist = collectVenueAllowlist(ranked_days);
  const accommodationName =
    meta?.accommodation?.title?.trim() ||
    (placeById.get(meta?.accommodation?.place_id ?? accommodationPlaceId ?? "")?.displayName ?? null);
  const groundedCopy = await rankTripCopy(
    anthropicKey, intent, intent.destination, venueAllowlist, accommodationName, currency, numDays, pipelineStartedAt,
  ).then(async (res) => {
    if (res.usage) {
      await logger.log({
        feature: "trip_builder_rank_copy", model: HAIKU_MODEL,
        input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
        cost_usd: computeHaikuCost(res.usage),
        cached: res.usage.cache_read_input_tokens > 0,
      }).catch(() => {});
    }
    return res.data;
  }).catch((e) => {
    console.warn("[rankInParallel] grounded copy failed, falling back to parallel-metadata copy:", (e as Error).message);
    return null;
  });

  // ---- Per-leg accommodation hydration. The metadata call's accommodation
  // editorial copy (title/desc/pro_tip) lands on the leg whose pool contains
  // its picked place_id; other legs get auto-generated copy from the lodging
  // pool's top entry. Transit legs get no accommodation. ----
  const fakeAccomSlot: PacingSlot = {
    type: "lodging", start_time: "15:00", duration_minutes: 0,
    region_tag_for_queries: "primary",
  };
  // Validate the metadata's accommodation pick against the lodging pool
  // BEFORE we route it to a leg. Catches the "LLM picks a sushi restaurant
  // for the hotel" failure mode by refusing non-lodging picks.
  const metaAccomPlaceId = validateMetaAccommodationPlaceId(
    meta?.accommodation?.place_id ?? null,
    venuesByPool,
  );
  const metaAccomLegIdx = (() => {
    if (!metaAccomPlaceId) return -1;
    for (const [idx, m] of placeByIdByLeg.entries()) {
      if (m.has(metaAccomPlaceId)) return idx;
    }
    return -1;
  })();

  const hydrateAccomForLeg = (
    legIdx: number,
  ): { hotel: EnrichedActivity; alternatives: EnrichedActivity[] } | undefined => {
    const placeId = (legIdx === metaAccomLegIdx && metaAccomPlaceId)
      ? metaAccomPlaceId
      : accomByLeg.get(legIdx) ?? null;
    if (!placeId) return undefined;
    const place = placeById.get(placeId) ?? null;
    if (!place) return undefined;
    const useMeta = legIdx === metaAccomLegIdx && meta?.accommodation;
    const legBaselines = baselinesByLeg.get(legIdx) ?? null;
    const hotelEstimate = hotelEstimatesByPlaceId.get(placeId) ?? null;
    const hydrated = hydrateActivity(
      {
        slot_index: -1, slot_type: "lodging",
        place_id: placeId, is_event: false,
        title: useMeta ? (meta!.accommodation!.title ?? place.displayName ?? "Hotel") : (place.displayName ?? "Hotel"),
        description: useMeta ? (meta!.accommodation!.description ?? "") : "",
        pro_tip: useMeta ? (meta!.accommodation!.pro_tip ?? "") : "",
        why_for_you: useMeta ? (meta!.accommodation!.why_for_you ?? "") : "",
        skip_if: useMeta ? (meta!.accommodation!.skip_if ?? null) : null,
        category: "accommodation",
        estimated_cost_per_person: useMeta ? (meta!.accommodation!.estimated_cost_per_person ?? 0) : 0,
        dietary_notes: useMeta ? (meta!.accommodation!.dietary_notes ?? null) : null,
      },
      fakeAccomSlot, place, photoUrlByPlaceId.get(place.id) ?? [],
      currency, intent.budget_tier, [], legBaselines, hotelEstimate,
    );
    if (!hydrated) return undefined;
    // Build alternatives from the same leg's lodging pool (excluding the
    // chosen hotel). Affiliate URLs are decorated by the non-streaming
    // caller's per-leg loop after rankInParallel returns — same path the
    // chosen hotel takes — so we leave booking_url placeholder values that
    // hydrateActivity sets and let the caller overwrite them uniformly.
    const altPlaces = pickAccommodationAlternativesForLeg(venuesByPool, legIdx, place.id);
    const alternatives: EnrichedActivity[] = [];
    for (const altPlace of altPlaces) {
      const altHydrated = hydrateActivity(
        {
          slot_index: -1, slot_type: "lodging",
          place_id: altPlace.id, is_event: false,
          title: altPlace.displayName ?? "Hotel",
          description: "",
          pro_tip: "",
          why_for_you: "",
          skip_if: null,
          category: "accommodation",
          estimated_cost_per_person: 0,
          dietary_notes: null,
        },
        fakeAccomSlot, altPlace, photoUrlByPlaceId.get(altPlace.id) ?? [],
        currency, intent.budget_tier, [], legBaselines,
      );
      if (altHydrated) alternatives.push(altHydrated);
    }
    return { hotel: hydrated, alternatives };
  };

  // ---- Trip-level rollups ----
  const total_activities = ranked_days.reduce((n, d) => n + d.activities.length, 0);
  const dailySpend = ranked_days.map((d) =>
    d.activities.reduce((s, a) => s + (a.estimated_cost_per_person || 0), 0),
  );
  const daily_budget_estimate = numDays > 0
    ? Math.round(dailySpend.reduce((s, n) => s + n, 0) / numDays)
    : 0;

  const finalTitle = stripEmojis(groundedCopy?.trip_title) || stripEmojis(meta?.trip_title) || intent.destination;
  const finalSummary = (groundedCopy?.trip_summary?.trim() || meta?.trip_summary?.trim()) ?? "";

  // ---- Assemble RankedDestination[] = unified leg list. Each leg gets the
  // days that belong to it, plus accommodation (real legs only). The order
  // matches legs[].
  const destinations: RankedDestination[] = legs.map((leg) => {
    const legDays = ranked_days
      .filter((d) => d.destination_index === leg.index)
      .sort((a, b) => a.day_number - b.day_number);
    const startDate = legDays[0]?.date ?? "";
    const endDate = legDays[legDays.length - 1]?.date ?? "";
    if (leg.kind === "transit") {
      return {
        name: leg.name,
        start_date: startDate,
        end_date: endDate,
        intro: leg.transit_meta?.description ?? "",
        days: legDays,
        kind: "transit",
        ...(leg.transit_meta ? { transit: leg.transit_meta } : {}),
      };
    }
    const accom = hydrateAccomForLeg(leg.index);
    return {
      name: leg.name,
      start_date: startDate,
      end_date: endDate,
      // For multi-leg, the trip summary belongs to the trip; we keep per-leg
      // intro empty to avoid duplicate copy. Single-leg keeps the legacy
      // "destination intro = trip_summary" behavior.
      intro: legs.length === 1 ? finalSummary : "",
      days: legDays,
      accommodation: accom?.hotel,
      accommodation_alternatives: accom?.alternatives ?? [],
      kind: "destination",
      price_baselines: baselinesByLeg.get(leg.index) ?? null,
    };
  });

  const tripTotalEstimateNonStream = computeTripTotalEstimate(destinations);
  const dailyLivingAdditiveEurNonStream = computeDailyLivingAdditiveEur(destinations);
  return {
    trip_title: finalTitle,
    trip_summary: finalSummary,
    destinations,
    map_center: computeMapCenter(geos),
    map_zoom: computeMapZoom(geos),
    daily_budget_estimate,
    trip_total_estimate: tripTotalEstimateNonStream,
    daily_living_additive_eur: dailyLivingAdditiveEurNonStream,
    currency,
    packing_suggestions: Array.isArray(meta?.packing_suggestions) ? meta!.packing_suggestions.slice(0, 10) : [],
    total_activities,
    budget_tier: intent.budget_tier,
    adjustment_notice: intent.adjustment_notice ?? null,
  };
}

// ---------------------------------------------------------------------------
// Step 8: post-ranking finishers (all pure code, no LLM)
// ---------------------------------------------------------------------------

// ---- markJuntoPicks ----
//
// Marks standout activities with is_junto_pick=true. Eligibility:
//   place_id present (events ineligible) AND rating present.
// No upper or lower review-count band — popular icons can qualify.
//
// Algorithm:
//   1. Per day, score each eligible activity:
//        signalMatches * 1000 + rating * 10 - log(max(reviews, 1)) * 5
//      The log penalty mildly favors less-mainstream venues without excluding
//      the high-review icons. Keep the day's top scorer (one pick per day max).
//   2. Across the trip, take the top ceil(numDays / 2) of those per-day winners
//      — a 5-day trip gets up to 3 picks, 7-day up to 4. Biased toward
//      fewer-but-higher-confidence picks.
//   3. Tie-break: higher signalMatches, then higher rating, then random.
// Days with zero eligible activities (events-only, hydration gaps) are skipped.
// Existing is_junto_pick flags are reset before scoring so cache-hit callers
// get a fresh pass against the current request's intent.

function countIntentSignalMatches(act: EnrichedActivity, intent: Intent): number {
  const haystack = [
    act.title,
    act.description,
    act.pro_tip,
    act.why_for_you,
    act.dietary_notes ?? "",
    act.category,
  ]
    .join(" ")
    .toLowerCase();

  let matches = 0;
  for (const v of intent.vibes) {
    if (v && haystack.includes(v.toLowerCase())) { matches++; if (matches >= 3) return matches; }
  }
  for (const mh of intent.must_haves) {
    if (mh && haystack.includes(mh.toLowerCase())) { matches++; if (matches >= 3) return matches; }
  }
  for (const d of intent.dietary) {
    if (d && haystack.includes(d.toLowerCase())) { matches++; if (matches >= 3) return matches; }
  }
  return matches;
}

function markJuntoPicks(result: PipelineResult, intent: Intent): void {
  interface Candidate {
    act: EnrichedActivity;
    score: number;
    signalMatches: number;
    rating: number;
  }

  const compare = (a: Candidate, b: Candidate): number => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.signalMatches !== a.signalMatches) return b.signalMatches - a.signalMatches;
    if (b.rating !== a.rating) return b.rating - a.rating;
    return Math.random() - 0.5;
  };

  // Reset existing flags so cache-hit callers don't carry over stale picks
  // from a prior intent.
  for (const dest of result.destinations) {
    for (const day of dest.days) {
      for (const act of day.activities) {
        act.is_junto_pick = false;
      }
    }
  }

  const perDayPicks: Candidate[] = [];
  let numDays = 0;
  for (const dest of result.destinations) {
    for (const day of dest.days) {
      numDays++;
      let best: Candidate | null = null;
      for (const act of day.activities) {
        if (!act.place_id) continue;
        if (act.rating == null) continue;
        const rating = act.rating;
        const reviews = act.user_rating_count ?? 0;
        const signalMatches = countIntentSignalMatches(act, intent);
        const score =
          signalMatches * 1000 +
          rating * 10 -
          Math.log(Math.max(reviews, 1)) * 5;
        const cand: Candidate = { act, score, signalMatches, rating };
        if (!best || compare(cand, best) < 0) best = cand;
      }
      if (best) perDayPicks.push(best);
    }
  }

  if (perDayPicks.length === 0) return;

  const tripCap = Math.max(1, Math.ceil(numDays / 2));
  perDayPicks.sort(compare);
  for (const c of perDayPicks.slice(0, tripCap)) {
    c.act.is_junto_pick = true;
  }
}

// ---- collectVenueAllowlist ----
//
// Extracts the canonical activity titles (and underlying Place displayNames
// when available via the title fallback in hydrateActivity) from the
// finalized day venues. Drives:
//   - rankTripCopy's allowlist input (prevents the model from inventing
//     venue names in trip_summary)
//   - logDescriptionGrounding's verification scan (catches confabulations
//     that slip past the prompt)
//
// Skips events (no place-backed venue) and any activity without a title.
function collectVenueAllowlist(days: RankedDay[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const day of days) {
    for (const act of day.activities) {
      if (!act.title) continue;
      const t = act.title.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

// ---- logVibeCoverage ----
//
// Observability-only post-generation check. For each user-selected vibe,
// count how many activities in the final itinerary plausibly match it (by
// keyword scan over title/category/description). Emits a structured
// console.log line per vibe and a console.warn when coverage is zero — the
// "silent vibe drop" failure mode this PR exists to fix.
//
// NOT a gate: the response is returned regardless of coverage. The warning
// is for log-aggregation alerts so we can iterate when a vibe stops landing
// in production.
function logVibeCoverage(result: PipelineResult, intent: Intent): void {
  if (intent.vibes.length === 0) return;

  const haystacks: string[] = [];
  for (const dest of result.destinations) {
    for (const day of dest.days) {
      for (const act of day.activities) {
        const parts = [act.title, act.category, act.description, act.why_for_you]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (parts) haystacks.push(parts);
      }
    }
  }

  for (const vibe of intent.vibes) {
    const spec = VIBE_PLACES_MAP.find((s) => s.matches.test(vibe));
    if (!spec) {
      // Vibe doesn't match any known retrieval spec — can't validate, but
      // worth surfacing so we know to extend the map.
      console.warn(`[vibe_coverage] vibe="${vibe}" unmapped — no retrieval spec; skipping coverage check`);
      continue;
    }
    let matches = 0;
    for (const hs of haystacks) {
      if (spec.matches.test(hs)) matches++;
    }
    const line = `[vibe_coverage] vibe="${vibe}" matches=${matches} total_activities=${haystacks.length}`;
    if (matches === 0) {
      console.warn(`${line} — SILENT DROP: user selected this vibe but the itinerary contains no matching activities`);
    } else {
      console.log(line);
    }
  }
}

// ---- logDescriptionGrounding ----
//
// Scans the trip title + summary for proper-noun-shaped phrases (Title Case
// runs and ALL CAPS runs of 2+ words) and verifies each appears in the
// itinerary's actual venue allowlist. Confabulations — venue names the LLM
// invented that don't exist in the trip — produce a structured console.warn.
//
// Observability only — never gates the response. Mirrors logVibeCoverage's
// pattern. Catches anything the rankTripCopy allowlist prompt failed to
// prevent (model is not perfect; the validator is the safety net).
//
// Heuristic note: this is a best-effort proper-noun extractor, not a NER
// model. False positives include common Title Case words (e.g. "Old Town")
// that aren't venues. To suppress noise we exclude:
//   - Single-word matches (most legitimate venue names are 2+ words)
//   - The destination name itself ("Stuttgart", "Tokyo")
//   - A small allowlist of geographic/generic terms
function logDescriptionGrounding(result: PipelineResult, intent: Intent): void {
  // Join with " . " so the segment splitter below treats the title and
  // summary as separate inputs — otherwise "Cocktail and Club Scene" (title
  // tail) and "Four days immersed" (summary head) chain into a fake
  // "Club Scene Four" venue match.
  const titleAndSummary = `${result.trip_title ?? ""} . ${result.trip_summary ?? ""}`.trim();
  if (!titleAndSummary) return;

  // Build allowlist (lowercased, normalized) from actual itinerary.
  const allow = new Set<string>();
  for (const dest of result.destinations) {
    for (const day of dest.days) {
      for (const act of day.activities) {
        if (act.title) allow.add(act.title.trim().toLowerCase());
      }
    }
    if (dest.accommodation?.title) allow.add(dest.accommodation.title.trim().toLowerCase());
  }
  // Also allowlist destination tokens so "Lisbon" / "Stuttgart" don't flag.
  for (const tok of (intent.destination ?? "").split(/[,\s]+/)) {
    if (tok) allow.add(tok.trim().toLowerCase());
  }

  // Generic Title Case phrases that aren't venues. Keep this list small —
  // anything legitimately venue-shaped should remain flaggable.
  const genericPhrases = new Set([
    "old town", "new town", "city center", "city centre", "old quarter",
    "north side", "south side", "east side", "west side",
    "michelin star", "michelin starred", "happy hour", "live music",
  ]);
  // Title-fragment tails. Phrases ending with one of these are almost
  // certainly editorial titles ("Club Scene", "Souk Days"), not venue names.
  // Real venues end with brand words (Bar, Hotel, Studios, Club, etc.) —
  // these tails are descriptive nouns the LLM uses to frame a trip.
  const titleFragmentTails = new Set([
    "scene", "days", "nights", "evenings", "mornings", "trip", "tour",
    "crawl", "vibes", "adventure", "adventures", "time", "weekend",
    "getaway", "escape", "experience", "experiences", "journey",
  ]);

  // Match Title Case runs (e.g. "Schwarz Weiß Bar", "Jigger & Spoon") OR
  // ALL CAPS runs of 2+ words (e.g. "WONDERS CLUB", "COMODO STUDIOS"). Both
  // are common venue-name shapes. We deliberately allow the ampersand and
  // diacritics inside a run so multi-word venue names stay intact.
  // Note: Unicode property classes (\p{Lu}/\p{L}) require the /u flag.
  //
  // We split on sentence/clause boundaries (.,;:!?) BEFORE running the regex
  // so a Title Case word ending one sentence can't chain into the Title Case
  // word starting the next ("Cocktail and Club Scene. Four days immersed" must
  // not produce "Club Scene Four" as a match).
  const proper = /(?:[\p{Lu}][\p{L}'’.&-]*\s+){1,5}[\p{Lu}][\p{L}'’.&-]*|(?:[A-Z]{2,}\s+){1,4}[A-Z]{2,}/gu;
  const segments = titleAndSummary.split(/[.,;:!?\n]+/);
  const matches: string[] = [];
  for (const seg of segments) {
    const found = seg.match(proper);
    if (found) matches.push(...found);
  }

  const flagged: string[] = [];
  for (const raw of matches) {
    const phrase = raw.trim();
    const lower = phrase.toLowerCase();
    if (genericPhrases.has(lower)) continue;
    const tail = lower.split(/\s+/).pop() ?? "";
    if (titleFragmentTails.has(tail)) continue;
    // Substring check both ways: allow "Schwarz Weiß Bar" to match
    // "Schwarz Weiß Bar Stuttgart" in the allowlist (and vice versa).
    let ok = false;
    for (const allowed of allow) {
      if (allowed.includes(lower) || lower.includes(allowed)) { ok = true; break; }
    }
    if (!ok) flagged.push(phrase);
  }

  if (flagged.length > 0) {
    console.warn(
      `[description_grounding] CONFABULATION: trip_title/trip_summary names ${flagged.length} ` +
      `proper-noun phrase(s) NOT in the itinerary allowlist: ${JSON.stringify(flagged)}. ` +
      `title="${result.trip_title}" summary="${result.trip_summary}"`,
    );
  } else {
    console.log(
      `[description_grounding] ok proper_nouns_checked=${matches.length} allowlist_size=${allow.size}`,
    );
  }
}

// ---- logOpeningHoursViolations ----
//
// Post-pipeline observability for opening-hours mismatches. The hard guard
// runs at hydrate time (drops Places-confirmed closures) but cannot drop
// when Places didn't return hours OR when the cached payload is older than
// the field-mask change. This validator catches the leftover cases via
// category-typical hours and surfaces them as console.warn.
//
// Never gates the response. Mirrors logVibeCoverage's pattern.
function logOpeningHoursViolations(result: PipelineResult): void {
  let checked = 0;
  let violations = 0;
  for (const dest of result.destinations) {
    for (const day of dest.days) {
      for (const act of day.activities) {
        if (!act.place_id) continue; // events / downtime — no venue to validate
        if (!act.start_time) continue;
        if (!act.place_types || act.place_types.length === 0) continue;
        const fallback = categoryFallbackHoursForTypes(act.place_types);
        if (!fallback) continue;
        checked++;
        const minutes = hhmmToMinutes(act.start_time);
        if (minutes < 0) continue;
        const [open, close] = fallback;
        const inOpenSpan =
          minutes >= open && (close > 1440 ? true : minutes < close);
        const inWrapTail = close > 1440 && minutes < (close - 1440);
        if (!(inOpenSpan || inWrapTail)) {
          violations++;
          console.warn(
            `[opening_hours] CATEGORY-FALLBACK VIOLATION: "${act.title}" ` +
            `at ${day.date} ${act.start_time} — types=${JSON.stringify(act.place_types.slice(0, 4))} ` +
            `expected ${Math.floor(open/60)}:${String(open%60).padStart(2,"0")}` +
            `-${Math.floor((close % 1440)/60)}:${String((close%1440)%60).padStart(2,"0")}` +
            `${close > 1440 ? " (cross-midnight)" : ""}`,
          );
        }
      }
    }
  }
  if (violations === 0) {
    console.log(`[opening_hours] ok checked=${checked}`);
  } else {
    console.warn(`[opening_hours] ${violations}/${checked} activities flagged via category fallback`);
  }
}

// ---- logPricingAnomalies ----
//
// Post-pipeline observability for pricing outliers. The clamp inside
// hydrateActivity raises below-floor and lowers above-ceiling values, but
// venues with no priceLevel + no category band match (e.g. a niche
// "experience" Place type we haven't enumerated) flow through untouched.
// This validator catches:
//   - Suspiciously low costs (< 5 EUR equivalent) on non-trivial slot types,
//     suggesting the LLM lowballed or returned 0 for a paid experience.
//   - Suspiciously high costs (> 200 EUR equivalent) on slots that shouldn't
//     be that expensive (lunch, casual bar, museum).
// Both cases get a structured console.warn. Never gates the response.
function logPricingAnomalies(result: PipelineResult): void {
  const fxToEur = 1 / eurToLocalMultiplier(result.currency || "USD");
  const SUSPICIOUS_LOW_EUR = 5;
  const SUSPICIOUS_HIGH_EUR = 200;
  // Slot types where 0 cost is legitimate (rest, transit, free-park
  // afternoon). Missing from this set → cost should be > floor.
  const ZERO_OK_CATEGORIES = new Set(["accommodation", "rest", "transit", "downtime"]);

  let checked = 0, lowFlags = 0, highFlags = 0;
  for (const dest of result.destinations) {
    for (const day of dest.days) {
      for (const act of day.activities) {
        if (!act.place_id) continue; // events priced separately
        checked++;
        const eurCost = (act.estimated_cost_per_person ?? 0) * fxToEur;
        const cat = (act.category || "").toLowerCase();
        if (eurCost < SUSPICIOUS_LOW_EUR && !ZERO_OK_CATEGORIES.has(cat)) {
          lowFlags++;
          console.warn(
            `[pricing] SUSPICIOUS-LOW: "${act.title}" priced at ${act.estimated_cost_per_person} ${result.currency} ` +
            `(~${eurCost.toFixed(1)} EUR) — slot=${act.start_time} category=${act.category} ` +
            `types=${JSON.stringify((act.place_types ?? []).slice(0, 3))}`,
          );
        } else if (eurCost > SUSPICIOUS_HIGH_EUR) {
          highFlags++;
          console.warn(
            `[pricing] SUSPICIOUS-HIGH: "${act.title}" priced at ${act.estimated_cost_per_person} ${result.currency} ` +
            `(~${eurCost.toFixed(1)} EUR) — slot=${act.start_time} category=${act.category} ` +
            `types=${JSON.stringify((act.place_types ?? []).slice(0, 3))}`,
          );
        }
      }
    }
  }
  if (lowFlags === 0 && highFlags === 0) {
    console.log(`[pricing] ok checked=${checked} currency=${result.currency}`);
  } else {
    console.warn(
      `[pricing] ${lowFlags + highFlags}/${checked} flagged ` +
      `(low=${lowFlags} high=${highFlags}) currency=${result.currency}`,
    );
  }
}

// ---- buildAffiliateUrl ----
//
// Maps a venue to one of the four affiliate partners (or google_maps fallback,
// or event_direct for events). Partner is decided by place.types:
//   LODGING_TYPES       → Booking.com (aid)
//   TOURS_TYPES         → Viator (mcid)
//   travel_agency/class → GetYourGuide (partner_id)
//   FOOD_TYPES (or any other food) → google_maps fallback
//   null place (event)  → event_direct with optional event URL
// Every activity gets a URL — never null for non-event slots.

const GYG_SIGNAL_TYPES = new Set([
  "travel_agency", "tour_agency", "cooking_class", "workshop",
  "language_school", "school", "sports_club",
]);

function urlencode(s: string): string {
  return encodeURIComponent(s);
}

function partnerForPlace(place: BatchPlaceResult): AffiliatePartner {
  const types = place.types ?? [];
  for (const t of types) if (LODGING_TYPES.has(t)) return "booking";
  for (const t of types) if (GYG_SIGNAL_TYPES.has(t)) return "getyourguide";
  for (const t of types) if (TOURS_TYPES.has(t)) return "viator";
  for (const t of types) if (FOOD_TYPES.has(t)) return "google_maps";
  // Unknown type — if there's a Google Maps URI, keep it; otherwise fall back
  // to viator (tour-ish) since that's the most common catch-all.
  return place.googleMapsUri ? "google_maps" : "viator";
}

interface AffiliateEnv {
  viator: string;
  gyg: string;
  awinPublisherId: string;
  awinMerchantId: string;
  tripId: string | null;
  checkin: string | null;
  checkout: string | null;
  /** Trip destination city — used to build clean Booking.com `ss=` queries
   *  (hotel name + city) without picking up street/postal noise from
   *  formatted_address. */
  cityHint: string | null;
}

// Build a clean Booking.com `ss=` search string: "{hotel} {city}", but skip
// the city if the hotel name already contains it (case-insensitive substring).
// Falls back to just the hotel name when city is missing.
function buildBookingSearchString(hotelName: string, cityHint: string | null): string {
  const name = (hotelName ?? "").trim().replace(/\s+/g, " ");
  const city = (cityHint ?? "").trim().replace(/\s+/g, " ");
  if (!name) return city;
  if (!city) return name;
  if (name.toLowerCase().includes(city.toLowerCase())) return name;
  return `${name} ${city}`;
}

function buildAffiliateUrl(
  place: BatchPlaceResult | null,
  env: AffiliateEnv,
  eventUrl?: string | null,
): { booking_url: string; booking_partner: AffiliatePartner } {
  // Event case — no Places data.
  if (!place) {
    return {
      booking_url: eventUrl?.trim() ? eventUrl.trim() : "",
      booking_partner: "event_direct",
    };
  }

  const partner = partnerForPlace(place);
  const name = place.displayName ?? "";
  const city = (place.formattedAddress ?? "").split(",").slice(-2, -1)[0]?.trim() ?? "";
  const nameWithCity = city ? `${name} ${city}` : name;

  switch (partner) {
    case "booking": {
      // Booking's lenient resolver chokes on street numbers/postcodes from
      // formatted_address. Build "{hotel} {city}" using the trip's destination
      // (cityHint) instead — see buildBookingSearchString.
      const searchQuery = buildBookingSearchString(name, env.cityHint);
      const dest = buildBookingDestinationUrl(searchQuery);
      return {
        booking_url: wrapAwinBookingUrl(dest, env.tripId, {
          publisherId: env.awinPublisherId,
          merchantId: env.awinMerchantId,
        }),
        booking_partner: "booking",
      };
    }
    case "viator":
      return {
        booking_url: VIATOR_TEMPLATE
          .replace("{name}", urlencode(nameWithCity))
          .replace("{mcid}", urlencode(env.viator)),
        booking_partner: "viator",
      };
    case "getyourguide":
      return {
        booking_url: GETYOURGUIDE_TEMPLATE
          .replace("{name}", urlencode(nameWithCity))
          .replace("{pid}", urlencode(env.gyg)),
        booking_partner: "getyourguide",
      };
    case "google_maps":
    default:
      return {
        booking_url: place.googleMapsUri ?? "",
        booking_partner: "google_maps",
      };
  }
}

// ---- validateActivities ----
//
// Last-chance sanity filter. Drops any activity where:
//   - place_id is missing AND is_event is false
//   - coords are more than 200 km from the trip centroid (wrong-city check)
//   - businessStatus is present and !== "OPERATIONAL"
// If we drop more than 20 % of total activities, something is wrong upstream
// and we fail loud — a user-visible error beats shipping a broken trip.

const VALIDATION_MAX_KM_FROM_CENTER = 200;
const VALIDATION_DROP_THRESHOLD = 0.20;
// Continental cap: anything over this is unworkable as a single leg (e.g.
// "USA", "Europe") — the LLM will scatter activities across thousands of km
// regardless. Better to keep filtering on for those rather than disable.
const VALIDATION_MAX_KM_CEILING = 3000;

// Country/region inputs (e.g. "peru", "italy", "japan") geocode to the
// country centroid, which can sit hundreds of km from any individual tourist
// destination. The 200 km city-scope radius then drops the entire activity
// pool. Derive an effective radius from the geocode viewport: a city's
// viewport is tens of km (floor wins), a country's spans the country
// (floor is overridden). Half the diagonal ≈ centroid-to-corner distance;
// 1.25× buffer covers off-center centroids and viewports that don't fully
// enclose the destination's tourist cluster.
function validationRadiusKm(geo: GeocodeResult | null): number {
  const vp = geo?.viewport;
  if (!vp) return VALIDATION_MAX_KM_FROM_CENTER;
  const diagonalKm = haversineKm(
    vp.northeast.lat, vp.northeast.lng,
    vp.southwest.lat, vp.southwest.lng,
  );
  const radius = (diagonalKm / 2) * 1.25;
  if (!Number.isFinite(radius) || radius <= 0) return VALIDATION_MAX_KM_FROM_CENTER;
  return Math.max(
    VALIDATION_MAX_KM_FROM_CENTER,
    Math.min(VALIDATION_MAX_KM_CEILING, radius),
  );
}

// Per-day validator used by the streaming pipeline so days can be emitted to
// the client as they arrive without waiting for all days. Mirrors the
// per-activity rules from validateActivities but skips the trip-wide drop
// threshold check (that runs once at end after all days are in).
function validateDayActivitiesInline(
  activities: EnrichedActivity[],
  allPlaces: Map<string, BatchPlaceResult>,
  center: { lat: number; lng: number },
  maxKmFromCenter: number = VALIDATION_MAX_KM_FROM_CENTER,
): { kept: EnrichedActivity[]; dropped: number } {
  const kept: EnrichedActivity[] = [];
  let dropped = 0;
  for (const act of activities) {
    const isEvent = !act.place_id;
    if (!isEvent && !allPlaces.has(act.place_id)) {
      console.warn(`[stream.validate] drop "${act.title}" — place_id not in pool`);
      dropped++;
      continue;
    }
    const place = act.place_id ? allPlaces.get(act.place_id) ?? null : null;
    if (place?.location) {
      const d = haversineKm(
        center.lat, center.lng,
        place.location.latitude, place.location.longitude,
      );
      if (d > maxKmFromCenter) {
        console.warn(`[stream.validate] drop "${act.title}" — ${d.toFixed(0)} km from center (limit ${maxKmFromCenter.toFixed(0)})`);
        dropped++;
        continue;
      }
    }
    if (place?.businessStatus && place.businessStatus !== "OPERATIONAL") {
      console.warn(`[stream.validate] drop "${act.title}" — businessStatus=${place.businessStatus}`);
      dropped++;
      continue;
    }
    kept.push(act);
  }
  return { kept, dropped };
}

function validateActivities(
  result: PipelineResult,
  allPlaces: Map<string, BatchPlaceResult>,
  center: { lat: number; lng: number; radiusKm: number },
  legCenters?: Map<number, { lat: number; lng: number; radiusKm: number }>,
): PipelineResult {
  let totalBefore = 0;
  let dropped = 0;

  for (let destIdx = 0; destIdx < result.destinations.length; destIdx++) {
    const dest = result.destinations[destIdx];
    // Per-leg center. For real-destination legs, use that leg's geo; for
    // transit legs, use the trip center (transit days have a dinner pulled
    // from one of the adjacent destinations — it could legitimately sit
    // anywhere in the transit corridor). Single-destination trips fall back
    // to the trip center.
    const legCenter = legCenters?.get(destIdx) ?? center;
    for (const day of dest.days) {
      totalBefore += day.activities.length;
      const kept: EnrichedActivity[] = [];
      for (const act of day.activities) {
        // Reason 1: missing place_id on a non-event slot.
        const isEvent = !act.place_id; // events come out of hydration with place_id=""
        if (!isEvent && !allPlaces.has(act.place_id)) {
          console.warn(`[validateActivities] drop "${act.title}" — place_id not in pool`);
          dropped++;
          continue;
        }
        const place = act.place_id ? allPlaces.get(act.place_id) ?? null : null;

        // Reason 2: off-continent coords (per leg, not trip-wide).
        if (place?.location) {
          const d = haversineKm(
            legCenter.lat, legCenter.lng,
            place.location.latitude, place.location.longitude,
          );
          if (d > legCenter.radiusKm) {
            console.warn(
              `[validateActivities] drop "${act.title}" — ${d.toFixed(0)} km from leg center (limit ${legCenter.radiusKm.toFixed(0)})`,
            );
            dropped++;
            continue;
          }
        }

        // Reason 3: venue permanently/temporarily closed.
        if (place?.businessStatus && place.businessStatus !== "OPERATIONAL") {
          console.warn(
            `[validateActivities] drop "${act.title}" — businessStatus=${place.businessStatus}`,
          );
          dropped++;
          continue;
        }

        kept.push(act);
      }
      day.activities = kept;
    }
    // Check accommodation separately; if invalid, drop it but don't count
    // against the activity-drop threshold (accommodation is trip-level).
    const accom = dest.accommodation;
    if (accom?.place_id) {
      const place = allPlaces.get(accom.place_id);
      if (!place) {
        console.warn(`[validateActivities] drop accommodation "${accom.title}" — place_id not in pool`);
        dest.accommodation = undefined;
      } else if (place.businessStatus && place.businessStatus !== "OPERATIONAL") {
        console.warn(
          `[validateActivities] drop accommodation "${accom.title}" — businessStatus=${place.businessStatus}`,
        );
        dest.accommodation = undefined;
      }
    }
  }

  // Fail loud on a fully empty trip too — `totalBefore === 0` used to skip
  // this check, which let zero-activity outputs ship as "success" and be
  // cached for 7 days. Better to surface an error and re-run than to poison
  // the response cache with an empty itinerary.
  if (totalBefore === 0) {
    throw new Error(
      "validateActivities: 0 activities returned across the whole trip — refusing to ship empty result",
    );
  }
  if (dropped / totalBefore > VALIDATION_DROP_THRESHOLD) {
    throw new Error(
      `validateActivities: dropped ${dropped}/${totalBefore} (${Math.round(100 * dropped / totalBefore)}%) activities — upstream pipeline is producing garbage`,
    );
  }

  // Recompute total_activities after validation.
  result.total_activities = result.destinations.reduce(
    (n, d) => n + d.days.reduce((m, day) => m + day.activities.length, 0),
    0,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Logging — fail loud on any DB write error
// ---------------------------------------------------------------------------

interface LLMLoggerTotals {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  call_count: number;
}

interface LLMLogger {
  log: (entry: {
    feature: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    cached: boolean;
  }) => Promise<void>;
  totals: () => LLMLoggerTotals;
}

function makeLLMLogger(
  svcClient: ReturnType<typeof createClient>,
  userId: string | null,
): LLMLogger {
  const totals: LLMLoggerTotals = {
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    call_count: 0,
  };
  return {
    async log(entry) {
      totals.input_tokens += entry.input_tokens;
      totals.output_tokens += entry.output_tokens;
      totals.cost_usd += entry.cost_usd;
      totals.call_count += 1;
      const { error } = await svcClient.from("ai_request_log").insert({
        user_id: userId,
        feature: entry.feature,
        model: entry.model,
        input_tokens: entry.input_tokens,
        output_tokens: entry.output_tokens,
        cost_usd: entry.cost_usd,
        cached: entry.cached,
      });
      if (error) {
        // Fail loud — historically these errors were swallowed and we lost all telemetry.
        console.error("[ai_request_log] insert failed:", error);
        throw new Error(`ai_request_log insert failed: ${error.message}`);
      }
    },
    totals: () => ({ ...totals }),
  };
}

function computeHaikuCost(usage: ClaudeUsage): number {
  return (
    usage.input_tokens * HAIKU_PRICING.input +
    usage.output_tokens * HAIKU_PRICING.output +
    usage.cache_creation_input_tokens * HAIKU_PRICING.cache_write +
    usage.cache_read_input_tokens * HAIKU_PRICING.cache_read
  );
}

// Tier-aware Places cost accounting. Each row in ai_request_log becomes
// feature='places_{sku}_trip_builder' so the daily-spend circuit breaker
// (sum_places_spend_last_day SQL helper) can aggregate across skus.
//
// The logger argument is retained for totals accounting — the logger's
// totals.cost_usd must include Places spend so trip_builder_total reflects
// the true per-generation cost.
async function logPlacesByTier(
  svcClient: ReturnType<typeof createClient>,
  logger: LLMLogger,
  userId: string | null,
  counts: {
    search_essentials_live: number;
    search_essentials_cache: number;
    details_live: number;
    details_cache: number;
  },
): Promise<void> {
  const entries: Array<Promise<unknown>> = [];

  if (counts.search_essentials_live > 0) {
    entries.push(logPlacesCall(svcClient, {
      userId, feature: "trip_builder", sku: "search_essentials",
      count: counts.search_essentials_live,
    }));
    await logger.log({
      feature: "places_search_essentials_trip_builder",
      model: "google-places-search-essentials",
      input_tokens: 0,
      output_tokens: counts.search_essentials_live,
      cost_usd: counts.search_essentials_live * PLACES_RANKING_COST_PER_CALL,
      cached: false,
    });
  }
  if (counts.search_essentials_cache > 0) {
    entries.push(logPlacesCall(svcClient, {
      userId, feature: "trip_builder", sku: "search_essentials",
      count: counts.search_essentials_cache, cached: true,
    }));
  }
  if (counts.details_live > 0) {
    entries.push(logPlacesCall(svcClient, {
      userId, feature: "trip_builder", sku: "details",
      count: counts.details_live,
    }));
    await logger.log({
      feature: "places_details_trip_builder",
      model: "google-places-details",
      input_tokens: 0,
      output_tokens: counts.details_live,
      cost_usd: counts.details_live * PLACES_DETAILS_COST_PER_CALL,
      cached: false,
    });
  }
  if (counts.details_cache > 0) {
    entries.push(logPlacesCall(svcClient, {
      userId, feature: "trip_builder", sku: "details",
      count: counts.details_cache, cached: true,
    }));
  }

  await Promise.all(entries);
}

// ---------------------------------------------------------------------------
// Cache key — sha256 of normalized intent shape
// ---------------------------------------------------------------------------

// Bucket a YYYY-MM-DD date into "YYYY-MM" so the cache partitions by month
// (captures seasonality — June ≠ December) without exploding cache cardinality
// to one entry per literal start day. "flex" is the bucket for empty / invalid
// inputs so flex-date trips share an entry across the year.
function extractMonthBucket(isoDate: string): string {
  if (!isoDate || isoDate.length < 7) return "flex";
  return isoDate.slice(0, 7);
}

async function buildIntentCacheKey(
  intent: Intent,
  numDays: number,
  startDate: string,
): Promise<string> {
  const shape = {
    destination: intent.destination.toLowerCase().trim(),
    days: numDays,
    start_month: extractMonthBucket(startDate),
    budget: intent.budget_tier,
    pace: intent.pace,
    vibes: [...intent.vibes].sort(),
    must_haves: [...intent.must_haves].sort(),
    must_avoids: [...intent.must_avoids].sort(),
    dietary: [...intent.dietary].sort(),
    group: intent.group_composition,
  };
  const enc = new TextEncoder().encode(JSON.stringify(shape));
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Cache key derived from the RAW request body, not the parsed Intent. Claude
// Haiku runs at default temperature on parseIntent — its outputs (vibes,
// must_haves, must_avoids, group_composition…) drift between calls for the
// same form input, so an Intent-derived key essentially never matches across
// runs. The raw form fields are what the user actually controls; hashing them
// gives a deterministic key. `destinationOverride` lets surprise-mode callers
// thread the LLM-picked destination in (raw body has empty destination then),
// keeping cache behaviour for surprise trips.
function normalizeFreeText(...inputs: Array<string | null | undefined>): string {
  return inputs
    .map((s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" ");
}

function normalizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return [...arr]
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

// Bump to force every existing ai_response_cache entry to miss and regenerate.
// v3 introduces multi-destination payload shape (destinations[] is now a
// unified leg list including transit pseudo-legs; days carry destination_index;
// trip-level adjustment_notice). Pre-v3 entries assume single-destination
// shape and would mis-validate against the new cache reads (which sum days
// across all legs). v3 evicts them.
const CACHE_KEY_VERSION = "v3";

interface RawCacheKeyShape {
  version: string;
  destination: string;
  num_days: number;
  start_month: string;
  budget_tier: string | null;
  pace: string | null;
  group_size: number | null;
  group_type: string | null;
  free_text: string;
  vibes: string[];
  must_haves: string[];
  dietary: string[];
}

function buildRawCacheKeyShape(
  body: TripBuilderRequest,
  numDays: number,
  startDate: string,
  destinationOverride?: string,
): RawCacheKeyShape {
  const dest = (destinationOverride ?? body.destination ?? "").toLowerCase().trim();
  return {
    version: CACHE_KEY_VERSION,
    destination: dest,
    num_days: numDays,
    start_month: extractMonthBucket(startDate),
    budget_tier: body.budget_level ?? null,
    pace: body.pace ?? null,
    group_size: typeof body.group_size === "number" ? body.group_size : null,
    group_type: (body as { group_type?: unknown }).group_type
      ? String((body as { group_type?: unknown }).group_type).trim().toLowerCase() || null
      : null,
    free_text: normalizeFreeText(body.notes, body.free_text),
    vibes: normalizeStringArray(body.vibes),
    must_haves: normalizeStringArray(body.interests),
    dietary: normalizeStringArray(body.dietary),
  };
}

async function buildRawCacheKey(
  body: TripBuilderRequest,
  numDays: number,
  startDate: string,
  destinationOverride?: string,
): Promise<{ key: string; shape: RawCacheKeyShape }> {
  const shape = buildRawCacheKeyShape(body, numDays, startDate, destinationOverride);
  const enc = new TextEncoder().encode(JSON.stringify(shape));
  const hash = await crypto.subtle.digest("SHA-256", enc);
  const key = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { key, shape };
}

// Rewrites the dates inside a cached itinerary payload in place so an entry
// keyed by month bucket can serve a request landing on a different start day
// within the same month. Day N gets newStartDate + (N-1) days; the destination
// start_date / end_date are pinned to the rewritten first / last day. Returns
// how many days were touched for logging.
function rewriteCachedPayloadDates(
  payload: Record<string, unknown>,
  newStartDate: string,
): { days_rewritten: number } {
  const dests = (payload as { destinations?: Array<Record<string, unknown>> })?.destinations;
  if (!Array.isArray(dests) || dests.length === 0) {
    return { days_rewritten: 0 };
  }
  let daysRewritten = 0;
  // Walk every leg's days. day_number is global across the trip, so the
  // newStartDate-based recompute remains correct across multi-leg payloads.
  for (const dest of dests) {
    const days = Array.isArray((dest as { days?: unknown }).days)
      ? (dest as { days: Array<Record<string, unknown>> }).days
      : null;
    if (!days) continue;
    for (const day of days) {
      const dayNum = typeof day.day_number === "number" ? day.day_number : daysRewritten + 1;
      day.date = addDaysIso(newStartDate, dayNum - 1);
      daysRewritten++;
    }
    if (days.length > 0) {
      (dest as Record<string, unknown>).start_date = days[0].date;
      (dest as Record<string, unknown>).end_date = days[days.length - 1].date;
    }
  }
  return { days_rewritten: daysRewritten };
}

// Re-build Booking.com URLs on cached payloads so each cache hit gets:
//   - the lenient /search.html path (older entries from PR #248 used the
//     strict /searchresults.html path which often fails to resolve)
//   - an Awin wrapper with this trip's clickref (so click → trip correlation
//     works for replayed cached trips, not just freshly generated ones)
//   - no checkin/checkout on the inner URL (strict dates break the resolver)
// We extract the original `ss` query from the cached URL — for both legacy
// raw Booking links and Awin-wrapped links (via the `ued` param) — and rebuild
// from scratch. Activities with booking_partner !== "booking" are left alone.
function rewriteCachedBookingUrls(
  payload: Record<string, unknown>,
  env: AffiliateEnv,
): { rewritten: number } {
  const dests = (payload as { destinations?: Array<Record<string, unknown>> })?.destinations;
  if (!Array.isArray(dests) || dests.length === 0) return { rewritten: 0 };
  let rewritten = 0;

  const rebuild = (existingUrl: string, activityTitle: string | null, cityHint: string | null): string => {
    let bookingUrl = existingUrl;
    try {
      const parsed = new URL(existingUrl);
      if (parsed.hostname.includes("awin1.com")) {
        const ued = parsed.searchParams.get("ued");
        if (ued) bookingUrl = decodeURIComponent(ued);
      }
    } catch {
      // fall through with original string
    }
    let existingSs = "";
    try {
      const inner = new URL(bookingUrl);
      existingSs = inner.searchParams.get("ss") ?? "";
    } catch {
      return existingUrl;
    }
    const hotelName = (activityTitle ?? "").trim() || existingSs;
    if (!hotelName) return existingUrl;
    const searchQuery = buildBookingSearchString(hotelName, cityHint);
    if (!searchQuery) return existingUrl;
    const fresh = buildBookingDestinationUrl(searchQuery);
    return wrapAwinBookingUrl(fresh, env.tripId, {
      publisherId: env.awinPublisherId,
      merchantId: env.awinMerchantId,
    });
  };

  // Walk every leg with its OWN cityHint (the leg's name). Multi-destination
  // payloads route each leg's hotel link through that leg's city, not the
  // trip-level intent.destination.
  for (const dest of dests) {
    const destName = typeof (dest as { name?: unknown }).name === "string"
      ? (dest as { name: string }).name
      : "";
    const cityHint = destName || env.cityHint || null;
    const visit = (activity: Record<string, unknown> | null | undefined) => {
      if (!activity) return;
      if (activity.booking_partner !== "booking") return;
      const current = typeof activity.booking_url === "string" ? activity.booking_url : "";
      if (!current) return;
      const title = typeof activity.title === "string" ? activity.title : null;
      const next = rebuild(current, title, cityHint);
      if (next !== current) {
        activity.booking_url = next;
        rewritten++;
      }
    };
    visit((dest as { accommodation?: unknown }).accommodation as Record<string, unknown> | undefined);
    const days = Array.isArray((dest as { days?: unknown }).days)
      ? (dest as { days: Array<Record<string, unknown>> }).days
      : [];
    for (const day of days) {
      const acts = Array.isArray((day as { activities?: unknown }).activities)
        ? (day as { activities: Array<Record<string, unknown>> }).activities
        : [];
      for (const a of acts) visit(a);
    }
  }
  return { rewritten };
}

// Refresh event_url on cached activities so we don't serve a stale ticket URL
// (e.g. a December festival page) when the request is for June. Walks cached
// days for activities that previously had event_url set, re-runs searchEvents
// with the current request's dates (events:v1 cache layer keys by start/end so
// this hits its own cache when warm), and rebinds URLs via matchEventCandidate.
// Activities that no longer match a fresh event get event_url cleared rather
// than retain the stale URL. If the events fetch throws, we clear all stale
// URLs and surface the failure via [stream.cache] events_refresh_failed; the
// rest of the cache hit still serves.
async function refreshCachedEvents(
  payload: Record<string, unknown>,
  intent: Intent,
  startDate: string,
  endDate: string,
  svcClient: ReturnType<typeof createClient>,
  logger: LLMLogger,
): Promise<{ refreshed: number; cleared: number }> {
  const dests = (payload as { destinations?: Array<Record<string, unknown>> })?.destinations;
  if (!Array.isArray(dests) || dests.length === 0) {
    return { refreshed: 0, cleared: 0 };
  }

  // Group event-bearing activities by their destination index. Multi-leg
  // payloads need per-leg event refresh — Bangkok event_url stays bound to
  // Bangkok's events search, Koh Phangan's to Koh Phangan's.
  const byDestIdx = new Map<number, { destName: string; activities: Array<Record<string, unknown>> }>();
  for (let i = 0; i < dests.length; i++) {
    const dest = dests[i];
    const destName = typeof (dest as { name?: unknown }).name === "string"
      ? (dest as { name: string }).name
      : intent.destination;
    const days = Array.isArray((dest as { days?: unknown }).days)
      ? (dest as { days: Array<Record<string, unknown>> }).days
      : [];
    const eventActivities: Array<Record<string, unknown>> = [];
    for (const day of days) {
      const acts = (day as { activities?: unknown }).activities;
      if (!Array.isArray(acts)) continue;
      for (const a of acts as Array<Record<string, unknown>>) {
        if (a && a.event_url) eventActivities.push(a);
      }
    }
    if (eventActivities.length > 0) {
      byDestIdx.set(i, { destName, activities: eventActivities });
    }
  }
  if (byDestIdx.size === 0) {
    return { refreshed: 0, cleared: 0 };
  }

  let totalRefreshed = 0;
  let totalCleared = 0;
  for (const { destName, activities } of byDestIdx.values()) {
    let freshEvents: EventCandidate[] = [];
    try {
      freshEvents = await searchEvents(
        destName,
        startDate,
        endDate,
        intent,
        [],
        svcClient,
        logger,
        true,
      );
    } catch (err) {
      console.warn(
        `[stream.cache] events_refresh_failed dest="${destName}" start=${startDate} end=${endDate} err=${(err as Error).message}`,
      );
      for (const a of activities) {
        a.event_url = null;
        totalCleared++;
      }
      continue;
    }
    for (const a of activities) {
      const match = matchEventCandidate(
        typeof a.title === "string" ? a.title : "",
        typeof a.description === "string" ? a.description : "",
        freshEvents,
      );
      if (match?.url) {
        a.event_url = match.url;
        totalRefreshed++;
      } else {
        a.event_url = null;
        totalCleared++;
      }
    }
  }
  return { refreshed: totalRefreshed, cleared: totalCleared };
}

// ===========================================================================
// MAIN HANDLER
// ===========================================================================

// PipelineError tags a failure with the pipeline step that raised it and a
// user-facing message. The top-level catch converts these into the structured
// 500 body the UI renders; other Error types collapse into a generic
// "internal_error" shape so we never bubble raw backend messages to users.
class PipelineError extends Error {
  step: string;
  userMessage: string;
  constructor(step: string, userMessage: string, detail: string) {
    super(`[${step}] ${detail}`);
    this.name = "PipelineError";
    this.step = step;
    this.userMessage = userMessage;
  }
}

// Supabase Edge Functions on the current plan wall-clock cap out at 150s
// (free plan: 30s). We throw a clean PipelineError a few seconds before then
// so the top-level catch has time to log and return a structured response
// instead of getting SIGKILLed with a generic 504.
const PIPELINE_WALL_CLOCK_MS = 150_000;
const PIPELINE_TIMEOUT_BUFFER_MS = 3_000;
const PIPELINE_TIMEOUT_MS = PIPELINE_WALL_CLOCK_MS - PIPELINE_TIMEOUT_BUFFER_MS;

// Per-attempt cap on a single Anthropic call. Keeps one slow day from
// burning the whole pipeline budget — particularly important in sequential
// rank mode where a stalled call would otherwise serialize-cascade through
// every remaining day. Sized against observed Haiku call latency: p50 ~5-10s,
// p95 ~20-25s, p99 ~30-60s. 35s comfortably covers p95 (including cold-cache
// day-1 writes) while bounding the worst case so at least ~4 timeouts can
// occur before the 150s pipeline budget exhausts.
const PER_ATTEMPT_MAX_MS = 35_000;

function checkPipelineTimeout(startedAt: number, nextStep: string): void {
  const elapsed = Date.now() - startedAt;
  if (elapsed > PIPELINE_TIMEOUT_MS) {
    throw new PipelineError(
      "timeout",
      "Trip generation took too long — try a smaller destination or shorter trip.",
      `elapsed ${elapsed}ms exceeded budget ${PIPELINE_TIMEOUT_MS}ms before step "${nextStep}"`,
    );
  }
}

// Fire-and-forget error logging. MUST NOT throw — if the insert fails we swallow
// because the top-level catch has already decided the response body and we
// never want logging to shadow the actual pipeline error.
async function logGenerationError(
  svcClient: ReturnType<typeof createClient>,
  row: {
    user_id: string | null;
    destination: string | null;
    step: string;
    error_message: string;
    error_raw: Record<string, unknown>;
    duration_ms: number;
  },
): Promise<void> {
  try {
    await svcClient.from("ai_generation_errors").insert(row);
  } catch {
    // intentionally swallowed
  }
}

Deno.serve(async (req) => {
  console.log(
    "[generate-trip-itinerary] v1.2 deployed — failure logging + timeout guard",
    new Date().toISOString(),
  );
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestStartedAt = Date.now();
  // Populated as the pipeline progresses so the top-level catch can log rich
  // context even if we crash mid-step.
  let loggedUserId: string | null = null;
  let loggedDestination: string | null = null;
  let loggedStep = "init";
  // Created lazily (after auth) so we can log errors even when auth itself
  // fails. For pre-auth failures we leave this null — nothing to log.
  let svcClientForLogging: ReturnType<typeof createClient> | null = null;

  try {
    // ---- Auth (anon-allowed) ----
    //
    // Two actor types are accepted:
    //   - Authenticated user: standard JWT Bearer token.
    //   - Anonymous visitor:  no JWT, but `anon_session_id` (uuid v4) supplied
    //                         in the request body. This is the public landing-
    //                         page "preview" flow; rate limits are tighter and
    //                         the result is persisted to anonymous_trips so
    //                         the visitor can scroll/share via /trips/anon/[id]
    //                         and (after signup) claim it onto their account.
    //
    // Sub-flows that are auth-only fall through to a 401 with
    // { code: "auth_required" } so the frontend can show a contextual signup
    // modal:
    //   - alternatives_mode (refining a saved activity)
    //   - any request carrying trip_id (regenerate against an existing trip)
    loggedStep = "auth";

    let body: TripBuilderRequest;
    try {
      body = await req.json();
    } catch (_e) {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }
    if (typeof body?.destination === "string" && body.destination.trim()) {
      loggedDestination = body.destination.trim();
    }

    const authHeader = req.headers.get("Authorization");
    let user: { id: string } | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user: u }, error: authErr } = await authClient.auth.getUser();
      if (!authErr && u) {
        user = u;
      }
    }

    const gate = decideAuthGate({
      authenticatedUserId: user?.id ?? null,
      body,
    });
    if (gate.kind === "reject") {
      return jsonResponse(
        { success: false, error: gate.message, code: gate.code },
        gate.status,
      );
    }
    const isAnonymous = gate.kind === "anonymous";
    const anonSessionId = gate.kind === "anonymous" ? gate.anonSessionId : null;
    const actorUserId: string | null = gate.kind === "authenticated" ? gate.userId : null;
    loggedUserId = actorUserId;
    const clientIp = isAnonymous ? extractClientIp(req) : null;
    if (isAnonymous && !clientIp) {
      console.warn(
        `[anon_rate_limit] no client ip extractable from headers — falling back to session-only enforcement (anon_session_id=${anonSessionId})`,
      );
    }

    // =========================================================================
    // ALTERNATIVES_MODE BRANCH — preserved verbatim, still uses Lovable / Gemini
    // =========================================================================
    if (body.alternatives_mode) {
      const altNotes = body.notes || "";
      const userDescription = body.user_description?.trim() || "";
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableApiKey) {
        return jsonResponse({ success: false, error: "LOVABLE_API_KEY not configured" }, 500);
      }

      const altSystemPrompt = userDescription
        ? "You are an expert travel planner. Suggest 3 real alternative activities that match the user's description. Use REAL venue names that actually exist. Include realistic coordinates."
        : "You are an expert travel planner. Suggest 3 real alternative activities. Use REAL venue names that actually exist. Include realistic coordinates.";

      const altUserPrompt = userDescription
        ? `${altNotes}\n\nThe user wants alternatives matching this description: '${userDescription}'. Suggest 3 alternative activities that match the user's description while fitting the day's schedule.`
        : altNotes;

      try {
        const altResult = await callLovableAI(lovableApiKey, altSystemPrompt, altUserPrompt, ALT_TOOL_SCHEMA);
        const normalizedAlt = normalizeAlternatives(altResult.itinerary);
        const alts = (normalizedAlt as { alternatives?: unknown })?.alternatives || [];
        return jsonResponse({ success: true, alternatives: alts });
      } catch (e) {
        console.error("Alternatives generation failed:", e);
        return jsonResponse({ success: true, alternatives: [] });
      }
    }

    // =========================================================================
    // NEW PIPELINE BRANCH — Places-first, Claude Haiku ranker
    // =========================================================================
    const pipelineStartedAt = Date.now();

    // Per-stage timing breakdown — emitted as a single [timing-summary] JSON
    // line at end of pipeline so a cold-cache run can be diagnosed from logs.
    const stageTimings: Record<string, number> = {};
    const tStage = (label: string, t0: number) => {
      const ms = Date.now() - t0;
      stageTimings[label] = ms;
      console.log(`[timing] stage.${label} ms=${ms} cumulative_ms=${Date.now() - pipelineStartedAt}`);
      return ms;
    };

    // ---- Validate inputs and resolve dates ----
    const surpriseMe = body.surprise_me === true;
    const rawDest = (body.destination || "").trim();
    const rawFreeText = (body.free_text || "").trim();
    // Three valid input shapes:
    //   1. explicit destination (form-driven flow)
    //   2. surprise_me=true (anon landing page / "pick for me")
    //   3. free_text only — destination is recovered from
    //      intent.named_destinations[0] after parseIntent runs.
    // The third shape is what the authenticated landing-page hero uses
    // ("4 day trip to Marrakech with hidden gems"). Rejecting it here used
    // to block intent extraction from ever running.
    if (!surpriseMe && !rawDest && !rawFreeText) {
      return jsonResponse(
        { success: false, error: "destination, free_text, or surprise_me=true is required" },
        400,
      );
    }

    // Date resolution. In flexible mode the dates start as a tentative value
    // (body.duration_days, falling back to 7) and may be re-resolved after
    // parseIntent if the user typed an explicit duration in free_text
    // ("10 day trip") that disagrees with the form. Fixed-date requests are
    // resolved here once and never change.
    const inFlexibleMode = body.flexible === true || (!body.start_date && !body.end_date);
    let startDate: string;
    let endDate: string;
    if (inFlexibleMode) {
      const dur = body.duration_days && body.duration_days > 0 ? Math.min(body.duration_days, 21) : 7;
      const flexDates = generateFlexDates(dur);
      startDate = flexDates.start;
      endDate = flexDates.end;
    } else {
      if (!body.start_date || !body.end_date) {
        return jsonResponse(
          { success: false, error: "start_date and end_date are required when not using flexible dates" },
          400,
        );
      }
      startDate = body.start_date;
      endDate = body.end_date;
    }

    let numDays = daysBetween(startDate, endDate);
    if (numDays < 1) {
      return jsonResponse({ success: false, error: "end_date must be on or after start_date" }, 400);
    }
    if (numDays > 21) {
      return jsonResponse({ success: false, error: "Trip duration cannot exceed 21 days" }, 400);
    }

    // Helper: in flexible mode, override the tentative duration with whatever
    // parseIntent extracted from free_text. body.duration_days wins if the
    // form explicitly carries a value — that's the user's most explicit
    // statement of intent. Fixed-date trips are never overridden because
    // start_date / end_date are themselves explicit user input.
    const applyIntentDuration = (intent: Intent): void => {
      if (!inFlexibleMode) return;
      if (typeof body.duration_days === "number" && body.duration_days > 0) return;
      const extracted = intent.duration_days;
      if (typeof extracted !== "number" || extracted < 1 || extracted > 21) return;
      if (extracted === numDays) return;
      const flex = generateFlexDates(extracted);
      console.log(
        `[free_text_duration] override numDays ${numDays} -> ${extracted} ` +
        `(body.duration_days unset; intent.duration_days=${extracted})`,
      );
      startDate = flex.start;
      endDate = flex.end;
      numDays = daysBetween(startDate, endDate);
    };

    // Helper: when surprise_me=true and the user explicitly named at least one
    // destination in free_text, skip the surprise picker and use the first
    // named destination. The surprise picker is for empty-hint inputs; when
    // the user wrote "Bangkok and Koh Phangan are must-haves" we should
    // honor Bangkok rather than letting the picker re-derive a single city
    // from vibes. Multi-destination handling for named_destinations[1..N] is
    // shipping in a separate change.
    const applyNamedDestination = (intent: Intent): boolean => {
      const first = intent.named_destinations?.[0]?.trim();
      if (!first) return false;
      intent.destination = first;
      console.log(
        `[free_text_destination] using named_destinations[0]="${first}" ` +
        `(skipping surprise picker; named_count=${intent.named_destinations.length})`,
      );
      return true;
    };

    // Helper: when the user supplied only free_text (no destination, not
    // surprise mode), parseIntent's system prompt forces intent.destination
    // to "" — the surprise picker would normally fill it in. For a non-
    // surprise free-text request we instead derive the destination from
    // intent.named_destinations[0] (e.g. "4 day trip to Marrakech" =>
    // "marrakech"). Throws a user-facing PipelineError when neither path
    // produced a destination so the caller gets actionable feedback rather
    // than the old "destination is required" pre-flight rejection.
    const ensureDerivedDestination = (intent: Intent): void => {
      if (intent.destination?.trim()) return;
      const first = intent.named_destinations?.[0]?.trim();
      if (first) {
        intent.destination = first;
        console.log(
          `[free_text_destination] derived destination="${first}" from ` +
          `named_destinations (free-text-only request; named_count=${intent.named_destinations.length})`,
        );
        return;
      }
      throw new PipelineError(
        "parseIntent",
        "We couldn't find a destination in your description. Try \"3 days in Lisbon\" or fill in the destination field.",
        "free-text-only request produced no destination; named_destinations=[]",
      );
    };

    // ---- Required env ----
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    const viatorMcid = Deno.env.get("VIATOR_MCID") ?? "";
    const gygPid = Deno.env.get("GETYOURGUIDE_PARTNER_ID") ?? "";
    // Awin publisher ID (Junto's account: 2848261). When unset, wrapAwinBookingUrl
    // returns the raw Booking.com destination URL — links still work, they just
    // don't track commission. Keep configurable in case the publisher account
    // rotates.
    const awinPublisherId = Deno.env.get("AWIN_PUBLISHER_ID") ?? "2848261";
    // Awin merchant ID for the Booking.com program. Defaults to LATAM (18119)
    // — the program Junto is signed up to. International stays are
    // commissionable regardless of program region per official Awin/Booking.com
    // guidance, but kept configurable in case the program is migrated.
    const awinBookingMid = Deno.env.get("AWIN_BOOKING_MID") ?? DEFAULT_AWIN_BOOKING_MID;
    const tripIdForClickref = (typeof body.trip_id === "string" && body.trip_id.trim())
      ? body.trip_id.trim()
      : null;

    if (!anthropicKey) {
      return jsonResponse({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 500);
    }
    if (!googleKey) {
      return jsonResponse({ success: false, error: "GOOGLE_PLACES_API_KEY not configured" }, 500);
    }

    const svcClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    svcClientForLogging = svcClient;
    const logger = makeLLMLogger(svcClient, actorUserId);

    // ---- Quotas: per-user rate limit + daily circuit breaker ----
    //
    // Rate limit: counts trip_builder_total + concierge_suggest_total in the
    // last hour. If the user is above the configured cap, 429 with a
    // friendly message. Value lives in env RATE_LIMIT_TRIPS_PER_HOUR so it
    // can be raised for trusted users without a deploy.
    //
    // Circuit breaker: sums places_* cost_usd in the last 24h across the
    // whole project. If over PLACES_DAILY_BUDGET_USD, refuse new builds.
    // Protects against a runaway prompt/loop burning the daily budget.
    // Admin bypass: skip rate limit entirely for the admin user so dev/testing
    // isn't blocked by the per-user hourly cap.
    const ADMIN_USER_ID = "1d5b21fe-f74c-429b-8d9d-938a4f295013";
    const rateLimit = Number.parseInt(Deno.env.get("RATE_LIMIT_TRIPS_PER_HOUR") ?? "", 10);
    const effectiveRateLimit = Number.isFinite(rateLimit) && rateLimit > 0 ? rateLimit : DEFAULT_RATE_LIMIT_PER_HOUR;
    const wantsStream = (req.headers.get("accept") ?? "").toLowerCase().includes("text/event-stream");
    if (isAnonymous) {
      // Two-tier rate limit:
      //   - per anon_session_id: 1 / 24h    (primary)
      //   - per source IP:        3 / 24h   (defense-in-depth, skipped if proxy
      //                                      didn't surface a client ip)
      // Counts come from anonymous_trips rows in the last 24h via SECURITY
      // DEFINER RPCs. See _shared/anon/rate-limit.ts for the matrix.
      const decision = await decideAnonRateLimit(
        makeRateLimitDeps(svcClient as unknown as RateLimitClient),
        anonSessionId!,
        clientIp,
      );
      if (decision.kind === "blocked") {
        console.warn(
          `[anon_rate_limit] blocked anon_session_id=${anonSessionId} ip=${clientIp ?? "unknown"} reason=${decision.reason} count=${decision.count}/${decision.limit}`,
        );
        const anonLimitBody = {
          success: false,
          error: "anon_limit",
          code: "rate_limited",
          reason: "signup_required",
          limit: decision.reason,
          message: "You've used your free trip preview. Sign up to plan more trips.",
        };
        return wantsStream ? sseEventResponse("error", anonLimitBody) : jsonResponse(anonLimitBody, 429);
      }
    } else if (actorUserId !== ADMIN_USER_ID) {
      const recentCount = await userGenerationsInLastHour(svcClient, actorUserId!);
      if (recentCount >= effectiveRateLimit) {
        return jsonResponse(
          {
            success: false,
            error: "rate_limited",
            message: `Slow down — you've kicked off ${recentCount} generations in the last hour. Please try again in a few minutes.`,
          },
          429,
        );
      }
    }

    const dailyBudget = Number.parseFloat(Deno.env.get("PLACES_DAILY_BUDGET_USD") ?? "");
    const effectiveBudget = Number.isFinite(dailyBudget) && dailyBudget > 0 ? dailyBudget : DEFAULT_PLACES_DAILY_BUDGET_USD;
    const spentToday = await placesSpendLastDayUsd(svcClient);
    if (spentToday > effectiveBudget) {
      console.warn(
        `[circuit_breaker] Places spend $${spentToday.toFixed(2)} exceeded daily cap $${effectiveBudget.toFixed(2)} — refusing generation`,
      );
      return jsonResponse(
        {
          success: false,
          error: "at_capacity",
          message: "We're at capacity right now — our planning engine is resting. Please try again in a few hours.",
        },
        503,
      );
    }

    tStage("auth_validate_quotas", pipelineStartedAt);

    // =========================================================================
    // STREAMING BRANCH — Server-Sent Events for the standalone trip builder
    //
    // Triggered by `Accept: text/event-stream`. Emits:
    //   event: progress        { stage, ...detail }       (legacy UX heartbeats — kept for backwards compat)
    //   event: stage_progress  { stage, user_text, percent_complete }  (rich progress copy for the UI)
    //   event: status_messages { messages: string[] }     (4 destination-specific micro-copy lines, fired once)
    //   event: meta            { destination, country_code, dates: [...], skeleton, currency, num_days }
    //   event: image           { url }                    (when destination cover resolves)
    //   event: day             { day_number, date, theme, activities }  (one per closed day)
    //   event: day_complete    { day_number, theme, activity_count }    (UI milestone after each day)
    //   event: accommodation   { destination_index, hotel }              (emitted as soon as metadata resolves)
    //   event: trip_complete   { trip_title, trip_summary, accommodation, packing_suggestions, junto_pick_place_ids, daily_budget_estimate, trip_total_estimate, total_activities, map_center, map_zoom, currency, budget_tier, adjustment_notice }
    //   event: error           { error, step, message }
    //   event: ping            {}                         (10s keepalive)
    //
    // The full payload is also written to ai_response_cache so non-streaming
    // callers (TripBuilderFlow, useResultsState) keep working from the same
    // intent-keyed cache.
    // =========================================================================
    if (wantsStream) {
      const encoder = new TextEncoder();
      const closedRef = { closed: false };
      const stream = new ReadableStream({
        // SYNC start. The previous async start kept the stream in "starting"
        // state for the entire pipeline duration on Deno Deploy / Supabase
        // Functions, which meant enqueued chunks were not flushed to the
        // gateway until start() resolved — making a 60s pipeline look like a
        // 60s buffered response to the client. Returning synchronously
        // unblocks the response body and chunks flush as they're enqueued.
        // The pipeline now runs as a fire-and-forget promise inside
        // runStreamingPipeline (declared below; hoisted).
        start(controller) {
          const enqueue = (chunk: string) => {
            if (closedRef.closed) return;
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch (e) {
              console.error("[stream] enqueue failed:", (e as Error).message);
            }
          };
          const send = (event: string, data: unknown) =>
            enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

          // First flush BEFORE any await — comment frame per SSE spec
          // (clients silently ignore lines starting with ":"). Pins
          // first-byte time at <100ms so the gateway commits to streaming
          // mode before the long-running pipeline starts.
          enqueue(": connected\n\n");

          const ping = setInterval(
            () => enqueue("event: ping\ndata: {}\n\n"),
            10_000,
          );

          // Fire-and-forget. start() returns synchronously after this line.
          // runStreamingPipeline owns the pipeline error handling (sends
          // event: error on throw); the .catch here is a defensive net for
          // anything that escapes that try/catch. The .finally tears down
          // the heartbeat + closes the controller regardless.
          runStreamingPipeline()
            .catch((e) => {
              const err = e as Error;
              const isPipelineErr = err instanceof PipelineError;
              try {
                send("error", {
                  error: "trip_build_failed",
                  step: isPipelineErr ? (err as PipelineError).step : "stream",
                  message: isPipelineErr
                    ? (err as PipelineError).userMessage
                    : "Something went wrong building your trip. Please try again.",
                });
              } catch {}
            })
            .finally(() => {
              clearInterval(ping);
              closedRef.closed = true;
              try { controller.close(); } catch {}
            });

          async function runStreamingPipeline(): Promise<void> {
            let stepLabel = "stream_init";
            try {
              send("progress", { stage: "parsing_intent" });
              send("stage_progress", {
                stage: "parsing_intent",
                user_text: "Reading your request",
                percent_complete: 5,
              });
              console.log("[stream] stage_progress: parsing_intent (5%)");

            // ---- parseIntent in parallel with geocode (non-surprise) ----
            const tParseIntent = Date.now();
            const earlyGeocodePromise: Promise<GeocodeResult> | null = !surpriseMe && rawDest
              ? geocodeDestination(googleKey, rawDest, svcClient, actorUserId).catch((e) => { throw e; })
              : null;
            stepLabel = "parseIntent";
            checkPipelineTimeout(pipelineStartedAt, stepLabel);
            const intent = await parseIntent(anthropicKey, body, surpriseMe ? "" : rawDest, logger, pipelineStartedAt);
            tStage("parse_intent", tParseIntent);
            applyIntentDuration(intent);
            if (intent.destination) loggedDestination = intent.destination;

            // Free-text-only flow: parseIntent leaves destination empty (the
            // system prompt requires it). Recover from named_destinations[0].
            if (!surpriseMe && !rawDest) {
              ensureDerivedDestination(intent);
              loggedDestination = intent.destination;
            }

            if (surpriseMe) {
              if (applyNamedDestination(intent)) {
                loggedDestination = intent.destination;
                send("progress", { stage: "destination_picked", destination: intent.destination });
              } else {
                send("progress", { stage: "picking_destination" });
                stepLabel = "pickSurpriseDestination";
                checkPipelineTimeout(pipelineStartedAt, stepLabel);
                const tSurprise = Date.now();
                intent.destination = await pickSurpriseDestination(anthropicKey, intent, numDays, logger, pipelineStartedAt);
                tStage("pick_surprise", tSurprise);
                loggedDestination = intent.destination;
                send("progress", { stage: "destination_picked", destination: intent.destination });
              }
            }

            // ---- Materialize multi-destination structure ----
            // After this point intent.destinations[] always has >= 1 entry; for
            // single-destination requests it's a 1-entry mirror of intent.destination.
            buildIntentDestinations(intent, numDays);

            // ---- Estimate transit legs (Haiku-cached) ----
            // Skipped for single-destination trips; returns [] in those cases
            // anyway, but the early return saves an LLM call wall time.
            if (intent.destinations.length >= 2) {
              stepLabel = "estimateTransitLegs";
              const tTransit = Date.now();
              intent.transit_legs = await estimateTransitLegs(
                anthropicKey, intent.destinations, svcClient, logger, pipelineStartedAt,
              );
              tStage("estimate_transit", tTransit);
            }

            // ---- Status messages (fire-and-forget, parallel with everything below) ----
            // Destination-specific micro-copy the frontend rotates while waiting
            // on rank_and_enrich. Hard 1500ms timeout inside generateStatusMessages
            // so it cannot block the pipeline; the .catch is a defensive net for
            // anything the helper missed. send() guards on closedRef so a late
            // arrival after stream close is a no-op.
            generateStatusMessages(anthropicKey, intent, intent.destination, svcClient, logger)
              .then((messages) => {
                if (messages && messages.length > 0) {
                  send("status_messages", { messages });
                  console.log(`[stream] status_messages emitted (${messages.length} messages)`);
                }
              })
              .catch((e) => {
                console.warn("[stream.status_messages] unexpected error:", (e as Error).message);
              });

            // ---- Cache lookup ----
            stepLabel = "cacheLookup";
            checkPipelineTimeout(pipelineStartedAt, stepLabel);
            const tCacheLookup = Date.now();
            const monthBucket = extractMonthBucket(startDate);
            const { key: cacheKey, shape: cacheKeyShape } = await buildRawCacheKey(
              body,
              numDays,
              startDate,
              surpriseMe ? intent.destination : undefined,
            );
            console.log(
              `[stream.cache] read key=${cacheKey} raw_inputs=${JSON.stringify(cacheKeyShape)}`,
            );
            const { data: cached, error: cacheErr } = await svcClient
              .from("ai_response_cache")
              .select("response_json")
              .eq("cache_key", cacheKey)
              .gt("expires_at", new Date().toISOString())
              .maybeSingle();
            if (cacheErr) {
              throw new Error(`ai_response_cache lookup failed: ${cacheErr.message}`);
            }
            if (cached?.response_json) {
              const payload = cached.response_json as Record<string, any>;
              // Cache validation: sum days across ALL legs. v3 payloads store
              // destinations[] as the unified leg list (real + transit), so
              // the sum equals the trip's total day count.
              const cachedDests = Array.isArray(payload?.destinations) ? payload.destinations : [];
              const cachedDayCount: number = cachedDests.reduce(
                (n: number, d: any) => n + (Array.isArray(d?.days) ? d.days.length : 0),
                0,
              );
              if (cachedDayCount !== numDays) {
                console.log(
                  `[stream.cache] miss cache_key=${cacheKey} reason=day_count_mismatch cached=${cachedDayCount} requested=${numDays}`,
                );
              } else {
                tStage("cache_lookup_hit", tCacheLookup);
                rewriteCachedPayloadDates(payload, startDate);
                const cacheAffEnv: AffiliateEnv = {
                  viator: viatorMcid,
                  gyg: gygPid,
                  awinPublisherId,
                  awinMerchantId: awinBookingMid,
                  tripId: tripIdForClickref,
                  checkin: startDate,
                  checkout: endDate,
                  cityHint: intent.destination,
                };
                const bookingRewriteStats = rewriteCachedBookingUrls(payload, cacheAffEnv);
                const eventsResult = await refreshCachedEvents(
                  payload,
                  intent,
                  startDate,
                  endDate,
                  svcClient,
                  logger,
                );
                console.log(
                  `[stream.cache] hit cache_key=${cacheKey} month_bucket=${monthBucket} date_swap=true events_refreshed=${eventsResult.refreshed} events_cleared=${eventsResult.cleared} booking_urls_rewritten=${bookingRewriteStats.rewritten}`,
                );
                // Flatten cached destinations[] into one days array for the
                // streaming `day` events, in day_number order.
                const cachedAllDays: any[] = [];
                for (const d of cachedDests) {
                  if (Array.isArray(d?.days)) for (const dd of d.days) cachedAllDays.push(dd);
                }
                cachedAllDays.sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0));
                const firstDest = cachedDests[0];
                send("meta", {
                  destination: firstDest?.name ?? intent.destination,
                  country_code: null,
                  num_days: cachedAllDays.length,
                  skeleton: cachedAllDays.map((d: any) => ({
                    day_number: d.day_number,
                    date: d.date,
                    theme: d.theme ?? "",
                    destination_index: d.destination_index ?? 0,
                    ...(d.transit ? { transit: d.transit } : {}),
                  })),
                  currency: payload?.currency ?? "USD",
                  from_cache: true,
                });
                // Replay leg structure from cache.
                send("leg", {
                  legs: cachedDests.map((d: any, idx: number) => {
                    const dDays = Array.isArray(d?.days) ? d.days : [];
                    return {
                      index: idx,
                      name: d?.name ?? "",
                      kind: d?.kind ?? "destination",
                      days: dDays.length,
                      day_numbers: dDays.map((dd: any) => dd.day_number),
                      ...(d?.kind === "transit" && d?.transit
                        ? { transit: true, description: d.transit.description ?? "" }
                        : {}),
                    };
                  }),
                  adjustment_notice: payload?.adjustment_notice ?? null,
                });
                send("image", { url: payload?.destination_image_url ?? null });
                // Emit accommodation per real-destination leg. Multi-leg
                // payloads carry per-leg accommodation; legacy single-leg
                // payloads emit one event with destination_index=0. Cached
                // payloads written before this PR have no
                // accommodation_alternatives — fall back to [] so the event
                // shape stays stable.
                for (let li = 0; li < cachedDests.length; li++) {
                  const ld = cachedDests[li];
                  if (ld?.kind === "transit") continue;
                  if (ld?.accommodation) {
                    send("accommodation", {
                      destination_index: li,
                      hotel: ld.accommodation,
                      alternatives: Array.isArray(ld.accommodation_alternatives)
                        ? ld.accommodation_alternatives
                        : [],
                    });
                  }
                }
                // Re-apply junto picks against the current request's intent
                // before streaming days — cached payloads were tagged under
                // whatever intent generated them, and signal matches may
                // differ for this caller. markJuntoPicks resets stale flags
                // internally.
                markJuntoPicks(payload as unknown as PipelineResult, intent);
                logVibeCoverage(payload as unknown as PipelineResult, intent);
                logDescriptionGrounding(payload as unknown as PipelineResult, intent);
                logOpeningHoursViolations(payload as unknown as PipelineResult);
                logPricingAnomalies(payload as unknown as PipelineResult);
                send("stage_progress", {
                  stage: "finalizing",
                  user_text: "Final touches",
                  percent_complete: 95,
                });
                console.log("[stream] stage_progress: finalizing (95%) [cache hit]");
                for (const d of cachedAllDays) {
                  send("day", d);
                  send("day_complete", {
                    day_number: d.day_number,
                    theme: d.theme ?? "",
                    activity_count: Array.isArray(d.activities) ? d.activities.length : 0,
                    destination_index: d.destination_index ?? 0,
                  });
                  console.log(`[stream] day_complete: day_number=${d.day_number} [cache hit]`);
                }
                const juntoPlaceIds: string[] = [];
                for (const d of cachedAllDays) {
                  for (const a of d.activities ?? []) if (a?.is_junto_pick && a.place_id) juntoPlaceIds.push(a.place_id);
                }
                console.log(`[stream.cache] junto_picks_tagged=${juntoPlaceIds.length}`);
                let cacheHitAnonTripId: string | null = null;
                if (isAnonymous && anonSessionId) {
                  cacheHitAnonTripId = await persistAnonymousTrip(
                    svcClient as unknown as AnonStorageClient,
                    {
                      anonSessionId,
                      prompt: typeof body.free_text === "string" ? body.free_text : null,
                      sourceIp: clientIp,
                      payload: payload as Record<string, unknown>,
                    },
                  );
                }
                // trip_total_estimate: prefer the cached field; legacy
                // payloads (pre-PR multi-destination) didn't store it, so
                // recompute from the cached destinations[] in that case.
                const cachedTripTotal = typeof payload?.trip_total_estimate === "number"
                  ? payload.trip_total_estimate
                  : computeTripTotalEstimate(cachedDests as unknown as RankedDestination[]);
                // Daily-living additive: prefer cached, otherwise recompute
                // from cached price_baselines on each leg. Pre-PR cache rows
                // without baselines yield 0; UI hides the toggle in that case.
                const cachedDailyLiving = typeof payload?.daily_living_additive_eur === "number"
                  ? payload.daily_living_additive_eur
                  : computeDailyLivingAdditiveEur(cachedDests as unknown as RankedDestination[]);
                // Budget sanity check on the cached value. Mostly a cache
                // hit on the validator's own 30-day cache (same trip
                // shape → same range), so net cost ~0.
                const cacheHitBudgetValidation = await validateBudgetEstimate(
                  anthropicKey,
                  realDestinationNames(cachedDests as Array<{ name: string; kind?: string }>),
                  realDestinationDayCount(cachedDests as Array<{ days?: unknown; kind?: string }>),
                  payload?.budget_tier ?? intent.budget_tier,
                  cachedTripTotal,
                  svcClient,
                  logger,
                  pipelineStartedAt,
                );
                const cacheHitFakeResult: PipelineResult = {
                  ...(payload as unknown as PipelineResult),
                  trip_total_estimate: cachedTripTotal,
                  daily_living_additive_eur: cachedDailyLiving,
                };
                applyBudgetSanityCheck(cacheHitFakeResult, cacheHitBudgetValidation);
                logBudgetRollup(
                  cachedDests as unknown as RankedDestination[],
                  cacheHitFakeResult.trip_total_estimate,
                  cacheHitFakeResult.daily_living_additive_eur ?? 0,
                  cacheHitFakeResult.expected_range_eur ?? null,
                  cacheHitFakeResult.estimation_method,
                  payload?.currency ?? "USD",
                );
                send("trip_complete", {
                  trip_title: stripEmojis(payload?.trip_title),
                  trip_summary: payload?.trip_summary ?? "",
                  accommodation: firstDest?.accommodation ?? null,
                  packing_suggestions: payload?.packing_suggestions ?? [],
                  junto_pick_place_ids: juntoPlaceIds,
                  daily_budget_estimate: payload?.daily_budget_estimate ?? 0,
                  trip_total_estimate: cacheHitFakeResult.trip_total_estimate,
                  daily_living_additive_eur: cacheHitFakeResult.daily_living_additive_eur ?? 0,
                  estimation_method: cacheHitFakeResult.estimation_method ?? "calculated",
                  expected_range_eur: cacheHitFakeResult.expected_range_eur ?? null,
                  total_activities: payload?.total_activities ?? 0,
                  map_center: payload?.map_center ?? null,
                  map_zoom: payload?.map_zoom ?? 12,
                  currency: payload?.currency ?? "USD",
                  budget_tier: payload?.budget_tier ?? intent.budget_tier,
                  destination_image_url: payload?.destination_image_url ?? null,
                  destination_country_iso: payload?.destination_country_iso ?? null,
                  adjustment_notice: payload?.adjustment_notice ?? null,
                  from_cache: true,
                  ...(cacheHitAnonTripId ? { anon_trip_id: cacheHitAnonTripId } : {}),
                });
                await logger.log({
                  feature: "trip_builder_cache_hit", model: "cache",
                  input_tokens: 0, output_tokens: 0, cost_usd: 0, cached: true,
                });
                console.log(`[timing-summary] ${JSON.stringify({ total_ms: Date.now() - pipelineStartedAt, cache_hit: true, stream: true, stages: stageTimings })}`);
                return;
              }
            } else {
              console.log(`[stream.cache] miss cache_key=${cacheKey} reason=not_found month_bucket=${monthBucket}`);
            }
            tStage("cache_lookup_miss", tCacheLookup);

            // ---- Geocode (multi-leg) + skeleton + queries ----
            send("progress", { stage: "geocoding" });
            send("stage_progress", {
              stage: "geocoding",
              user_text: `Locating ${intent.destination}`,
              percent_complete: 15,
            });
            console.log("[stream] stage_progress: geocoding (15%)");
            stepLabel = "geocodeDestination";
            checkPipelineTimeout(pipelineStartedAt, stepLabel);
            const tGeocode = Date.now();
            // For multi-destination trips: parallel geocode all legs. The
            // earlyGeocodePromise (started before parseIntent) only covers the
            // form-supplied destination, which corresponds to leg 0 — we use it
            // when shape allows, otherwise fall back to a fresh multi-geocode.
            let geos: GeocodeResult[];
            if (intent.destinations.length === 1 && earlyGeocodePromise) {
              const earlyGeo = await earlyGeocodePromise;
              geos = [earlyGeo];
            } else {
              geos = await geocodeIntentDestinations(googleKey, intent.destinations, svcClient, actorUserId);
            }
            const geo: GeocodeResult = geos[0];
            tStage("geocode", tGeocode);

            // ---- Build the unified leg list (real + transit pseudo-legs) ----
            const legs = buildLegs(intent, geos, numDays);

            const tSkeleton = Date.now();
            const skeleton = buildSkeleton(intent, legs, numDays, startDate);
            tStage("build_skeleton", tSkeleton);

            const tripCurrency = resolveTripCurrency(geo.country_code);

            send("meta", {
              destination: intent.destination,
              country_code: geo.country_code,
              num_days: numDays,
              skeleton: skeleton.map((d) => ({
                day_number: d.day_number, date: d.date, theme: d.theme,
                destination_index: d.destination_index,
                ...(d.transit ? { transit: d.transit } : {}),
              })),
              currency: tripCurrency,
              from_cache: false,
            });

            // ---- Leg structure event (multi-destination UX) ----
            send("leg", {
              legs: legs.map((leg) => {
                const legDays = skeleton.filter((d) => d.destination_index === leg.index);
                return {
                  index: leg.index,
                  name: leg.name,
                  kind: leg.kind,
                  days: legDays.length,
                  day_numbers: legDays.map((d) => d.day_number),
                  ...(leg.kind === "transit" && leg.transit_meta
                    ? { transit: true, description: leg.transit_meta.description }
                    : {}),
                };
              }),
              adjustment_notice: intent.adjustment_notice ?? null,
            });

            // ---- Image in parallel with everything below ----
            const imagePromise: Promise<string | null> = resolveDestinationImageUrl(
              geo.place_id ?? null, intent.destination, googleKey, svcClient,
            ).catch((e) => {
              console.warn("[stream.image] threw:", (e as Error).message);
              return null;
            });
            imagePromise.then((url) => send("image", { url }));

            // ---- Places search + hydrate + events ----
            send("progress", { stage: "searching_venues" });
            send("stage_progress", {
              stage: "searching_places",
              user_text: "Finding the best venues",
              percent_complete: 30,
            });
            console.log("[stream] stage_progress: searching_places (30%)");
            const tQueryPlan = Date.now();
            const queries = buildPlacesQueries(intent, skeleton, legs);
            tStage("build_queries", tQueryPlan);

            stepLabel = "searchPlacesAndEvents";
            checkPipelineTimeout(pipelineStartedAt, stepLabel);
            const tSearch = Date.now();
            // Events are searched per real-destination leg in parallel. For
            // single-destination trips this is the legacy single call. We
            // tag each event with the source leg index so day-level event
            // routing can prefer events from the day's leg.
            const realDestLegs = legs.filter((l) => l.kind === "destination");
            const [searchResult, ...eventsByLeg] = await Promise.all([
              searchPlacesBatch(queries, googleKey, svcClient),
              ...realDestLegs.map((leg) => {
                const legDays = skeleton.filter((d) => d.destination_index === leg.index);
                return searchEvents(leg.name, startDate, endDate, intent, legDays, svcClient, logger);
              }),
            ]);
            const events: EventCandidate[] = eventsByLeg.flat();
            tStage("search_places_and_events", tSearch);
            const places = searchResult.places;
            const rankingStats = searchResult.stats;

            send("progress", { stage: "hydrating_finalists", venues: places.length });
            const finalistIds: string[] = [];
            const seenFinalist = new Set<string>();
            const byPool = new Map<PoolKey, BatchPlaceResult[]>();
            for (const p of places) {
              const pool = byPool.get(p.poolKey) ?? [];
              pool.push(p);
              byPool.set(p.poolKey, pool);
            }
            const maxFinalists = computeMaxFinalists(numDays);
            const maxPerPool = Math.max(3, Math.ceil(maxFinalists / Math.max(1, byPool.size)));
            for (const pool of byPool.values()) {
              for (const p of pool.slice(0, maxPerPool)) {
                if (seenFinalist.has(p.id)) continue;
                seenFinalist.add(p.id);
                finalistIds.push(p.id);
                if (finalistIds.length >= maxFinalists) break;
              }
              if (finalistIds.length >= maxFinalists) break;
            }
            const idToBase = new Map<string, BatchPlaceResult>();
            for (const p of places) idToBase.set(p.id, p);
            const tHydrate = Date.now();
            const { hydrated: hydratedById, stats: hydrationStats } = await hydrateFinalists(finalistIds, idToBase, googleKey, svcClient);
            tStage("hydrate_finalists", tHydrate);

            await logPlacesByTier(svcClient, logger, actorUserId, {
              search_essentials_live: rankingStats.live_calls, search_essentials_cache: rankingStats.cache_hits,
              details_live: hydrationStats.live_calls, details_cache: hydrationStats.cache_hits,
            });

            for (let i = 0; i < places.length; i++) {
              const h = hydratedById.get(places[i].id);
              if (h) places[i] = h;
            }
            const venuesByPool = new Map<PoolKey, BatchPlaceResult[]>();
            for (const p of places) {
              const pool = venuesByPool.get(p.poolKey) ?? [];
              pool.push(p);
              venuesByPool.set(p.poolKey, pool);
            }
            const allPlacesById = new Map<string, BatchPlaceResult>();
            for (const p of places) allPlacesById.set(p.id, p);
            const placeById = new Map<string, BatchPlaceResult>();
            for (const venues of venuesByPool.values()) for (const v of venues) placeById.set(v.id, v);

            // Kick off photo mirroring as soon as candidate places are settled.
            // Runs concurrently with metadata + day rankers; awaited along
            // with baselines/hotel estimates before any hydrate step. See
            // _shared/places/photoMirror.ts for the cost/security rationale.
            const photoMirrorPromise = mirrorPhotosForPlaces(
              svcClient, googleKey, places, { max: 1 },
            ).catch((e) => {
              console.warn(
                "[stream.photo_mirror] batch threw — proceeding with empty photos:",
                (e as Error).message,
              );
              return new Map<string, string[]>();
            });

            // Mutable shared map populated when photoMirrorPromise resolves.
            // Hydrate closures below capture this by reference; their gating
            // Promise.all (accommodationEarlyPromise + the day-rank await
            // below) includes photoMirrorPromise so the map is populated by
            // the time any closure runs. Default empty map keeps the hydrate
            // path safe if the mirror batch fails outright.
            let photoUrlByPlaceId: Map<string, string[]> = new Map();

            // ---- Parallel rank: N per-day calls + 1 metadata call ----
            //
            // Cold-cache wall time used to be 60s for the whole trip because the
            // monolithic ranker generated all days serially in one call. Splitting
            // by day means wall time = max(per-day call) ≈ 15-20s for short trips.
            // As soon as each day's tool input arrives, we hydrate + emit the SSE
            // `day` event so the UI can render progressively.
            //
            // Two ranking modes:
            //   parallel   (numDays < SEQUENTIAL_RANKING_MIN_DAYS, i.e.
            //              single-day trips): all per-day calls fire at once
            //              with avoid_place_ids=[]. Trip-wide dedup at receipt
            //              time, day 1 wins contested venues. With only one
            //              day there's nothing to contend with.
            //   sequential (numDays ≥ SEQUENTIAL_RANKING_MIN_DAYS): per-day
            //              calls fire one-by-one in skeleton order. After each
            //              day's hydrate+emit step, the cumulative `seenIds`
            //              set is passed to the next day's call as
            //              avoid_place_ids — so the LLM is told what's already
            //              claimed instead of guessing. Eliminates dedup-driven
            //              empty days at the cost of ~2x wall time on long trips.
            //              The metadata call still runs in parallel with day 1
            //              (it doesn't compete on place_ids).
            send("progress", { stage: "ranking" });
            send("stage_progress", {
              stage: "ranking_days",
              user_text: "Crafting your itinerary",
              percent_complete: 50,
            });
            console.log("[stream] stage_progress: ranking_days (50%)");
            stepLabel = "rankAndEnrich";
            checkPipelineTimeout(pipelineStartedAt, stepLabel);
            const tRank = Date.now();

            const currency = tripCurrency;
            // Trip-level affEnv. cityHint is overridden per-leg below at the
            // buildAffiliateUrl call site so each leg's hotel search uses its
            // OWN city name, not the first leg's name.
            const affEnv: AffiliateEnv = {
              viator: viatorMcid,
              gyg: gygPid,
              awinPublisherId,
              awinMerchantId: awinBookingMid,
              tripId: tripIdForClickref,
              checkin: startDate,
              checkout: endDate,
              cityHint: intent.destination,
            };
            const ranked_days: RankedDay[] = [];
            // Per-leg dedup tracking. Within a leg the LLM should not reuse
            // the same place_id; across legs reuse is allowed (different
            // physical destinations).
            const seenIdsByLeg = new Map<number, Set<string>>();
            const getSeenForLeg = (idx: number): Set<string> => {
              let s = seenIdsByLeg.get(idx);
              if (!s) { s = new Set(); seenIdsByLeg.set(idx, s); }
              return s;
            };
            const seenThemes = new Set<string>();
            const emittedDayNumbers = new Set<number>();
            let totalDropped = 0;
            let fallbackDays = 0;

            // Per-leg accommodation + leg-scoped place pool.
            const accomByLeg = pickAccommodationPlaceIdsByLeg(venuesByPool, legs);
            const accommodationPlaceId = accomByLeg.get(0) ?? pickAccommodationPlaceId(venuesByPool);
            const placeByIdByLeg = new Map<number, Map<string, BatchPlaceResult>>();
            for (const venues of venuesByPool.values()) {
              for (const v of venues) {
                const idx = v.destinationIndex ?? 0;
                let m = placeByIdByLeg.get(idx);
                if (!m) { m = new Map(); placeByIdByLeg.set(idx, m); }
                m.set(v.id, v);
              }
            }
            const sharedContext = buildSharedContextText(intent, legs, venuesByPool, events, currency, geo.country_code);

            const sequentialRanking = numDays >= SEQUENTIAL_RANKING_MIN_DAYS;
            let thinDays = 0;
            console.log(
              `[stream.rank] mode=${sequentialRanking ? "sequential" : "parallel"} ` +
              `numDays=${numDays} pool_size=${placeById.size} legs=${legs.length}`,
            );

            // ---- Per-leg destination price baselines (Haiku, cached 30d).
            // Fired in parallel with the metadata + day-rank calls. We await
            // before the rank loop so hydrateAndEmit can read leg baselines
            // synchronously. Cache hit ~50ms; miss ~1-3s. Failures fall back
            // to PR #264's hardcoded tier bands. ----
            const baselinesPromise: Promise<Map<number, DestinationPriceBaselines | null>> = Promise.all(
              legs
                .filter((leg) => leg.kind === "destination" && leg.name)
                .map(async (leg) => {
                  try {
                    const b = await estimateDestinationPriceBaselines(
                      anthropicKey, leg.name, intent.budget_tier, svcClient, logger, pipelineStartedAt,
                    );
                    return [leg.index, b] as [number, DestinationPriceBaselines | null];
                  } catch (e) {
                    console.warn(`[price_baselines] leg ${leg.index} (${leg.name}) failed:`, (e as Error).message);
                    return [leg.index, null] as [number, DestinationPriceBaselines | null];
                  }
                }),
            ).then((entries) => new Map(entries));

            // ---- Per-venue accommodation cost (Haiku, cached 30d). One
            // estimate per leg's chosen hotel (1-3 per trip in practice).
            // Alternatives stay on the destination-baseline path. Fires in
            // parallel; failures fall back to baselines via the clamp. ----
            const hotelEstimatesPromise: Promise<Map<string, AccommodationEstimate | null>> = Promise.all(
              legs
                .filter((leg) => leg.kind === "destination" && leg.name)
                .map(async (leg) => {
                  const placeId = accomByLeg.get(leg.index) ?? null;
                  if (!placeId) return null;
                  const place = placeById.get(placeId);
                  if (!place) return null;
                  const neighborhood = extractNeighborhood(place.addressComponents);
                  try {
                    const est = await estimateAccommodationCost(
                      anthropicKey,
                      place.displayName ?? placeId,
                      leg.name,
                      neighborhood,
                      priceLevelEnumToNumber(place.priceLevel),
                      place.rating ?? null,
                      place.userRatingCount ?? null,
                      intent.budget_tier,
                      svcClient,
                      logger,
                      pipelineStartedAt,
                    );
                    return [placeId, est] as [string, AccommodationEstimate | null];
                  } catch (e) {
                    console.warn(`[hotel_estimate] leg ${leg.index} hotel="${place.displayName}" failed:`, (e as Error).message);
                    return [placeId, null] as [string, AccommodationEstimate | null];
                  }
                }),
            ).then((entries) => {
              const out = new Map<string, AccommodationEstimate | null>();
              for (const e of entries) if (e) out.set(e[0], e[1]);
              return out;
            });

            const hydrateAndEmit = (
              rawDay: RawRankerDay | null,
              day: DaySkeleton,
              source: "llm" | "fallback",
              baselinesByLeg: Map<number, DestinationPriceBaselines | null>,
            ) => {
              if (emittedDayNumbers.has(day.day_number)) return;
              const legIdx = day.destination_index;
              const legSeen = getSeenForLeg(legIdx);
              const legPool = placeByIdByLeg.get(legIdx) ?? new Map<string, BatchPlaceResult>();
              const legAccomId = accomByLeg.get(legIdx) ?? null;
              const legBaselines = baselinesByLeg.get(legIdx) ?? null;
              // Per-leg city hint for affiliate hotel search. The leg's name
              // ("Bangkok, Thailand") feeds buildBookingSearchString so each
              // leg's hotel link queries that leg's city, not the trip's first.
              const legAffEnv: AffiliateEnv = {
                ...affEnv, cityHint: legs[legIdx]?.name ?? intent.destination,
              };
              // Per-leg geo for distance validation. Transit days have no own
              // coords — fall back to the trip-level center so the validator
              // doesn't reject a transit dinner picked from the destination
              // pool.
              const legGeo = legs[legIdx]?.geo ?? geos[0];
              const theme = rawDay?.theme?.trim() || day.theme;
              const activities: EnrichedActivity[] = [];
              const rawActs = Array.isArray(rawDay?.activities) ? rawDay!.activities : [];
              const dropReasons: string[] = [];
              for (let i = 0; i < day.slots.length; i++) {
                const slot = day.slots[i];
                const rawAct = rawActs.find((a) => a?.slot_index === i);
                if (!rawAct) continue;
                if (rawAct.place_id && legSeen.has(rawAct.place_id)) {
                  dropReasons.push("dedup");
                  continue;
                }
                if (legAccomId && rawAct.place_id === legAccomId) {
                  dropReasons.push("accommodation_collision");
                  continue;
                }
                // Multi-destination scope check — drop picks from a different leg.
                const place = rawAct.place_id ? legPool.get(rawAct.place_id) ?? null : null;
                if (!rawAct.is_event && rawAct.place_id && !place) {
                  dropReasons.push("place_id_not_in_leg_pool");
                  continue;
                }
                if (place) {
                  const openCheck = checkVenueOpen(place, day.date, slot.start_time);
                  if (!openCheck.open && openCheck.source === "places") {
                    console.warn(
                      `[opening_hours] drop: place_id=${place.id} "${place.displayName}" ` +
                      `closed at ${day.date} ${slot.start_time} (slot=${slot.type})`,
                    );
                    dropReasons.push("closed_at_slot");
                    continue;
                  }
                }
                const activity = hydrateActivity(
                  rawAct, slot, place, place ? (photoUrlByPlaceId.get(place.id) ?? []) : [],
                  currency, intent.budget_tier, events, legBaselines,
                );
                if (!activity) {
                  dropReasons.push("hydrate_failed");
                  continue;
                }
                if (place) legSeen.add(place.id);
                const aff = buildAffiliateUrl(
                  activity.place_id ? allPlacesById.get(activity.place_id) ?? null : null,
                  legAffEnv, activity.event_url,
                );
                activity.booking_url = aff.booking_url;
                activity.booking_partner = aff.booking_partner;
                activities.push(activity);
              }
              const validated = validateDayActivitiesInline(
                activities,
                allPlacesById,
                { lat: legGeo.lat, lng: legGeo.lng },
                validationRadiusKm(legGeo),
              );
              totalDropped += validated.dropped;
              const rankedDay: RankedDay = {
                date: day.date, day_number: day.day_number, theme, activities: validated.kept,
                destination_index: legIdx,
                ...(day.transit ? { transit: day.transit } : {}),
              };
              resolveDayTheme(rankedDay, seenThemes);
              ranked_days.push(rankedDay);
              emittedDayNumbers.add(day.day_number);

              const minActivities = day.transit ? 1 : Math.max(2, Math.floor(day.slots.length * 0.5));
              if (validated.kept.length < minActivities) {
                thinDays++;
                const reason =
                  source === "fallback" ? "rank_failed"
                  : dropReasons.length > 0 ? dropReasons.join(",")
                  : "unknown";
                console.warn(
                  `[stream.rank] thin day day_number=${day.day_number} leg=${legIdx} ` +
                  `kept=${validated.kept.length} slots=${day.slots.length} ` +
                  `mode=${sequentialRanking ? "sequential" : "parallel"} ` +
                  `claimed_in_leg=${legSeen.size} leg_pool_size=${legPool.size} ` +
                  `reason=${reason}`,
                );
              }

              send("day", rankedDay);
              send("day_complete", {
                day_number: rankedDay.day_number,
                theme: rankedDay.theme,
                activity_count: rankedDay.activities.length,
                destination_index: rankedDay.destination_index,
              });
              console.log(`[stream] day_complete: day_number=${rankedDay.day_number} leg=${legIdx}`);
            };

            // Metadata call fires in parallel with day calls in both modes —
            // it doesn't compete on per-day place_ids, so there's no benefit
            // to serializing it.
            const metadataPromise = rankTripMetadata(
              anthropicKey, intent, numDays, startDate, endDate,
              sharedContext, pipelineStartedAt,
            ).then(async (res) => {
              if (res.usage) {
                await logger.log({
                  feature: "trip_builder_rank_metadata", model: HAIKU_MODEL,
                  input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
                  cost_usd: computeHaikuCost(res.usage),
                  cached: res.usage.cache_read_input_tokens > 0,
                }).catch((e) => console.error("[stream.metadata] logger.log failed:", (e as Error).message));
              }
              return res;
            }).catch((e) => {
              console.error("[stream.metadata] failed:", (e as Error).message);
              return {
                data: null,
                usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
              };
            });

            // Helper: rank one day. Transit days bypass the LLM entirely.
            const rankOneDayStream = async (day: DaySkeleton, avoidIds: string[]) => {
              if (day.transit) {
                return {
                  raw: buildTransitDayFallback(day),
                  source: "llm" as const,
                  usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
                };
              }
              return await rankDayWithRetry(
                anthropicKey, intent, day, legs, sharedContext,
                accomByLeg.get(day.destination_index) ?? null,
                avoidIds, pipelineStartedAt, logger,
              );
            };

            // Track which legs have already had their accommodation emitted
            // so the late assembly path doesn't double-emit. Used by both the
            // early-emit promise below and the post-rank fallback emit.
            const accommodationEmittedLegs = new Set<number>();

            // Early-emit accommodation per real-destination leg as soon as
            // metadata resolves (typically lands ~10-15s in, well before the
            // last day completes). The frontend renders hotel cards
            // immediately instead of waiting for trip_complete. We emit:
            //   - one event for the leg whose pool contains metadata's
            //     editorially-chosen place_id (with metadata's title/desc)
            //   - one fallback event per OTHER real-destination leg using
            //     that leg's top-rated lodging (auto-generated copy)
            // This preserves the legacy single-destination shape (one event
            // with destination_index=0) while supporting multi-destination.
            // Hydrate a lodging place as an EnrichedActivity using auto-generated
            // copy. Used for the alternatives list (which shouldn't reuse the
            // metadata call's editorial copy — that's the chosen hotel's voice).
            const hydrateLodgingAlt = (
              legIdx: number,
              place: BatchPlaceResult,
              baselinesByLeg: Map<number, DestinationPriceBaselines | null>,
            ): EnrichedActivity | undefined => {
              const fakeSlot: PacingSlot = {
                type: "lodging", start_time: "15:00", duration_minutes: 0, region_tag_for_queries: "primary",
              };
              const hydrated = hydrateActivity(
                {
                  slot_index: -1, slot_type: "lodging",
                  place_id: place.id, is_event: false,
                  title: place.displayName ?? "Hotel",
                  description: "",
                  pro_tip: "",
                  why_for_you: "",
                  skip_if: null,
                  category: "accommodation",
                  estimated_cost_per_person: 0,
                  dietary_notes: null,
                },
                fakeSlot, place, photoUrlByPlaceId.get(place.id) ?? [],
                currency, intent.budget_tier,
                [], baselinesByLeg.get(legIdx) ?? null,
              );
              if (!hydrated) return undefined;
              const legAffEnv: AffiliateEnv = { ...affEnv, cityHint: legs[legIdx]?.name ?? intent.destination };
              const aff = buildAffiliateUrl(place, legAffEnv, hydrated.event_url);
              hydrated.booking_url = aff.booking_url;
              hydrated.booking_partner = aff.booking_partner;
              return hydrated;
            };

            const buildAlternativesForLeg = (
              legIdx: number,
              chosenPlaceId: string | null,
              baselinesByLeg: Map<number, DestinationPriceBaselines | null>,
            ): EnrichedActivity[] => {
              const alts = pickAccommodationAlternativesForLeg(venuesByPool, legIdx, chosenPlaceId);
              const out: EnrichedActivity[] = [];
              for (const place of alts) {
                const hydrated = hydrateLodgingAlt(legIdx, place, baselinesByLeg);
                if (hydrated) out.push(hydrated);
              }
              return out;
            };

            const emitOneLegAccommodation = (
              legIdx: number,
              place: BatchPlaceResult,
              raw: { title?: string | null; description?: string | null; pro_tip?: string | null; why_for_you?: string | null; skip_if?: string | null; estimated_cost_per_person?: number | null; dietary_notes?: string | null } | null,
              baselinesByLeg: Map<number, DestinationPriceBaselines | null>,
              hotelEstimatesByPlaceId: Map<string, AccommodationEstimate | null>,
            ): { hotel: EnrichedActivity; alternatives: EnrichedActivity[] } | undefined => {
              const fakeSlot: PacingSlot = {
                type: "lodging", start_time: "15:00", duration_minutes: 0, region_tag_for_queries: "primary",
              };
              const hydrated = hydrateActivity(
                {
                  slot_index: -1, slot_type: "lodging",
                  place_id: place.id, is_event: false,
                  title: raw?.title ?? place.displayName ?? "Hotel",
                  description: raw?.description ?? "",
                  pro_tip: raw?.pro_tip ?? "",
                  why_for_you: raw?.why_for_you ?? "",
                  skip_if: raw?.skip_if ?? null,
                  category: "accommodation",
                  estimated_cost_per_person: raw?.estimated_cost_per_person ?? 0,
                  dietary_notes: raw?.dietary_notes ?? null,
                },
                fakeSlot, place, photoUrlByPlaceId.get(place.id) ?? [],
                currency, intent.budget_tier,
                [], baselinesByLeg.get(legIdx) ?? null,
                hotelEstimatesByPlaceId.get(place.id) ?? null,
              );
              if (!hydrated) return undefined;
              const legAffEnv: AffiliateEnv = { ...affEnv, cityHint: legs[legIdx]?.name ?? intent.destination };
              const aff = buildAffiliateUrl(place, legAffEnv, hydrated.event_url);
              hydrated.booking_url = aff.booking_url;
              hydrated.booking_partner = aff.booking_partner;
              const alternatives = buildAlternativesForLeg(legIdx, place.id, baselinesByLeg);
              try {
                send("accommodation", {
                  destination_index: legIdx,
                  hotel: hydrated,
                  alternatives,
                });
                console.log(
                  `[stream] accommodation emitted early leg=${legIdx} place_id=${place.id} ` +
                  `alternatives=${alternatives.length}`,
                );
              } catch (e) {
                console.warn("[stream.accommodation] early emit failed:", (e as Error).message);
              }
              accommodationEmittedLegs.add(legIdx);
              return { hotel: hydrated, alternatives };
            };

            interface EarlyAccommodationEntry {
              hotel: EnrichedActivity;
              alternatives: EnrichedActivity[];
            }
            // Early accommodation emit needs baselines + hotel estimates +
            // photo mirror; gate on all four so the chosen-hotel SSE event
            // already carries the Storage URL (no flash from "no photo" to
            // "photo arrived").
            const accommodationEarlyPromise: Promise<Map<number, EarlyAccommodationEntry>> = Promise.all([
              metadataPromise,
              baselinesPromise,
              hotelEstimatesPromise,
              photoMirrorPromise,
            ]).then(([res, baselinesByLeg, hotelEstimatesByPlaceId, mirroredPhotos]) => {
              photoUrlByPlaceId = mirroredPhotos;
              const out = new Map<number, EarlyAccommodationEntry>();
              const accomRaw = res.data?.accommodation;
              // Validate the metadata's pick against the lodging pool — refuses
              // non-lodging picks before they ship as a hotel card.
              const metaPlaceId = validateMetaAccommodationPlaceId(
                accomRaw?.place_id ?? null,
                venuesByPool,
              );
              // Find the leg whose pool contains metadata's place_id.
              let metaLegIdx = -1;
              if (metaPlaceId) {
                for (const [idx, m] of placeByIdByLeg.entries()) {
                  if (m.has(metaPlaceId)) { metaLegIdx = idx; break; }
                }
              }
              for (const leg of legs) {
                if (leg.kind !== "destination") continue;
                let placeId: string | null = null;
                let raw: typeof accomRaw | null = null;
                if (metaLegIdx === leg.index && metaPlaceId) {
                  placeId = metaPlaceId;
                  raw = accomRaw ?? null;
                } else {
                  placeId = accomByLeg.get(leg.index) ?? null;
                }
                if (!placeId) continue;
                const place = placeById.get(placeId) ?? null;
                if (!place) continue;
                const emitted = emitOneLegAccommodation(leg.index, place, raw, baselinesByLeg, hotelEstimatesByPlaceId);
                if (emitted) out.set(leg.index, emitted);
              }
              return out;
            }).catch((e) => {
              console.warn("[stream.accommodation] early hydrate failed:", (e as Error).message);
              return new Map<number, EarlyAccommodationEntry>();
            });

            // Await baselines + hotel estimates + photo mirror before
            // hydrating any day. All three fetches fired alongside metadata
            // + day-rank calls; on cache hit they resolve in ~50ms, on miss
            // ~1-3s — well under the rank step's 5-30s critical path.
            // Failures resolve to empty entries; clamps fall through to
            // baselines and PR #264's hardcoded bands, and photos to [].
            const [baselinesByLeg, hotelEstimatesByPlaceId, mirroredPhotos] = await Promise.all([
              baselinesPromise, hotelEstimatesPromise, photoMirrorPromise,
            ]);
            // Same Map identity is reused if accommodationEarlyPromise
            // already assigned; harmless re-assignment otherwise.
            photoUrlByPlaceId = mirroredPhotos;

            if (sequentialRanking) {
              let budgetExhausted = false;
              for (const day of skeleton) {
                if (!budgetExhausted) {
                  const remainingMs =
                    PIPELINE_WALL_CLOCK_MS - (Date.now() - pipelineStartedAt) - PIPELINE_TIMEOUT_BUFFER_MS;
                  if (remainingMs <= 0) {
                    budgetExhausted = true;
                    console.warn(
                      `[stream.rank] remaining_budget_exhausted ` +
                      `day_number=${day.day_number} numDays=${numDays} ` +
                      `elapsed_ms=${Date.now() - pipelineStartedAt} ` +
                      `pipeline_budget_ms=${PIPELINE_WALL_CLOCK_MS} ` +
                      `skipping_remaining_days=true`,
                    );
                  }
                }
                if (budgetExhausted) {
                  fallbackDays++;
                  hydrateAndEmit(null, day, "fallback", baselinesByLeg);
                  continue;
                }
                const avoidIds = Array.from(getSeenForLeg(day.destination_index));
                const settled = await rankOneDayStream(day, avoidIds);
                if (settled.source === "fallback") fallbackDays++;
                hydrateAndEmit(settled.raw, day, settled.source, baselinesByLeg);
              }
            } else {
              const dayPromises = skeleton.map((day) =>
                rankOneDayStream(day, []).then((res) => ({ day, ...res }))
              );
              for (const p of dayPromises) {
                const settled = await p;
                if (settled.source === "fallback") fallbackDays++;
                hydrateAndEmit(settled.raw, settled.day, settled.source, baselinesByLeg);
              }
            }
            ranked_days.sort((a, b) => a.day_number - b.day_number);
            tStage("rank_and_enrich", tRank);

            // Trip-wide drop threshold check (mirrors validateActivities).
            // Skeleton-fallback days don't count as "dropped" — they're
            // intentionally empty, not garbage. Only real validation drops
            // count against the threshold. A fully-empty result
            // (`totalBefore === 0`) — every day fell back to skeleton AND
            // produced zero activities — is refused outright (per PR #225)
            // so the empty payload never reaches ai_response_cache.
            const totalBefore = ranked_days.reduce((n, d) => n + d.activities.length, 0) + totalDropped;
            if (totalBefore === 0) {
              throw new Error("Ranker returned 0 activities for the whole trip — refusing to cache empty result");
            }
            if (totalDropped / totalBefore > VALIDATION_DROP_THRESHOLD) {
              throw new Error(`Validation dropped ${totalDropped}/${totalBefore} activities (>${(VALIDATION_DROP_THRESHOLD * 100).toFixed(0)}%) — pool too thin`);
            }
            if (fallbackDays > 0) {
              console.warn(`[stream.rank] ${fallbackDays}/${numDays} days fell back to skeleton-only`);
            }
            const totalKept = ranked_days.reduce((n, d) => n + d.activities.length, 0);
            console.log(
              `[stream.rank] summary mode=${sequentialRanking ? "sequential" : "parallel"} ` +
              `days=${numDays} total_activities=${totalKept} dropped=${totalDropped} ` +
              `fallback_days=${fallbackDays} thin_days=${thinDays}`,
            );

            // ---- Metadata + accommodation ----
            send("stage_progress", {
              stage: "finalizing",
              user_text: "Final touches",
              percent_complete: 95,
            });
            console.log("[stream] stage_progress: finalizing (95%)");
            const metadataResult = await metadataPromise;
            const meta = metadataResult.data;

            // ---- Per-leg accommodation hydration. The early-emit promise
            // already streamed `accommodation` events for every leg whose
            // pool had a candidate; we await its result map here so the
            // final destinations[] assembly can reuse the same hydrated
            // EnrichedActivity instances. Legs without an early-emit (rare
            // — only when hydrateActivity returned null at early time) get
            // a late fallback emit below. ----
            const earlyAccommodations = await accommodationEarlyPromise;
            const fakeAccomSlot: PacingSlot = {
              type: "lodging", start_time: "15:00", duration_minutes: 0, region_tag_for_queries: "primary",
            };
            const accomRaw = meta?.accommodation;
            const metaAccomPlaceId = validateMetaAccommodationPlaceId(
              accomRaw?.place_id ?? null,
              venuesByPool,
            );
            const metaAccomLegIdx = (() => {
              if (!metaAccomPlaceId) return -1;
              for (const [idx, m] of placeByIdByLeg.entries()) {
                if (m.has(metaAccomPlaceId)) return idx;
              }
              return -1;
            })();
            const hydrateAccomForLegStream = (
              legIdx: number,
            ): { hotel: EnrichedActivity; alternatives: EnrichedActivity[] } | undefined => {
              // Prefer the early-emitted instance so the SSE event and
              // assembly references are the same EnrichedActivity object.
              const early = earlyAccommodations.get(legIdx);
              if (early) return early;
              const placeId = (legIdx === metaAccomLegIdx && metaAccomPlaceId)
                ? metaAccomPlaceId
                : accomByLeg.get(legIdx) ?? null;
              if (!placeId) return undefined;
              const place = placeById.get(placeId) ?? null;
              if (!place) return undefined;
              const useMeta = legIdx === metaAccomLegIdx && accomRaw;
              const legBaselines = baselinesByLeg.get(legIdx) ?? null;
              const hotelEstimate = hotelEstimatesByPlaceId.get(placeId) ?? null;
              const hydrated = hydrateActivity(
                {
                  slot_index: -1, slot_type: "lodging",
                  place_id: placeId, is_event: false,
                  title: useMeta ? (accomRaw!.title ?? place.displayName ?? "Hotel") : (place.displayName ?? "Hotel"),
                  description: useMeta ? (accomRaw!.description ?? "") : "",
                  pro_tip: useMeta ? (accomRaw!.pro_tip ?? "") : "",
                  why_for_you: useMeta ? (accomRaw!.why_for_you ?? "") : "",
                  skip_if: useMeta ? (accomRaw!.skip_if ?? null) : null,
                  category: "accommodation",
                  estimated_cost_per_person: useMeta ? (accomRaw!.estimated_cost_per_person ?? 0) : 0,
                  dietary_notes: useMeta ? (accomRaw!.dietary_notes ?? null) : null,
                },
                fakeAccomSlot, place, photoUrlByPlaceId.get(place.id) ?? [],
                currency, intent.budget_tier,
                [], legBaselines, hotelEstimate,
              );
              if (!hydrated) return undefined;
              // Per-leg cityHint for the booking URL.
              const legAffEnv: AffiliateEnv = { ...affEnv, cityHint: legs[legIdx]?.name ?? intent.destination };
              const aff = buildAffiliateUrl(place, legAffEnv, hydrated.event_url);
              hydrated.booking_url = aff.booking_url;
              hydrated.booking_partner = aff.booking_partner;
              const alternatives = buildAlternativesForLeg(legIdx, place.id, baselinesByLeg);
              // Late fallback emit: the early promise didn't cover this leg
              // (hydrateActivity returned null at early time); now that
              // everything is settled, emit so the streaming UI updates
              // before trip_complete.
              if (!accommodationEmittedLegs.has(legIdx)) {
                try {
                  send("accommodation", {
                    destination_index: legIdx,
                    hotel: hydrated,
                    alternatives,
                  });
                  accommodationEmittedLegs.add(legIdx);
                } catch {}
              }
              return { hotel: hydrated, alternatives };
            };
            // Trip-level accommodation = leg 0's accommodation (matches legacy
            // shape; trip_complete still emits a single accommodation field).
            const accommodationEntry = hydrateAccomForLegStream(0);
            const accommodation: EnrichedActivity | undefined = accommodationEntry?.hotel;


            // ---- Grounded title + summary (overwrites parallel-metadata's copy) ----
            // See rankInParallel for rationale: parallel metadata writes copy
            // from the candidate pool and can name venues that didn't survive
            // the day rankers. Re-run with the actual itinerary venues as a
            // strict allowlist. Failure path falls back to parallel-metadata
            // copy.
            const venueAllowlist = collectVenueAllowlist(ranked_days);
            const accommodationName = accommodation?.title?.trim() || (accommodation?.place_id ? placeById.get(accommodation.place_id)?.displayName ?? null : null);
            const groundedCopy = await rankTripCopy(
              anthropicKey, intent, intent.destination, venueAllowlist, accommodationName, currency, numDays, pipelineStartedAt,
            ).then(async (res) => {
              if (res.usage) {
                await logger.log({
                  feature: "trip_builder_rank_copy", model: HAIKU_MODEL,
                  input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
                  cost_usd: computeHaikuCost(res.usage),
                  cached: res.usage.cache_read_input_tokens > 0,
                }).catch(() => {});
              }
              return res.data;
            }).catch((e) => {
              console.warn("[stream.copy] grounded copy failed, falling back to parallel-metadata copy:", (e as Error).message);
              return null;
            });

            // ---- Trip-level rollups + junto picks ----
            const total_activities = ranked_days.reduce((n, d) => n + d.activities.length, 0);
            const dailySpend = ranked_days.map((d) => d.activities.reduce((s, a) => s + (a.estimated_cost_per_person || 0), 0));
            const daily_budget_estimate = ranked_days.length > 0
              ? Math.round(dailySpend.reduce((s, n) => s + n, 0) / ranked_days.length)
              : 0;

            const finalTitle = stripEmojis(groundedCopy?.trip_title) || stripEmojis(meta?.trip_title) || intent.destination;
            const finalSummary = (groundedCopy?.trip_summary?.trim() || meta?.trip_summary?.trim()) ?? "";

            // ---- Assemble RankedDestination[] = unified leg list. Each leg
            // gets the days that belong to it plus accommodation (real legs
            // only). Mirrors rankInParallel's output assembly. ----
            const destinationsAssembled: RankedDestination[] = legs.map((leg) => {
              const legDays = ranked_days
                .filter((d) => d.destination_index === leg.index)
                .sort((a, b) => a.day_number - b.day_number);
              const startDate = legDays[0]?.date ?? "";
              const endDate = legDays[legDays.length - 1]?.date ?? "";
              if (leg.kind === "transit") {
                return {
                  name: leg.name,
                  start_date: startDate,
                  end_date: endDate,
                  intro: leg.transit_meta?.description ?? "",
                  days: legDays,
                  kind: "transit",
                  ...(leg.transit_meta ? { transit: leg.transit_meta } : {}),
                };
              }
              const accom = hydrateAccomForLegStream(leg.index);
              return {
                name: leg.name,
                start_date: startDate,
                end_date: endDate,
                intro: legs.length === 1 ? finalSummary : "",
                days: legDays,
                accommodation: accom?.hotel,
                accommodation_alternatives: accom?.alternatives ?? [],
                kind: "destination",
                price_baselines: baselinesByLeg.get(leg.index) ?? null,
              };
            });
            const pipelineResult: PipelineResult = {
              trip_title: finalTitle,
              trip_summary: finalSummary,
              destinations: destinationsAssembled,
              map_center: computeMapCenter(geos),
              map_zoom: computeMapZoom(geos),
              daily_budget_estimate,
              trip_total_estimate: computeTripTotalEstimate(destinationsAssembled),
              daily_living_additive_eur: computeDailyLivingAdditiveEur(destinationsAssembled),
              currency,
              packing_suggestions: Array.isArray(meta?.packing_suggestions) ? meta!.packing_suggestions.slice(0, 10) : [],
              total_activities,
              budget_tier: intent.budget_tier,
              adjustment_notice: intent.adjustment_notice ?? null,
            };

            markJuntoPicks(pipelineResult, intent);
            logVibeCoverage(pipelineResult, intent);
            logDescriptionGrounding(pipelineResult, intent);
            logOpeningHoursViolations(pipelineResult);
            logPricingAnomalies(pipelineResult);

            // ---- Budget sanity check (Haiku, ~$0.0005/trip, 30-day cache).
            // Backstop only: PR #261's computeTripTotalEstimate is the source
            // of truth. The validator's range is consulted; only EXTREME
            // outliers (>50% below low or >100% above high) get the midpoint
            // substitution. Failures are non-fatal — pipelineResult keeps the
            // calculated value with estimation_method="calculated". ----
            const budgetValidation = await validateBudgetEstimate(
              anthropicKey,
              realDestinationNames(destinationsAssembled),
              realDestinationDayCount(destinationsAssembled),
              intent.budget_tier,
              pipelineResult.trip_total_estimate,
              svcClient,
              logger,
              pipelineStartedAt,
            );
            applyBudgetSanityCheck(pipelineResult, budgetValidation);

            const juntoPlaceIds: string[] = [];
            for (const day of ranked_days) {
              for (const a of day.activities) if (a.is_junto_pick && a.place_id) juntoPlaceIds.push(a.place_id);
            }

            // ---- Image (await final URL) ----
            const destinationImageUrl = await imagePromise;

            // ISO-3166-1 alpha-2 destination country, derived from the geocode
            // step. Mirrors the non-streaming path (see `destinationCountryIso`
            // below) so cache entries written here are interchangeable with
            // entries written by the non-stream branch.
            const destinationCountryIso = geo.country_code
              ? geo.country_code.toUpperCase()
              : null;

            // ---- Cache write ----
            const responsePayload: Record<string, unknown> = {
              ...pipelineResult,
              destination_image_url: destinationImageUrl,
              destination_country_iso: destinationCountryIso,
            };
            const tCacheWrite = Date.now();
            console.log(
              `[stream.cache] write key=${cacheKey} raw_inputs=${JSON.stringify(cacheKeyShape)}`,
            );
            const { error: cacheInsErr } = await svcClient.from("ai_response_cache").insert({
              cache_key: cacheKey, response_json: responsePayload,
              expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            });
            if (cacheInsErr) {
              console.error("[stream] cache insert failed:", cacheInsErr);
              // Non-fatal at this point — we've already streamed days and are about to send trip_complete.
            }
            tStage("cache_write", tCacheWrite);

            // ---- Anonymous persistence (before trip_complete so the id can
            // ride along with the final SSE event) ----
            let streamAnonTripId: string | null = null;
            if (isAnonymous && anonSessionId) {
              streamAnonTripId = await persistAnonymousTrip(
                svcClient as unknown as AnonStorageClient,
                {
                  anonSessionId,
                  prompt: typeof body.free_text === "string" ? body.free_text : null,
                  sourceIp: clientIp,
                  payload: responsePayload,
                },
              );
            }

            logBudgetRollup(
              destinationsAssembled,
              pipelineResult.trip_total_estimate,
              pipelineResult.daily_living_additive_eur ?? 0,
              pipelineResult.expected_range_eur ?? null,
              pipelineResult.estimation_method,
              currency,
            );

            // ---- Final event ----
            send("trip_complete", {
              trip_title: pipelineResult.trip_title,
              trip_summary: pipelineResult.trip_summary,
              accommodation: accommodation ?? null,
              packing_suggestions: pipelineResult.packing_suggestions,
              junto_pick_place_ids: juntoPlaceIds,
              daily_budget_estimate,
              trip_total_estimate: pipelineResult.trip_total_estimate,
              daily_living_additive_eur: pipelineResult.daily_living_additive_eur ?? 0,
              estimation_method: pipelineResult.estimation_method ?? "calculated",
              expected_range_eur: pipelineResult.expected_range_eur ?? null,
              total_activities,
              map_center: pipelineResult.map_center,
              map_zoom: pipelineResult.map_zoom,
              currency,
              budget_tier: pipelineResult.budget_tier,
              destination_image_url: destinationImageUrl,
              destination_country_iso: destinationCountryIso,
              adjustment_notice: pipelineResult.adjustment_notice ?? null,
              from_cache: false,
              ...(streamAnonTripId ? { anon_trip_id: streamAnonTripId } : {}),
            });

            // ---- Logging (async, best-effort, after we've sent the final event) ----
            const totals = logger.totals();
            const durationMs = Date.now() - pipelineStartedAt;
            const totalRankingCalls = rankingStats.live_calls + rankingStats.cache_hits;
            const totalDetailsCalls = hydrationStats.live_calls + hydrationStats.cache_hits;
            const totalCacheHits = rankingStats.cache_hits + hydrationStats.cache_hits;
            const totalPlacesCalls = totalRankingCalls + totalDetailsCalls;
            const modelLabel =
              `aggregate_stream;duration_ms=${durationMs}` +
              `;places_ranking=${rankingStats.live_calls}/${totalRankingCalls}` +
              `;places_details=${hydrationStats.live_calls}/${totalDetailsCalls}` +
              `;places_cache_hits=${totalCacheHits}/${totalPlacesCalls || 1}` +
              `;sub_calls=${totals.call_count}`;
            await svcClient.from("ai_request_log").insert({
              user_id: actorUserId, feature: "trip_builder_total", model: modelLabel,
              input_tokens: totals.input_tokens, output_tokens: totals.output_tokens,
              cost_usd: totals.cost_usd, cached: false,
            }).then((r: { error: { message: string } | null }) => {
              if (r.error) console.error("[stream.ai_request_log] insert failed:", r.error);
            });
            await svcClient.from("analytics_events").insert({
              event_name: "ai_trip_builder", user_id: actorUserId,
              properties: {
                source: "generated_stream", destination: intent.destination, days: numDays,
                budget_level: intent.budget_tier, pace: intent.pace, duration_ms: durationMs,
                places_ranking_live: rankingStats.live_calls, places_ranking_cache: rankingStats.cache_hits,
                places_details_live: hydrationStats.live_calls, places_details_cache: hydrationStats.cache_hits,
                llm_cost_usd: totals.cost_usd, days_emitted_streaming: emittedDayNumbers.size,
                anonymous: isAnonymous,
              },
            });

            console.log(
              `[timing-summary] ${JSON.stringify({
                total_ms: durationMs, cache_hit: false, stream: true,
                destination: intent.destination, num_days: numDays,
                queries: queries.length, finalists: finalistIds.length,
                stages: stageTimings,
              })}`,
            );
          } catch (e) {
            console.error("[stream] pipeline error:", e);
            const err = e as Error;
            const isPipelineErr = err instanceof PipelineError;
            send("error", {
              error: "trip_build_failed",
              step: isPipelineErr ? (err as PipelineError).step : stepLabel,
              message: isPipelineErr ? (err as PipelineError).userMessage : "Something went wrong building your trip. Please try again.",
            });
            if (svcClientForLogging) {
              logGenerationError(svcClientForLogging, {
                user_id: loggedUserId, destination: loggedDestination,
                step: isPipelineErr ? (err as PipelineError).step : stepLabel,
                error_message: isPipelineErr ? (err as PipelineError).userMessage : err?.message ?? String(err),
                error_raw: {
                  name: err?.name ?? "Error", message: err?.message ?? String(err),
                  stack: err?.stack ?? null, is_pipeline_error: isPipelineErr, stream: true,
                },
                duration_ms: Date.now() - requestStartedAt,
              }).catch(() => {});
            }
          }
            // ping/close teardown lives on the outer .finally() attached to
            // runStreamingPipeline()'s promise (see start() above).
          }
        },
        cancel() {
          closedRef.closed = true;
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          "x-accel-buffering": "no",
          "connection": "keep-alive",
        },
      });
    }

    // ---- Step 1: parse intent (in parallel with geocode on non-surprise mode) ----
    // In surprise mode we pass an empty destination hint — the surprise picker
    // runs next with the parsed vibes/must_haves/must_avoids and fills in
    // intent.destination. This ordering means the picker sees the same
    // extracted must_avoids the ranker will later enforce.
    //
    // Perf: when the user typed a destination, geocoding rawDest is independent
    // of intent extraction. Kick geocode off in parallel and await later.
    // Trades a fraction of a Places API call on cache hits (~$0.005) for ~1.5s
    // off cold-cache TTFB. Geocode is itself cached for 30 days, so a hot
    // destination pays nothing.
    const tParseIntent = Date.now();
    const earlyGeocodePromise: Promise<GeocodeResult> | null = !surpriseMe && rawDest
      ? geocodeDestination(googleKey, rawDest, svcClient, actorUserId).catch((e) => {
          // Surface the rejection later when we await — not now.
          throw e;
        })
      : null;
    loggedStep = "parseIntent";
    checkPipelineTimeout(pipelineStartedAt, loggedStep);
    const intent = await parseIntent(
      anthropicKey,
      body,
      surpriseMe ? "" : rawDest,
      logger,
      pipelineStartedAt,
    );
    tStage("parse_intent", tParseIntent);
    applyIntentDuration(intent);
    if (intent.destination) loggedDestination = intent.destination;

    // Free-text-only flow: parseIntent leaves destination empty (the system
    // prompt requires it). Recover from named_destinations[0].
    if (!surpriseMe && !rawDest) {
      ensureDerivedDestination(intent);
      loggedDestination = intent.destination;
    }

    // ---- Step 1.5: surprise destination picker (only when surprise_me) ----
    if (surpriseMe) {
      if (applyNamedDestination(intent)) {
        loggedDestination = intent.destination;
      } else {
        loggedStep = "pickSurpriseDestination";
        checkPipelineTimeout(pipelineStartedAt, loggedStep);
        const tSurprise = Date.now();
        intent.destination = await pickSurpriseDestination(
          anthropicKey,
          intent,
          numDays,
          logger,
          pipelineStartedAt,
        );
        tStage("pick_surprise", tSurprise);
        loggedDestination = intent.destination;
      }
    }

    // ---- Multi-destination materialization + transit estimation ----
    buildIntentDestinations(intent, numDays);
    if (intent.destinations.length >= 2) {
      loggedStep = "estimateTransitLegs";
      const tTransit = Date.now();
      intent.transit_legs = await estimateTransitLegs(
        anthropicKey, intent.destinations, svcClient, logger, pipelineStartedAt,
      );
      tStage("estimate_transit", tTransit);
    }

    // ---- Cache check by raw-body hash (BEFORE Places spend) ----
    loggedStep = "cacheLookup";
    checkPipelineTimeout(pipelineStartedAt, loggedStep);
    const tCacheLookup = Date.now();
    const monthBucket = extractMonthBucket(startDate);
    const { key: cacheKey, shape: cacheKeyShape } = await buildRawCacheKey(
      body,
      numDays,
      startDate,
      surpriseMe ? intent.destination : undefined,
    );
    console.log(
      `[nonstream.cache] read key=${cacheKey} raw_inputs=${JSON.stringify(cacheKeyShape)}`,
    );
    {
      const { data: cached, error: cacheErr } = await svcClient
        .from("ai_response_cache")
        .select("response_json")
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (cacheErr) {
        // Fail loud — silent cache misses were the original bug.
        console.error("[ai_response_cache] lookup failed:", cacheErr);
        throw new Error(`ai_response_cache lookup failed: ${cacheErr.message}`);
      }
      if (cached?.response_json) {
        const payload = cached.response_json as Record<string, any>;
        // Cache validation: sum days across ALL legs (v3 unified-leg shape).
        const cachedDestsArr = Array.isArray(payload?.destinations) ? payload.destinations : [];
        const cachedDayCount: number = cachedDestsArr.reduce(
          (n: number, d: any) => n + (Array.isArray(d?.days) ? d.days.length : 0),
          0,
        );
        if (cachedDayCount !== numDays) {
          console.log(
            `[nonstream.cache] miss cache_key=${cacheKey} reason=day_count_mismatch cached=${cachedDayCount} requested=${numDays}`,
          );
        } else {
          tStage("cache_lookup_hit", tCacheLookup);
          rewriteCachedPayloadDates(payload, startDate);
          const cacheAffEnv: AffiliateEnv = {
            viator: viatorMcid,
            gyg: gygPid,
            awinPublisherId,
            awinMerchantId: awinBookingMid,
            tripId: tripIdForClickref,
            checkin: startDate,
            checkout: endDate,
            cityHint: intent.destination,
          };
          const bookingRewriteStats = rewriteCachedBookingUrls(payload, cacheAffEnv);
          markJuntoPicks(payload as unknown as PipelineResult, intent);
          logVibeCoverage(payload as unknown as PipelineResult, intent);
          logDescriptionGrounding(payload as unknown as PipelineResult, intent);
          logOpeningHoursViolations(payload as unknown as PipelineResult);
          logPricingAnomalies(payload as unknown as PipelineResult);
          let juntoPicksTagged = 0;
          for (const dest of cachedDestsArr) {
            for (const day of dest?.days ?? []) {
              for (const a of day.activities ?? []) if (a?.is_junto_pick) juntoPicksTagged++;
            }
          }
          const eventsResult = await refreshCachedEvents(
            payload,
            intent,
            startDate,
            endDate,
            svcClient,
            logger,
          );
          console.log(
            `[nonstream.cache] hit cache_key=${cacheKey} month_bucket=${monthBucket} date_swap=true events_refreshed=${eventsResult.refreshed} events_cleared=${eventsResult.cleared} booking_urls_rewritten=${bookingRewriteStats.rewritten}`,
          );
          console.log(`[nonstream.cache] junto_picks_tagged=${juntoPicksTagged}`);

          // Budget sanity check on the cached payload. Recompute the total
          // from the cached destinations[] when the cached field is missing
          // (legacy entries pre-PR multi-destination).
          const cachedTripTotalNonStream = typeof payload?.trip_total_estimate === "number"
            ? payload.trip_total_estimate
            : computeTripTotalEstimate(cachedDestsArr as unknown as RankedDestination[]);
          // Daily-living additive: prefer cached value, otherwise recompute
          // from the cached destinations[] (yields 0 if no price_baselines on
          // the cached legs, e.g. pre-PR cache rows — that's intentional).
          const cachedDailyLivingNonStream = typeof payload?.daily_living_additive_eur === "number"
            ? payload.daily_living_additive_eur
            : computeDailyLivingAdditiveEur(cachedDestsArr as unknown as RankedDestination[]);
          const cacheHitBudgetValidationNonStream = await validateBudgetEstimate(
            anthropicKey,
            realDestinationNames(cachedDestsArr as Array<{ name: string; kind?: string }>),
            realDestinationDayCount(cachedDestsArr as Array<{ days?: unknown; kind?: string }>),
            payload?.budget_tier ?? intent.budget_tier,
            cachedTripTotalNonStream,
            svcClient,
            logger,
            pipelineStartedAt,
          );
          const cacheHitFakeResultNonStream: PipelineResult = {
            ...(payload as unknown as PipelineResult),
            trip_total_estimate: cachedTripTotalNonStream,
            daily_living_additive_eur: cachedDailyLivingNonStream,
          };
          applyBudgetSanityCheck(cacheHitFakeResultNonStream, cacheHitBudgetValidationNonStream);
          payload.trip_total_estimate = cacheHitFakeResultNonStream.trip_total_estimate;
          payload.daily_living_additive_eur = cacheHitFakeResultNonStream.daily_living_additive_eur ?? 0;
          payload.estimation_method = cacheHitFakeResultNonStream.estimation_method ?? "calculated";
          payload.expected_range_eur = cacheHitFakeResultNonStream.expected_range_eur ?? null;
          logBudgetRollup(
            cachedDestsArr as unknown as RankedDestination[],
            cacheHitFakeResultNonStream.trip_total_estimate,
            cacheHitFakeResultNonStream.daily_living_additive_eur ?? 0,
            cacheHitFakeResultNonStream.expected_range_eur ?? null,
            cacheHitFakeResultNonStream.estimation_method,
            (payload?.currency as string) ?? "USD",
          );
          console.log(
            `[timing-summary] ${JSON.stringify({ total_ms: Date.now() - pipelineStartedAt, cache_hit: true, stages: stageTimings })}`,
          );
          await logger.log({
            feature: "trip_builder_cache_hit",
            model: "cache",
            input_tokens: 0,
            output_tokens: 0,
            cost_usd: 0,
            cached: true,
          });
          // Anon visitors hitting cache still need a stored row so they get
          // a viewable /trips/anon/[id] URL and the rate-limit counter
          // increments (cache hits are real generations from the user's POV).
          let anonTripId: string | null = null;
          if (isAnonymous && anonSessionId) {
            anonTripId = await persistAnonymousTrip(
              svcClient as unknown as AnonStorageClient,
              {
                anonSessionId,
                prompt: typeof body.free_text === "string" ? body.free_text : null,
                sourceIp: clientIp,
                payload: payload as Record<string, unknown>,
              },
            );
          }
          return jsonResponse({
            success: true,
            ...payload,
            ...(anonTripId ? { anon_trip_id: anonTripId } : {}),
          });
        }
      } else {
        console.log(`[nonstream.cache] miss cache_key=${cacheKey} reason=not_found month_bucket=${monthBucket}`);
      }
    }
    tStage("cache_lookup_miss", tCacheLookup);

    // ---- Step 2a: geocode (multi-leg-aware) ----
    // For single-destination trips: reuse earlyGeocodePromise when available;
    // for multi-destination trips: parallel-geocode all legs (the
    // earlyGeocodePromise covers leg 0 only when the user gave a single name).
    loggedStep = "geocodeDestination";
    checkPipelineTimeout(pipelineStartedAt, loggedStep);
    const tGeocode = Date.now();
    let geos: GeocodeResult[];
    if (intent.destinations.length === 1 && earlyGeocodePromise) {
      const earlyGeo = await earlyGeocodePromise;
      geos = [earlyGeo];
    } else {
      geos = await geocodeIntentDestinations(googleKey, intent.destinations, svcClient, actorUserId);
    }
    const geo: GeocodeResult = geos[0];
    tStage("geocode", tGeocode);

    // ---- Build the unified leg list (real + transit pseudo-legs) ----
    const legs = buildLegs(intent, geos, numDays);

    // ---- Step 2b: pacing skeleton (slot count capped inside buildSkeleton) ----
    const tSkeleton = Date.now();
    const skeleton = buildSkeleton(intent, legs, numDays, startDate);
    tStage("build_skeleton", tSkeleton);

    // ---- Step 3 + 4: query plan + Places batch (RANKING pass, Essentials SKU) ----
    const tQueryPlan = Date.now();
    const queries = buildPlacesQueries(intent, skeleton, legs);
    const queryCap = legs.filter((l) => l.kind === "destination").length <= 1
      ? MAX_PLACES_QUERIES_PER_TRIP
      : MAX_PLACES_QUERIES_PER_MULTI_TRIP;
    if (queries.length > queryCap) {
      console.warn(
        `[generate-trip-itinerary] query planner produced ${queries.length} queries, exceeding cap ${queryCap}`,
      );
    }
    tStage("build_queries", tQueryPlan);

    // Step 4 + Step 5 in parallel — events fetched per real-destination leg.
    loggedStep = "searchPlacesAndEvents";
    checkPipelineTimeout(pipelineStartedAt, loggedStep);
    const tSearch = Date.now();
    const realDestLegs = legs.filter((l) => l.kind === "destination");
    const [searchResult, ...eventsByLeg] = await Promise.all([
      searchPlacesBatch(queries, googleKey, svcClient),
      ...realDestLegs.map((leg) => {
        const legDays = skeleton.filter((d) => d.destination_index === leg.index);
        return searchEvents(leg.name, startDate, endDate, intent, legDays, svcClient, logger);
      }),
    ]);
    tStage("search_places_and_events", tSearch);
    const places = searchResult.places;
    const rankingStats = searchResult.stats;
    const events: EventCandidate[] = eventsByLeg.flat();

    // ---- Step 4b: HYDRATION pass — Place Details for ranker candidates ----
    // Rank candidates by pool membership alone is too broad; we'd re-hydrate
    // 100+ venues. Instead, pick up to computeMaxFinalists(numDays) per trip
    // from the first venues in each pool (search results come back in relevance
    // order from Google). Ranker still has coverage (breakfast, restaurants,
    // attractions, etc.) while we pay Details cost only for the shortlist.
    const finalistIds: string[] = [];
    const seenFinalist = new Set<string>();
    const byPool = new Map<PoolKey, BatchPlaceResult[]>();
    for (const p of places) {
      const pool = byPool.get(p.poolKey) ?? [];
      pool.push(p);
      byPool.set(p.poolKey, pool);
    }
    const maxFinalists = computeMaxFinalists(numDays);
    const maxPerPool = Math.max(3, Math.ceil(maxFinalists / Math.max(1, byPool.size)));
    for (const pool of byPool.values()) {
      for (const p of pool.slice(0, maxPerPool)) {
        if (seenFinalist.has(p.id)) continue;
        seenFinalist.add(p.id);
        finalistIds.push(p.id);
        if (finalistIds.length >= maxFinalists) break;
      }
      if (finalistIds.length >= maxFinalists) break;
    }
    const idToBase = new Map<string, BatchPlaceResult>();
    for (const p of places) idToBase.set(p.id, p);
    const tHydrate = Date.now();
    const { hydrated: hydratedById, stats: hydrationStats } = await hydrateFinalists(
      finalistIds,
      idToBase,
      googleKey,
      svcClient,
    );
    tStage("hydrate_finalists", tHydrate);

    // Tier-aware cost instrumentation — one row per SKU category.
    await logPlacesByTier(svcClient, logger, actorUserId, {
      search_essentials_live: rankingStats.live_calls,
      search_essentials_cache: rankingStats.cache_hits,
      details_live: hydrationStats.live_calls,
      details_cache: hydrationStats.cache_hits,
    });

    // Merge hydrated copies back into the ranker pool so rating / priceLevel /
    // photos are available when the ranker writes editorial copy.
    for (let i = 0; i < places.length; i++) {
      const hydrated = hydratedById.get(places[i].id);
      if (hydrated) places[i] = hydrated;
    }

    // Group venues by pool for the ranker prompt
    const venuesByPool = new Map<PoolKey, BatchPlaceResult[]>();
    for (const p of places) {
      const pool = venuesByPool.get(p.poolKey) ?? [];
      pool.push(p);
      venuesByPool.set(p.poolKey, pool);
    }
    const allPlacesById = new Map<string, BatchPlaceResult>();
    for (const p of places) allPlacesById.set(p.id, p);

    // ---- Resolve destination cover image — kick off in parallel with rank ----
    // The image fetch (Place Photos + Wikimedia fallback) is best-effort and
    // contributes ~1-2s when not cached. Running it concurrently with the
    // 30-50s rankAndEnrich call hides its latency entirely.
    const tImage = Date.now();
    const destinationImageUrlPromise: Promise<string | null> = resolveDestinationImageUrl(
      geo.place_id ?? null,
      intent.destination,
      googleKey,
      svcClient,
    ).catch((e) => {
      console.warn(
        "[generate-trip-itinerary] resolveDestinationImageUrl threw:",
        (e as Error).message,
      );
      return null;
    });

    // ---- Step 6: rank + enrich (N parallel per-day calls + 1 metadata call) ----
    loggedStep = "rankAndEnrich";
    checkPipelineTimeout(pipelineStartedAt, loggedStep);
    const tRank = Date.now();
    const ranked = await rankInParallel(
      anthropicKey,
      intent,
      skeleton,
      legs,
      venuesByPool,
      events,
      googleKey,
      geos,
      startDate,
      endDate,
      logger,
      pipelineStartedAt,
      svcClient,
    );
    tStage("rank_and_enrich", tRank);

    // ---- Step 7-9: junto picks, affiliate URLs, validation ----
    const tJunto = Date.now();
    markJuntoPicks(ranked, intent);
    logVibeCoverage(ranked, intent);
    logDescriptionGrounding(ranked, intent);
    logOpeningHoursViolations(ranked);
    logPricingAnomalies(ranked);

    const affEnv: AffiliateEnv = {
      viator: viatorMcid,
      gyg: gygPid,
      awinPublisherId,
      awinMerchantId: awinBookingMid,
      tripId: tripIdForClickref,
      checkin: startDate,
      checkout: endDate,
      cityHint: intent.destination,
    };
    // Per-leg affiliate decoration: each leg's hotel + activity URLs use
    // THAT leg's city as the cityHint, so a multi-destination trip's Bangkok
    // hotel link queries Bangkok and the Koh Phangan hotel link queries
    // Koh Phangan. ranked.destinations[i].name aligns with legs[i].name.
    for (let legIdx = 0; legIdx < ranked.destinations.length; legIdx++) {
      const dest = ranked.destinations[legIdx];
      const legAffEnv: AffiliateEnv = {
        ...affEnv,
        cityHint: dest.name || intent.destination,
      };
      const decorate = (a: EnrichedActivity) => {
        const place = a.place_id ? allPlacesById.get(a.place_id) ?? null : null;
        const aff = buildAffiliateUrl(place, legAffEnv, a.event_url);
        a.booking_url = aff.booking_url;
        a.booking_partner = aff.booking_partner;
      };
      if (dest.accommodation) decorate(dest.accommodation);
      if (Array.isArray(dest.accommodation_alternatives)) {
        for (const alt of dest.accommodation_alternatives) decorate(alt);
      }
      for (const day of dest.days) {
        for (const act of day.activities) decorate(act);
      }
    }

    tStage("junto_and_affiliate", tJunto);

    loggedStep = "validateActivities";
    const tValidate = Date.now();
    const legCenters = new Map<number, { lat: number; lng: number; radiusKm: number }>();
    for (const leg of legs) {
      if (leg.geo) {
        legCenters.set(leg.index, {
          lat: leg.geo.lat,
          lng: leg.geo.lng,
          radiusKm: validationRadiusKm(leg.geo),
        });
      }
    }
    const validated = validateActivities(
      ranked, allPlacesById,
      { lat: geo.lat, lng: geo.lng, radiusKm: validationRadiusKm(geo) },
      legCenters,
    );
    // Recompute trip_total_estimate + daily-living additive after validation
    // drops so the budget sanity check sees the final numbers that ship in
    // the response.
    validated.trip_total_estimate = computeTripTotalEstimate(validated.destinations);
    validated.daily_living_additive_eur = computeDailyLivingAdditiveEur(validated.destinations);
    tStage("validate", tValidate);

    // ---- Budget sanity check (Haiku, ~$0.0005/trip, 30-day cache).
    // Backstop only: PR #261's computeTripTotalEstimate is the source of
    // truth. Failures are non-fatal — `validated` keeps the calculated
    // value with estimation_method="calculated". ----
    const budgetValidationNonStream = await validateBudgetEstimate(
      anthropicKey,
      realDestinationNames(validated.destinations),
      realDestinationDayCount(validated.destinations),
      validated.budget_tier,
      validated.trip_total_estimate,
      svcClient,
      logger,
      pipelineStartedAt,
    );
    applyBudgetSanityCheck(validated, budgetValidationNonStream);
    logBudgetRollup(
      validated.destinations,
      validated.trip_total_estimate,
      validated.daily_living_additive_eur ?? 0,
      validated.expected_range_eur ?? null,
      validated.estimation_method,
      validated.currency,
    );

    // ---- Resolve destination cover image (kicked off in parallel with rank) ----
    // The promise was started before rankAndEnrich; awaited here. Failures are
    // swallowed inside the promise and resolve to null — the frontend falls
    // back to its legacy keyword table.
    const destinationImageUrl: string | null = await destinationImageUrlPromise;
    tStage("resolve_destination_image", tImage);

    // ISO-3166-1 alpha-2 destination country, derived from the geocode step.
    // Persisted to trips.destination_country_iso when a trip is created from
    // this result so get-entry-requirements can resolve the destination by
    // trip_id without re-parsing the free-text destination string. We don't
    // fail the pipeline if it's missing — log a warning and let the column
    // stay null; the visa lookup will gracefully require the client to pass
    // destination_country directly in that case.
    const destinationCountryIso = geo.country_code
      ? geo.country_code.toUpperCase()
      : null;
    if (!destinationCountryIso) {
      console.warn(
        "[generate-trip-itinerary] geocode returned no country_code; " +
          "trips.destination_country_iso will be null for this trip",
      );
    }

    const responsePayload: Record<string, unknown> = {
      ...validated,
      destination_image_url: destinationImageUrl,
      destination_country_iso: destinationCountryIso,
    };

    // ---- Cache write (fail loud, AFTER validation passes) ----
    const tCacheWrite = Date.now();
    console.log(
      `[nonstream.cache] write key=${cacheKey} raw_inputs=${JSON.stringify(cacheKeyShape)}`,
    );
    {
      const { error: cacheInsErr } = await svcClient.from("ai_response_cache").insert({
        cache_key: cacheKey,
        response_json: responsePayload,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
      if (cacheInsErr) {
        console.error("[ai_response_cache] insert failed:", cacheInsErr);
        throw new Error(`ai_response_cache insert failed: ${cacheInsErr.message}`);
      }
    }
    tStage("cache_write", tCacheWrite);

    // Final breakdown — single JSON line so cold-cache runs can be diagnosed
    // from a single log search. cumulative_ms in each stage line gives the
    // running clock; this summary makes ratios easy to read.
    console.log(
      `[timing-summary] ${JSON.stringify({
        total_ms: Date.now() - pipelineStartedAt,
        cache_hit: false,
        destination: intent.destination,
        num_days: numDays,
        queries: queries.length,
        finalists: finalistIds.length,
        stages: stageTimings,
      })}`,
    );

    // ---- Aggregated total log — one row per successful trip build ----
    // ai_request_log is a flat table; we pack wall-time (ms) and per-tier
    // Places call counts into the model label so downstream SQL can grep
    // per-trip cost detail without a migration bump. The hit rate gives
    // immediate visibility into cache effectiveness after rollout.
    {
      const totals = logger.totals();
      const durationMs = Date.now() - pipelineStartedAt;
      const totalRankingCalls = rankingStats.live_calls + rankingStats.cache_hits;
      const totalDetailsCalls = hydrationStats.live_calls + hydrationStats.cache_hits;
      const totalCacheHits = rankingStats.cache_hits + hydrationStats.cache_hits;
      const totalPlacesCalls = totalRankingCalls + totalDetailsCalls;
      const modelLabel =
        `aggregate;duration_ms=${durationMs}` +
        `;places_ranking=${rankingStats.live_calls}/${totalRankingCalls}` +
        `;places_details=${hydrationStats.live_calls}/${totalDetailsCalls}` +
        `;places_cache_hits=${totalCacheHits}/${totalPlacesCalls || 1}` +
        `;sub_calls=${totals.call_count}`;
      const { error: totalErr } = await svcClient.from("ai_request_log").insert({
        user_id: actorUserId,
        feature: "trip_builder_total",
        model: modelLabel,
        input_tokens: totals.input_tokens,
        output_tokens: totals.output_tokens,
        cost_usd: totals.cost_usd,
        cached: false,
      });
      if (totalErr) {
        console.error("[ai_request_log] trip_builder_total insert failed:", totalErr);
        throw new Error(`ai_request_log trip_builder_total insert failed: ${totalErr.message}`);
      }
    }

    // ---- Analytics (best-effort; not in scope of fail-loud requirement) ----
    await svcClient.from("analytics_events").insert({
      event_name: "ai_trip_builder",
      user_id: actorUserId,
      properties: {
        source: "generated",
        destination: intent.destination,
        days: numDays,
        budget_level: intent.budget_tier,
        pace: intent.pace,
        duration_ms: Date.now() - pipelineStartedAt,
        places_ranking_live: rankingStats.live_calls,
        places_ranking_cache: rankingStats.cache_hits,
        places_details_live: hydrationStats.live_calls,
        places_details_cache: hydrationStats.cache_hits,
        llm_cost_usd: logger.totals().cost_usd,
        anonymous: isAnonymous,
      },
    });

    // ---- Anonymous persistence ----
    // Anon visitors get their generated trip stored so /trips/anon/[id] can
    // render it later. Failure is non-fatal — we still return the payload.
    let anonTripId: string | null = null;
    if (isAnonymous && anonSessionId) {
      anonTripId = await persistAnonymousTrip(
        svcClient as unknown as AnonStorageClient,
        {
          anonSessionId,
          prompt: typeof body.free_text === "string" ? body.free_text : null,
          sourceIp: clientIp,
          payload: responsePayload,
        },
      );
    }

    return jsonResponse({
      success: true,
      ...responsePayload,
      ...(anonTripId ? { anon_trip_id: anonTripId } : {}),
    });
  } catch (e) {
    console.error("generate-trip-itinerary error:", e);

    const err = e as Error;
    const isPipelineErr = err instanceof PipelineError;
    const step = isPipelineErr ? (err as PipelineError).step : loggedStep;
    const userMessage = isPipelineErr
      ? (err as PipelineError).userMessage
      : "Something went wrong building your trip. Please try again.";

    // Fire-and-forget: must not block or delay the user-facing error response
    // and must not throw. Only attempt if we got past auth and created the
    // service-role client — pre-auth failures don't get logged (we have no
    // table access and no user context worth recording).
    if (svcClientForLogging) {
      logGenerationError(svcClientForLogging, {
        user_id: loggedUserId,
        destination: loggedDestination,
        step,
        error_message: isPipelineErr ? (err as PipelineError).userMessage : err?.message ?? String(err),
        error_raw: {
          name: err?.name ?? "Error",
          message: err?.message ?? String(err),
          stack: err?.stack ?? null,
          is_pipeline_error: isPipelineErr,
        },
        duration_ms: Date.now() - requestStartedAt,
      }).catch(() => {});
    }

    return jsonResponse(
      {
        success: false,
        error: "trip_build_failed",
        step,
        message: userMessage,
      },
      500,
    );
  }
});

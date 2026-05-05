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

interface Intent {
  destination: string;             // resolved or surprise-picked
  vibes: string[];
  must_haves: string[];
  must_avoids: string[];
  budget_tier: "budget" | "mid-range" | "premium";
  pace: "leisurely" | "balanced" | "active";
  dietary: string[];
  group_composition: string;       // e.g. "couple", "family with young kids", "friends 20s"
  raw_notes: string;               // original notes/free_text passthrough
  // Free-text-derived hints. Populated when the user expressed them in notes /
  // free_text; null/[] otherwise. Pipeline is still single-leg today —
  // duration_days overrides the form-supplied duration when the user typed
  // something like "10 day trip", and named_destinations[0] short-circuits
  // pickSurpriseDestination so "Bangkok and Koh Phangan" lands on Bangkok
  // deterministically instead of letting the surprise picker re-derive.
  // Multi-leg generation will land in a separate change and start consuming
  // named_destinations[1..N].
  duration_days: number | null;
  named_destinations: string[];
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

interface DaySkeleton {
  date: string;
  day_number: number;
  theme: string;
  slots: PacingSlot[];
}

interface PlacesSearchQuery {
  textQuery: string;
  includedType?: string;
  priceLevels?: string[];
  locationBias: { circle: { center: { latitude: number; longitude: number }; radius: number } };
  // For routing the result back to the right slot pool:
  poolKey: PoolKey;
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
}

interface RankedDestination {
  name: string;
  start_date: string;
  end_date: string;
  intro: string;
  days: RankedDay[];
  accommodation?: EnrichedActivity;
}

interface PipelineResult {
  trip_title: string;
  trip_summary: string;
  destinations: RankedDestination[];
  map_center: { lat: number; lng: number };
  map_zoom: number;
  daily_budget_estimate: number;
  currency: string;
  packing_suggestions: string[];
  total_activities: number;
  // Propagated from Intent so the frontend budget helper can pick a sensible
  // per-night default when Places returns no hotel pricing.
  budget_tier: "budget" | "mid-range" | "premium";
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
  };
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

function buildSkeleton(
  intent: Intent,
  numDays: number,
  startDate: string,
  countryCode: string | null,
): DaySkeleton[] {
  // Placeholder start date for pure-duration flexible mode — downstream uses
  // the date only for ordering and display, not for factual claims.
  const base = startDate || new Date().toISOString().slice(0, 10);

  const meal = resolveMealPattern(countryCode);
  const lunchStart = meal.lunch[0];
  const dinnerStart = meal.dinner[0];
  const wantsNightlife = hasNightlifeSignal(intent);

  const days: DaySkeleton[] = [];
  for (let d = 0; d < numDays; d++) {
    const date = addDaysIso(base, d);
    const isFirst = numDays > 1 && d === 0;
    const isLast = numDays > 1 && d === numDays - 1;
    // Rest day: only on longer active trips, never on arrival/departure days.
    const isRest =
      numDays >= 6 &&
      intent.pace === "active" &&
      !isFirst &&
      !isLast &&
      (d + 1) % 4 === 0;

    const slots: PacingSlot[] = [];
    const primary = "primary";
    const transitHub = "transit_hub";

    if (isFirst) {
      // Arrival day: afternoon arrival buffer, one light sight, dinner. On
      // leisurely pace lunch is dropped — light pace means light bookends too,
      // and dinner is the day's food anchor. Balanced/active keep lunch so the
      // post-arrival window has a meal beat before the afternoon sight.
      slots.push({ type: "arrival", start_time: hhmm(13, 0), duration_minutes: 180, region_tag_for_queries: transitHub });
      if (intent.pace !== "leisurely") {
        slots.push({ type: "lunch", start_time: hhmm(lunchStart, 30), duration_minutes: 75, region_tag_for_queries: primary });
      }
      slots.push({ type: "afternoon_major", start_time: hhmm(16, 0), duration_minutes: 120, region_tag_for_queries: primary });
      slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
    } else if (isLast) {
      // Departure day: morning highlight, farewell lunch, then departure buffer.
      // Breakfast is dropped — the day already has lunch + a transit anchor;
      // morning_major is the more valuable slot before flight time. Lunch is
      // the day's only food anchor (no dinner before a flight) and is
      // protected from cap-trimming below.
      slots.push({ type: "morning_major", start_time: hhmm(9, 30), duration_minutes: 120, region_tag_for_queries: primary });
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 75, region_tag_for_queries: primary });
      slots.push({ type: "departure", start_time: hhmm(15, 0), duration_minutes: 180, region_tag_for_queries: transitHub });
    } else if (isRest) {
      // Rest day: late breakfast, long lunch, afternoon rest, dinner.
      slots.push({ type: "breakfast", start_time: hhmm(10, 0), duration_minutes: 60, region_tag_for_queries: primary });
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
      slots.push({ type: "rest", start_time: hhmm(14, 30), duration_minutes: 150, region_tag_for_queries: primary });
      slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
    } else if (intent.pace === "leisurely") {
      // Leisurely / "Light": one afternoon anchor + dinner. No breakfast, no
      // lunch, no morning slot, no second afternoon — the empty space is the
      // whole point. Users on this pace want loose middle days. Arrival and
      // departure days keep their bookend shape (isFirst/isLast branches
      // above) so travel days don't collapse around a flight.
      slots.push({ type: "afternoon_major", start_time: hhmm(15, 0), duration_minutes: 120, region_tag_for_queries: primary });
      slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
      if (wantsNightlife) {
        slots.push({ type: "nightlife", start_time: hhmm(dinnerStart + 2, 30), duration_minutes: 120, region_tag_for_queries: primary });
      }
    } else if (intent.pace === "active") {
      // Active: early start, morning + two afternoon majors, optional nightlife.
      slots.push({ type: "breakfast", start_time: hhmm(8, 30), duration_minutes: 45, region_tag_for_queries: primary });
      slots.push({ type: "morning_major", start_time: hhmm(9, 30), duration_minutes: 150, region_tag_for_queries: primary });
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 60, region_tag_for_queries: primary });
      slots.push({ type: "afternoon_major", start_time: hhmm(14, 0), duration_minutes: 150, region_tag_for_queries: primary });
      slots.push({ type: "afternoon_major", start_time: hhmm(16, 45), duration_minutes: 105, region_tag_for_queries: primary });
      slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
      if (wantsNightlife) {
        slots.push({ type: "nightlife", start_time: hhmm(dinnerStart + 2, 30), duration_minutes: 120, region_tag_for_queries: primary });
      }
    } else {
      // Balanced (default): morning anchor + lunch + afternoon anchor + dinner.
      // Breakfast is reserved for active pace. Nightlife is appended only when
      // the user signalled it (vibe / must-have / notes via hasNightlifeSignal,
      // which already vetoes on family/kids signals) — see PR for vibes
      // fidelity fix that decoupled nightlife from active-only pacing.
      slots.push({ type: "morning_major", start_time: hhmm(10, 0), duration_minutes: 150, region_tag_for_queries: primary });
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 75, region_tag_for_queries: primary });
      slots.push({ type: "afternoon_major", start_time: hhmm(14, 30), duration_minutes: 150, region_tag_for_queries: primary });
      slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
      if (wantsNightlife) {
        slots.push({ type: "nightlife", start_time: hhmm(dinnerStart + 2, 30), duration_minutes: 120, region_tag_for_queries: primary });
      }
    }

    days.push({
      date,
      day_number: d + 1,
      theme: themeForDay({ isFirst, isLast, isRest, pace: intent.pace, destination: intent.destination }),
      slots,
    });
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

function buildPlacesQueries(
  intent: Intent,
  skeleton: DaySkeleton[],
  center: { lat: number; lng: number; name: string },
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
  for (const day of skeleton) for (const slot of day.slots) slotTypesSeen.add(slot.type);

  const dinnerTone = detectDinnerTone(intent.vibes);
  const foodVibe = detectFoodVibe(intent.vibes);
  const wantsRooftop = intent.vibes.some((v) => /rooftop|skyline|view/i.test(v));

  const queries: PlacesSearchQuery[] = [];
  const seen = new Set<string>();
  const add = (dedupKey: string, q: PlacesSearchQuery): void => {
    if (queries.length >= MAX_PLACES_QUERIES_PER_TRIP) return;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    queries.push(q);
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
  // Without this loop the Nightlife / Culture / Adventure / etc. chips were
  // decoration only — the prompt mentioned them but no nightlife/museum/park
  // venues ever entered the candidate pool. Cap-aware: add() bails if we'd
  // exceed MAX_PLACES_QUERIES_PER_TRIP, so must_haves still take priority.
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

  const seen = new Set<string>();
  const out: BatchPlaceResult[] = [];
  for (let i = 0; i < perQueryResults.length; i++) {
    const pool = queries[i].poolKey;
    for (const p of perQueryResults[i]) {
      const id = p.id as string | undefined;
      if (!id || seen.has(id)) continue;
      seen.add(id);
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
  { match: /lodging/i,                                     range: [80, 250] },
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
): number {
  if (!Number.isFinite(llmCost) || llmCost < 0) llmCost = 0;
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
- description, pro_tip, why_for_you follow the same EDITORIAL VOICE rules as activities: cite specific details, no travel-brochure adjectives, no generic phrases. estimated_cost_per_person is per room per night in the trip's local currency.

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
5. trip_summary is 2-3 sentences. Name one thing the traveler will taste, one thing they'll see, one thing they'll feel. Concrete over generic. No adjective spam.
6. Honor intent.pace, intent.budget_tier, and intent.must_avoids in the narrative.
7. NEVER quote USD when the trip currency is something else.
8. Do NOT include emojis, decorative symbols, or pictographs.
9. The downstream validation layer will scan your output for any proper-noun venue not in the allowlist. Mismatches are logged as confabulation. Do not gamble.

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

  const payload = {
    trip_shape: {
      destination,
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
  return `Generate the FINAL trip_title and trip_summary. Call emit_trip_copy exactly once.\n\n${allowlistBlock}${JSON.stringify(payload)}`;
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
function buildSharedContextText(
  intent: Intent,
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
  events: EventCandidate[],
  currency: string,
  countryCode: string | null,
): string {
  // Merge consolidated "restaurants" pool into both lunch and dinner so each
  // per-day call sees a rich meal pool under each slot. Tone/vibe-specific
  // queries (dinner:romantic / lunch:vibe:foodie) stay in their own pools to
  // preserve biased options.
  const merged = new Map(venuesByPool);
  const shared = merged.get("restaurants") ?? [];
  if (shared.length > 0) {
    const lunch = merged.get("lunch") ?? [];
    const dinner = merged.get("dinner") ?? [];
    merged.set("lunch", dedupeByIdKeepFirst([...lunch, ...shared]));
    merged.set("dinner", dedupeByIdKeepFirst([...dinner, ...shared]));
    merged.delete("restaurants");
  }

  const pool: Record<string, VenueDigestEntry[]> = {};
  for (const [key, venues] of merged.entries()) {
    const sorted = [...venues].sort((a, b) => {
      const ra = a.rating ?? 0, rb = b.rating ?? 0;
      if (rb !== ra) return rb - ra;
      return (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
    });
    pool[key] = sorted.slice(0, 15).map(digestVenue);
  }

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
    },
    venue_pool_by_category: pool,
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

// Lazy photos: only build the URL for the first photo (the one rendered as
// the activity card hero). Secondary photos stay in the venue pool as
// { name } stubs; the frontend fetches additional photos on-demand via
// get-place-details when the user opens the activity detail view.
//
// Photo media downloads are billed per-load by Google — constructing 3 URLs
// that the browser never loads wouldn't directly cost money, BUT the `photos`
// field in the *upstream* Text Search response pushes that SKU to Enterprise.
// By dropping photos from the ranking field mask and only hydrating photo
// names for finalists, we pay for 11–15 Details calls instead of 20 fat
// searches, and the browser only loads the single hero photo.
function buildPhotoUrls(photos: Array<{ name: string }>, googleKey: string, max = 1): string[] {
  if (!photos?.length) return [];
  return photos
    .slice(0, max)
    .filter((p) => p?.name)
    .map((p) => `https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=800&key=${googleKey}`);
}

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
  googleKey: string,
  currency: string,
  budgetTier: Intent["budget_tier"],
  events: EventCandidate[] = [],
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
    photos: place ? buildPhotoUrls(place.photos ?? [], googleKey) : [],
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
function pickAccommodationPlaceId(
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
): string | null {
  const lodging = venuesByPool.get("lodging") ?? [];
  if (lodging.length === 0) return null;
  const sorted = [...lodging].sort((a, b) => {
    const ra = a.rating ?? 0, rb = b.rating ?? 0;
    if (rb !== ra) return rb - ra;
    return (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
  });
  return sorted[0]?.id ?? null;
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
      { type: "text", text: buildDayInstruction(day, accommodationPlaceId, avoidPlaceIds) },
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

// rankInParallel — parallel orchestrator used by the non-streaming JSON path.
// Returns a fully-assembled PipelineResult (still pre-junto-picks, pre-validate,
// pre-affiliate-decorate; the caller chains those steps the same way it did
// for the old monolithic rankAndEnrich).
async function rankInParallel(
  anthropicKey: string,
  intent: Intent,
  skeleton: DaySkeleton[],
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
  events: EventCandidate[],
  googleKey: string,
  geo: GeocodeResult,
  startDate: string,
  endDate: string,
  logger: LLMLogger,
  pipelineStartedAt: number,
): Promise<PipelineResult> {
  const currency = resolveTripCurrency(geo.country_code);
  const numDays = skeleton.length;

  const placeById = new Map<string, BatchPlaceResult>();
  for (const venues of venuesByPool.values()) for (const v of venues) placeById.set(v.id, v);

  const accommodationPlaceId = pickAccommodationPlaceId(venuesByPool);
  const sharedContext = buildSharedContextText(intent, venuesByPool, events, currency, geo.country_code);

  // Mode selection — see streaming-path comment for rationale.
  const sequentialRanking = numDays >= SEQUENTIAL_RANKING_MIN_DAYS;
  console.log(
    `[rankInParallel] mode=${sequentialRanking ? "sequential" : "parallel"} ` +
    `numDays=${numDays} pool_size=${placeById.size}`,
  );

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
  // the cumulative seenIds (built by the prior day's hydrate step) as
  // avoid_place_ids, so the LLM is told what's claimed instead of guessing.
  // Receipt-time dedup remains as a safety net. In parallel mode all calls
  // fire at once with avoid_place_ids=[]; receipt-time dedup is the only
  // collision check. ----
  const seenIds = new Set<string>();
  const ranked_days: RankedDay[] = [];
  const seenThemes = new Set<string>();
  let fallbackDays = 0;
  let thinDays = 0;

  const hydrateDay = (
    day: DaySkeleton,
    rawDay: RawRankerDay | null,
    source: "llm" | "fallback",
  ) => {
    const theme = rawDay?.theme?.trim() || day.theme;
    const activities: EnrichedActivity[] = [];
    const rawActs = Array.isArray(rawDay?.activities) ? rawDay!.activities : [];
    const dropReasons: string[] = [];
    for (let i = 0; i < day.slots.length; i++) {
      const slot = day.slots[i];
      const rawAct = rawActs.find((a) => a?.slot_index === i);
      if (!rawAct) continue;
      if (rawAct.place_id && seenIds.has(rawAct.place_id)) {
        dropReasons.push("dedup");
        continue;
      }
      if (accommodationPlaceId && rawAct.place_id === accommodationPlaceId) {
        dropReasons.push("accommodation_collision");
        continue;
      }
      const place = rawAct.place_id ? placeById.get(rawAct.place_id) ?? null : null;
      if (!rawAct.is_event && rawAct.place_id && !place) {
        dropReasons.push("place_id_not_in_pool");
        continue;
      }
      // Hard-drop: Places returned hours AND those hours say the venue is
      // closed at slot.start_time. We do NOT drop on category-fallback
      // closures here — fallbacks are approximate and dropping on them
      // would break too many edge cases (e.g. lunch spots open at 11:00 vs
      // a slot at 13:30 falling under our 11:00-23:00 default). The
      // post-pipeline validator (logOpeningHoursViolations) still surfaces
      // category-fallback closures as observability warnings.
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
      const activity = hydrateActivity(rawAct, slot, place, googleKey, currency, intent.budget_tier, events);
      if (!activity) {
        dropReasons.push("hydrate_failed");
        continue;
      }
      if (place) seenIds.add(place.id);
      activities.push(activity);
    }
    const rankedDay: RankedDay = {
      date: day.date, day_number: day.day_number, theme, activities,
    };
    resolveDayTheme(rankedDay, seenThemes);
    ranked_days.push(rankedDay);

    const minActivities = Math.max(2, Math.floor(day.slots.length * 0.5));
    if (activities.length < minActivities) {
      thinDays++;
      const reason =
        source === "fallback" ? "rank_failed"
        : dropReasons.length > 0 ? dropReasons.join(",")
        : "unknown";
      console.warn(
        `[rankInParallel] thin day day_number=${day.day_number} ` +
        `kept=${activities.length} slots=${day.slots.length} ` +
        `mode=${sequentialRanking ? "sequential" : "parallel"} ` +
        `claimed_total=${seenIds.size} pool_size=${placeById.size} ` +
        `reason=${reason}`,
      );
    }
  };

  if (sequentialRanking) {
    // See streaming-path comment for the budget-exhaustion rationale.
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
      const settled = await rankDayWithRetry(
        anthropicKey, intent, day, sharedContext, accommodationPlaceId,
        Array.from(seenIds), pipelineStartedAt, logger,
      );
      if (settled.source === "fallback") fallbackDays++;
      hydrateDay(day, settled.raw, settled.source);
    }
  } else {
    const dayPromises = skeleton.map((day) =>
      rankDayWithRetry(
        anthropicKey, intent, day, sharedContext, accommodationPlaceId, [],
        pipelineStartedAt, logger,
      ).then((res) => ({ day, ...res })),
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

  // ---- Accommodation ----
  let accommodation: EnrichedActivity | undefined;
  const accomPlaceId = meta?.accommodation?.place_id ?? accommodationPlaceId;
  if (accomPlaceId) {
    const place = placeById.get(accomPlaceId) ?? null;
    if (place) {
      const fakeSlot: PacingSlot = {
        type: "lodging", start_time: "15:00", duration_minutes: 0,
        region_tag_for_queries: "primary",
      };
      const hydrated = hydrateActivity(
        {
          slot_index: -1, slot_type: "lodging",
          place_id: accomPlaceId, is_event: false,
          title: meta?.accommodation?.title ?? place.displayName ?? "Hotel",
          description: meta?.accommodation?.description ?? "",
          pro_tip: meta?.accommodation?.pro_tip ?? "",
          why_for_you: meta?.accommodation?.why_for_you ?? "",
          skip_if: meta?.accommodation?.skip_if ?? null,
          category: "accommodation",
          estimated_cost_per_person: meta?.accommodation?.estimated_cost_per_person ?? 0,
          dietary_notes: meta?.accommodation?.dietary_notes ?? null,
        },
        fakeSlot, place, googleKey, currency, intent.budget_tier,
      );
      if (hydrated) accommodation = hydrated;
    }
  }

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

  const destination: RankedDestination = {
    name: intent.destination,
    start_date: skeleton[0]?.date ?? "",
    end_date: skeleton[skeleton.length - 1]?.date ?? "",
    intro: finalSummary,
    days: ranked_days,
    accommodation,
  };

  return {
    trip_title: finalTitle,
    trip_summary: finalSummary,
    destinations: [destination],
    map_center: { lat: geo.lat, lng: geo.lng },
    map_zoom: 12,
    daily_budget_estimate,
    currency,
    packing_suggestions: Array.isArray(meta?.packing_suggestions) ? meta!.packing_suggestions.slice(0, 10) : [],
    total_activities,
    budget_tier: intent.budget_tier,
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

// Per-day validator used by the streaming pipeline so days can be emitted to
// the client as they arrive without waiting for all days. Mirrors the
// per-activity rules from validateActivities but skips the trip-wide drop
// threshold check (that runs once at end after all days are in).
function validateDayActivitiesInline(
  activities: EnrichedActivity[],
  allPlaces: Map<string, BatchPlaceResult>,
  center: { lat: number; lng: number },
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
      if (d > VALIDATION_MAX_KM_FROM_CENTER) {
        console.warn(`[stream.validate] drop "${act.title}" — ${d.toFixed(0)} km from center`);
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
  center: { lat: number; lng: number },
): PipelineResult {
  let totalBefore = 0;
  let dropped = 0;

  for (const dest of result.destinations) {
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

        // Reason 2: off-continent coords.
        if (place?.location) {
          const d = haversineKm(
            center.lat, center.lng,
            place.location.latitude, place.location.longitude,
          );
          if (d > VALIDATION_MAX_KM_FROM_CENTER) {
            console.warn(
              `[validateActivities] drop "${act.title}" — ${d.toFixed(0)} km from trip center (limit ${VALIDATION_MAX_KM_FROM_CENTER})`,
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
// Older entries were written before PR #244's markJuntoPicks rewrite (and before
// the non-streaming cache-hit branch learned to re-tag picks), so they ship
// with is_junto_pick=false on every activity. v2 evicts them.
const CACHE_KEY_VERSION = "v2";

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
  const dest = (payload as { destinations?: Array<Record<string, unknown>> })?.destinations?.[0];
  if (!dest || !Array.isArray((dest as { days?: unknown }).days)) {
    return { days_rewritten: 0 };
  }
  const days = (dest as { days: Array<Record<string, unknown>> }).days;
  let daysRewritten = 0;
  for (const day of days) {
    const dayNum = typeof day.day_number === "number" ? day.day_number : daysRewritten + 1;
    day.date = addDaysIso(newStartDate, dayNum - 1);
    daysRewritten++;
  }
  if (days.length > 0) {
    (dest as Record<string, unknown>).start_date = days[0].date;
    (dest as Record<string, unknown>).end_date = days[days.length - 1].date;
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
  const dest = (payload as { destinations?: Array<Record<string, unknown>> })?.destinations?.[0];
  if (!dest) return { rewritten: 0 };
  let rewritten = 0;

  const destName = typeof (dest as { name?: unknown }).name === "string"
    ? (dest as { name: string }).name
    : "";
  const cityHint = env.cityHint ?? destName ?? null;

  const rebuild = (existingUrl: string, activityTitle: string | null): string => {
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
      // unparseable — leave URL unchanged
      return existingUrl;
    }
    // Prefer the activity title (clean hotel name) + city hint over the
    // existing ss, which often contains street/postcode noise from older
    // generations.
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

  const visit = (activity: Record<string, unknown> | null | undefined) => {
    if (!activity) return;
    if (activity.booking_partner !== "booking") return;
    const current = typeof activity.booking_url === "string" ? activity.booking_url : "";
    if (!current) return;
    const title = typeof activity.title === "string" ? activity.title : null;
    const next = rebuild(current, title);
    if (next !== current) {
      activity.booking_url = next;
      rewritten++;
    }
  };

  visit(dest.accommodation as Record<string, unknown> | undefined);
  const days = Array.isArray((dest as { days?: unknown }).days)
    ? (dest as { days: Array<Record<string, unknown>> }).days
    : [];
  for (const day of days) {
    const acts = Array.isArray((day as { activities?: unknown }).activities)
      ? (day as { activities: Array<Record<string, unknown>> }).activities
      : [];
    for (const a of acts) visit(a);
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
  const dest = (payload as { destinations?: Array<Record<string, unknown>> })?.destinations?.[0];
  const days: Array<Record<string, unknown>> = Array.isArray((dest as { days?: unknown })?.days)
    ? ((dest as { days: Array<Record<string, unknown>> }).days)
    : [];

  const eventActivities: Array<Record<string, unknown>> = [];
  for (const day of days) {
    const acts = (day as { activities?: unknown }).activities;
    if (!Array.isArray(acts)) continue;
    for (const a of acts as Array<Record<string, unknown>>) {
      if (a && a.event_url) eventActivities.push(a);
    }
  }
  if (eventActivities.length === 0) {
    return { refreshed: 0, cleared: 0 };
  }

  let freshEvents: EventCandidate[] = [];
  try {
    freshEvents = await searchEvents(
      intent.destination,
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
      `[stream.cache] events_refresh_failed dest="${intent.destination}" start=${startDate} end=${endDate} err=${(err as Error).message}`,
    );
    let cleared = 0;
    for (const a of eventActivities) {
      a.event_url = null;
      cleared++;
    }
    return { refreshed: 0, cleared };
  }

  let refreshed = 0;
  let cleared = 0;
  for (const a of eventActivities) {
    const match = matchEventCandidate(
      typeof a.title === "string" ? a.title : "",
      typeof a.description === "string" ? a.description : "",
      freshEvents,
    );
    if (match?.url) {
      a.event_url = match.url;
      refreshed++;
    } else {
      a.event_url = null;
      cleared++;
    }
  }
  return { refreshed, cleared };
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
    if (!surpriseMe && !rawDest) {
      return jsonResponse(
        { success: false, error: "destination is required (or set surprise_me=true)" },
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
    //   event: trip_complete   { trip_title, trip_summary, accommodation, packing_suggestions, junto_pick_place_ids, daily_budget_estimate, total_activities, map_center, map_zoom, currency, budget_tier }
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
              const cachedDayCount: number = Array.isArray(payload?.destinations?.[0]?.days)
                ? payload.destinations[0].days.length
                : 0;
              // Defensive miss: numDays is already in the cache key, so this
              // should never trip — but if a malformed entry slips through we'd
              // rather regenerate than ship a 5-day trip for a 6-day request.
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
                const dest = payload?.destinations?.[0];
                send("meta", {
                  destination: payload?.destinations?.[0]?.name ?? intent.destination,
                  country_code: null,
                  num_days: dest?.days?.length ?? numDays,
                  skeleton: (dest?.days ?? []).map((d: any) => ({
                    day_number: d.day_number,
                    date: d.date,
                    theme: d.theme ?? "",
                  })),
                  currency: payload?.currency ?? "USD",
                  from_cache: true,
                });
                send("image", { url: payload?.destination_image_url ?? null });
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
                // Cache-hit fast path: collapse the new stage_progress events
                // into a single 95% finalize signal so the frontend can
                // transition directly to filled cards. Days still emit
                // day_complete per day below.
                send("stage_progress", {
                  stage: "finalizing",
                  user_text: "Final touches",
                  percent_complete: 95,
                });
                console.log("[stream] stage_progress: finalizing (95%) [cache hit]");
                for (const d of dest?.days ?? []) {
                  send("day", d);
                  send("day_complete", {
                    day_number: d.day_number,
                    theme: d.theme ?? "",
                    activity_count: Array.isArray(d.activities) ? d.activities.length : 0,
                  });
                  console.log(`[stream] day_complete: day_number=${d.day_number} [cache hit]`);
                }
                const juntoPlaceIds: string[] = [];
                for (const day of dest?.days ?? []) {
                  for (const a of day.activities ?? []) if (a?.is_junto_pick && a.place_id) juntoPlaceIds.push(a.place_id);
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
                send("trip_complete", {
                  trip_title: stripEmojis(payload?.trip_title),
                  trip_summary: payload?.trip_summary ?? "",
                  accommodation: dest?.accommodation ?? null,
                  packing_suggestions: payload?.packing_suggestions ?? [],
                  junto_pick_place_ids: juntoPlaceIds,
                  daily_budget_estimate: payload?.daily_budget_estimate ?? 0,
                  total_activities: payload?.total_activities ?? 0,
                  map_center: payload?.map_center ?? null,
                  map_zoom: payload?.map_zoom ?? 12,
                  currency: payload?.currency ?? "USD",
                  budget_tier: payload?.budget_tier ?? intent.budget_tier,
                  destination_image_url: payload?.destination_image_url ?? null,
                  destination_country_iso: payload?.destination_country_iso ?? null,
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

            // ---- Geocode + skeleton + queries ----
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
            const geo: GeocodeResult = earlyGeocodePromise
              ? await earlyGeocodePromise
              : await geocodeDestination(googleKey, intent.destination, svcClient, actorUserId);
            tStage("geocode", tGeocode);

            const tSkeleton = Date.now();
            const skeleton = buildSkeleton(intent, numDays, startDate, geo.country_code);
            tStage("build_skeleton", tSkeleton);

            send("meta", {
              destination: intent.destination,
              country_code: geo.country_code,
              num_days: numDays,
              skeleton: skeleton.map((d) => ({ day_number: d.day_number, date: d.date, theme: d.theme })),
              currency: resolveTripCurrency(geo.country_code),
              from_cache: false,
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
            const queries = buildPlacesQueries(intent, skeleton, { lat: geo.lat, lng: geo.lng, name: intent.destination });
            tStage("build_queries", tQueryPlan);

            stepLabel = "searchPlacesAndEvents";
            checkPipelineTimeout(pipelineStartedAt, stepLabel);
            const tSearch = Date.now();
            const [searchResult, events] = await Promise.all([
              searchPlacesBatch(queries, googleKey, svcClient),
              searchEvents(intent.destination, startDate, endDate, intent, skeleton, svcClient, logger),
            ]);
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

            const currency = resolveTripCurrency(geo.country_code);
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
            const seenIds = new Set<string>();
            const seenThemes = new Set<string>();
            const emittedDayNumbers = new Set<number>();
            let totalDropped = 0;
            // skeleton-only-fallback days, used in the post-loop drop-threshold
            // calculation so a fully-failed day doesn't get treated as garbage.
            let fallbackDays = 0;

            const accommodationPlaceId = pickAccommodationPlaceId(venuesByPool);
            const sharedContext = buildSharedContextText(intent, venuesByPool, events, currency, geo.country_code);

            const sequentialRanking = numDays >= SEQUENTIAL_RANKING_MIN_DAYS;
            let thinDays = 0;
            console.log(
              `[stream.rank] mode=${sequentialRanking ? "sequential" : "parallel"} ` +
              `numDays=${numDays} pool_size=${placeById.size}`,
            );

            const hydrateAndEmit = (
              rawDay: RawRankerDay | null,
              day: DaySkeleton,
              source: "llm" | "fallback",
            ) => {
              if (emittedDayNumbers.has(day.day_number)) return;
              const theme = rawDay?.theme?.trim() || day.theme;
              const activities: EnrichedActivity[] = [];
              const rawActs = Array.isArray(rawDay?.activities) ? rawDay!.activities : [];
              const dropReasons: string[] = [];
              for (let i = 0; i < day.slots.length; i++) {
                const slot = day.slots[i];
                const rawAct = rawActs.find((a) => a?.slot_index === i);
                if (!rawAct) continue;
                // Trip-wide dedup safety net. In sequential mode the LLM was
                // told what's claimed via avoid_place_ids, so this should rarely
                // fire. In parallel mode it's the primary dedup mechanism.
                if (rawAct.place_id && seenIds.has(rawAct.place_id)) {
                  dropReasons.push("dedup");
                  continue;
                }
                // Don't let per-day calls double-book the lodging place.
                if (accommodationPlaceId && rawAct.place_id === accommodationPlaceId) {
                  dropReasons.push("accommodation_collision");
                  continue;
                }
                const place = rawAct.place_id ? placeById.get(rawAct.place_id) ?? null : null;
                if (!rawAct.is_event && rawAct.place_id && !place) {
                  dropReasons.push("place_id_not_in_pool");
                  continue;
                }
                // Hard-drop on Places-confirmed closures (mirrors rankInParallel
                // hydrateDay; see comment there for why category-fallback
                // closures only log, not drop).
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
                const activity = hydrateActivity(rawAct, slot, place, googleKey, currency, intent.budget_tier, events);
                if (!activity) {
                  dropReasons.push("hydrate_failed");
                  continue;
                }
                if (place) seenIds.add(place.id);
                const aff = buildAffiliateUrl(
                  activity.place_id ? allPlacesById.get(activity.place_id) ?? null : null,
                  affEnv, activity.event_url,
                );
                activity.booking_url = aff.booking_url;
                activity.booking_partner = aff.booking_partner;
                activities.push(activity);
              }
              const validated = validateDayActivitiesInline(activities, allPlacesById, { lat: geo.lat, lng: geo.lng });
              totalDropped += validated.dropped;
              const rankedDay: RankedDay = { date: day.date, day_number: day.day_number, theme, activities: validated.kept };
              // Dedup theme against earlier-emitted days. Per-day calls run in
              // parallel and can't see each other's themes, so two days may
              // land on the same label. Day order is preserved by the await
              // loop below, so day 1 always wins; day 2+ collisions get a
              // theme derived from their own activity venues.
              resolveDayTheme(rankedDay, seenThemes);
              ranked_days.push(rankedDay);
              emittedDayNumbers.add(day.day_number);

              // Thin-day signal: kept activities < half the day's slots is
              // almost always a problem (validator drops, dedup exhaustion, or
              // a fallback). Logged with a structured reason so the cause is
              // visible in Edge logs without grep-fu.
              const minActivities = Math.max(2, Math.floor(day.slots.length * 0.5));
              if (validated.kept.length < minActivities) {
                thinDays++;
                const reason =
                  source === "fallback" ? "rank_failed"
                  : dropReasons.length > 0 ? dropReasons.join(",")
                  : "unknown";
                console.warn(
                  `[stream.rank] thin day day_number=${day.day_number} ` +
                  `kept=${validated.kept.length} slots=${day.slots.length} ` +
                  `mode=${sequentialRanking ? "sequential" : "parallel"} ` +
                  `claimed_total=${seenIds.size} pool_size=${placeById.size} ` +
                  `reason=${reason}`,
                );
              }

              send("day", rankedDay);
              send("day_complete", {
                day_number: rankedDay.day_number,
                theme: rankedDay.theme,
                activity_count: rankedDay.activities.length,
              });
              console.log(`[stream] day_complete: day_number=${rankedDay.day_number}`);
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

            // Early-emit accommodation as soon as metadata resolves (runs in
            // parallel with day ranking — typically lands ~10–15s in, well
            // before the last day completes). The frontend renders the hotel
            // card immediately instead of waiting for trip_complete.
            //
            // destination_index is included for forward-compat with multi-leg
            // trips; today every trip is single-destination so it's always 0.
            const accommodationEarlyPromise: Promise<EnrichedActivity | undefined> = metadataPromise.then((res) => {
              const accomRaw = res.data?.accommodation;
              const placeId = accomRaw?.place_id ?? accommodationPlaceId;
              if (!placeId) return undefined;
              const place = placeById.get(placeId) ?? null;
              if (!place) return undefined;
              const fakeSlot: PacingSlot = {
                type: "lodging", start_time: "15:00", duration_minutes: 0, region_tag_for_queries: "primary",
              };
              const hydrated = hydrateActivity(
                {
                  slot_index: -1, slot_type: "lodging",
                  place_id: placeId, is_event: false,
                  title: accomRaw?.title ?? place.displayName ?? "Hotel",
                  description: accomRaw?.description ?? "",
                  pro_tip: accomRaw?.pro_tip ?? "",
                  why_for_you: accomRaw?.why_for_you ?? "",
                  skip_if: accomRaw?.skip_if ?? null,
                  category: "accommodation",
                  estimated_cost_per_person: accomRaw?.estimated_cost_per_person ?? 0,
                  dietary_notes: accomRaw?.dietary_notes ?? null,
                },
                fakeSlot, place, googleKey, currency, intent.budget_tier,
              );
              if (!hydrated) return undefined;
              const aff = buildAffiliateUrl(place, affEnv, hydrated.event_url);
              hydrated.booking_url = aff.booking_url;
              hydrated.booking_partner = aff.booking_partner;
              try {
                send("accommodation", { destination_index: 0, hotel: hydrated });
                console.log(`[stream] accommodation emitted early place_id=${placeId}`);
              } catch (e) {
                console.warn("[stream.accommodation] early emit failed:", (e as Error).message);
              }
              return hydrated;
            }).catch((e) => {
              console.warn("[stream.accommodation] early hydrate failed:", (e as Error).message);
              return undefined;
            });

            if (sequentialRanking) {
              // Sequential: each day's call sees the cumulative seenIds (built
              // by hydrateAndEmit on prior days) as avoid_place_ids. The cached
              // prompt prefix (system + sharedContext) is identical across
              // calls, so calls 2..N hit Anthropic's prompt cache; only the
              // small uncached suffix (buildDayInstruction with the variable
              // avoid list) re-encodes per call.
              //
              // Budget-exhaustion gate: once the global pipeline wall-clock
              // is gone, firing more rankDayWithRetry calls is wasted work —
              // callClaudeHaiku would throw PipelineError before sending any
              // request, and rankDayWithRetry's retry loop would catch+retry
              // for no reason. Detect exhaustion before each call, log once,
              // and emit skeleton-only days for the rest of the trip so the
              // result still has a complete days array.
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
                  hydrateAndEmit(null, day, "fallback");
                  continue;
                }
                const settled = await rankDayWithRetry(
                  anthropicKey, intent, day, sharedContext, accommodationPlaceId,
                  Array.from(seenIds), pipelineStartedAt, logger,
                );
                if (settled.source === "fallback") fallbackDays++;
                hydrateAndEmit(settled.raw, day, settled.source);
              }
            } else {
              // Parallel (single-day trips only after the threshold drop).
              // Track per-day promises so we can emit in skeleton order — this
              // preserves the dedup ordering invariant if the mode ever runs
              // with more than one day.
              const dayPromises = skeleton.map((day) =>
                rankDayWithRetry(
                  anthropicKey, intent, day, sharedContext, accommodationPlaceId,
                  [], pipelineStartedAt, logger,
                ).then((res) => ({ day, ...res }))
              );
              for (const p of dayPromises) {
                const settled = await p;
                if (settled.source === "fallback") fallbackDays++;
                hydrateAndEmit(settled.raw, settled.day, settled.source);
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

            let accommodation: EnrichedActivity | undefined = await accommodationEarlyPromise;
            const accomRaw = meta?.accommodation;
            const accomPlaceId = accomRaw?.place_id ?? accommodationPlaceId;
            if (!accommodation && accomPlaceId) {
              // Fallback: early hydration didn't produce a result (e.g.
              // place wasn't in pool at the time, or hydrateActivity
              // returned null). Retry now that everything has settled.
              const place = placeById.get(accomPlaceId) ?? null;
              if (place) {
                const fakeSlot: PacingSlot = {
                  type: "lodging", start_time: "15:00", duration_minutes: 0, region_tag_for_queries: "primary",
                };
                const hydrated = hydrateActivity(
                  {
                    slot_index: -1, slot_type: "lodging",
                    place_id: accomPlaceId, is_event: false,
                    title: accomRaw?.title ?? place.displayName ?? "Hotel",
                    description: accomRaw?.description ?? "",
                    pro_tip: accomRaw?.pro_tip ?? "",
                    why_for_you: accomRaw?.why_for_you ?? "",
                    skip_if: accomRaw?.skip_if ?? null,
                    category: "accommodation",
                    estimated_cost_per_person: accomRaw?.estimated_cost_per_person ?? 0,
                    dietary_notes: accomRaw?.dietary_notes ?? null,
                  },
                  fakeSlot, place, googleKey, currency, intent.budget_tier,
                );
                if (hydrated) {
                  const aff = buildAffiliateUrl(place, affEnv, hydrated.event_url);
                  hydrated.booking_url = aff.booking_url;
                  hydrated.booking_partner = aff.booking_partner;
                  accommodation = hydrated;
                  // Late fallback: still emit so the streaming UI updates.
                  try {
                    send("accommodation", { destination_index: 0, hotel: hydrated });
                  } catch {}
                }
              }
            }


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

            const destinationFinal: RankedDestination = {
              name: intent.destination,
              start_date: skeleton[0]?.date ?? "",
              end_date: skeleton[skeleton.length - 1]?.date ?? "",
              intro: finalSummary,
              days: ranked_days,
              accommodation,
            };
            const pipelineResult: PipelineResult = {
              trip_title: finalTitle,
              trip_summary: finalSummary,
              destinations: [destinationFinal],
              map_center: { lat: geo.lat, lng: geo.lng },
              map_zoom: 12,
              daily_budget_estimate,
              currency,
              packing_suggestions: Array.isArray(meta?.packing_suggestions) ? meta!.packing_suggestions.slice(0, 10) : [],
              total_activities,
              budget_tier: intent.budget_tier,
            };

            markJuntoPicks(pipelineResult, intent);
            logVibeCoverage(pipelineResult, intent);
            logDescriptionGrounding(pipelineResult, intent);
            logOpeningHoursViolations(pipelineResult);
            logPricingAnomalies(pipelineResult);

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

            // ---- Final event ----
            send("trip_complete", {
              trip_title: pipelineResult.trip_title,
              trip_summary: pipelineResult.trip_summary,
              accommodation: accommodation ?? null,
              packing_suggestions: pipelineResult.packing_suggestions,
              junto_pick_place_ids: juntoPlaceIds,
              daily_budget_estimate,
              total_activities,
              map_center: pipelineResult.map_center,
              map_zoom: pipelineResult.map_zoom,
              currency,
              budget_tier: pipelineResult.budget_tier,
              destination_image_url: destinationImageUrl,
              destination_country_iso: destinationCountryIso,
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
        const cachedDayCount: number = Array.isArray(payload?.destinations?.[0]?.days)
          ? payload.destinations[0].days.length
          : 0;
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
          // Re-apply junto picks against the current request's intent — cached
          // payloads were tagged under whatever intent generated them (and
          // pre-PR #244 entries were tagged under the strict hidden-gem rule
          // and may have zero picks). Mirrors the streaming cache-hit branch.
          markJuntoPicks(payload as unknown as PipelineResult, intent);
          logVibeCoverage(payload as unknown as PipelineResult, intent);
          logDescriptionGrounding(payload as unknown as PipelineResult, intent);
          logOpeningHoursViolations(payload as unknown as PipelineResult);
          logPricingAnomalies(payload as unknown as PipelineResult);
          let juntoPicksTagged = 0;
          for (const day of payload?.destinations?.[0]?.days ?? []) {
            for (const a of day.activities ?? []) if (a?.is_junto_pick) juntoPicksTagged++;
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

    // ---- Step 2a: geocode (must run before buildSkeleton so MEAL_PATTERNS
    //               gets the country_code rather than parsing the string) ----
    // Throws PipelineError on API failure or no-match; top-level catch
    // converts it into a structured { error, step, message } 500 response.
    //
    // Non-surprise mode: we kicked off geocoding rawDest in parallel with
    // parseIntent — await that promise here. Surprise mode: we don't know the
    // destination until pickSurpriseDestination runs, so we geocode now.
    loggedStep = "geocodeDestination";
    checkPipelineTimeout(pipelineStartedAt, loggedStep);
    const tGeocode = Date.now();
    const geo: GeocodeResult = earlyGeocodePromise
      ? await earlyGeocodePromise
      : await geocodeDestination(googleKey, intent.destination, svcClient, actorUserId);
    tStage("geocode", tGeocode);

    // ---- Step 2b: pacing skeleton (slot count capped inside buildSkeleton) ----
    const tSkeleton = Date.now();
    const skeleton = buildSkeleton(intent, numDays, startDate, geo.country_code);
    tStage("build_skeleton", tSkeleton);

    // ---- Step 3 + 4: query plan + Places batch (RANKING pass, Essentials SKU) ----
    const tQueryPlan = Date.now();
    const queries = buildPlacesQueries(intent, skeleton, {
      lat: geo.lat,
      lng: geo.lng,
      name: intent.destination,
    });
    if (queries.length > MAX_PLACES_QUERIES_PER_TRIP) {
      console.warn(
        `[generate-trip-itinerary] query planner produced ${queries.length} queries, exceeding cap ${MAX_PLACES_QUERIES_PER_TRIP}`,
      );
    }
    tStage("build_queries", tQueryPlan);

    // Step 4 + Step 5 in parallel
    loggedStep = "searchPlacesAndEvents";
    checkPipelineTimeout(pipelineStartedAt, loggedStep);
    const tSearch = Date.now();
    const [searchResult, events] = await Promise.all([
      searchPlacesBatch(queries, googleKey, svcClient),
      searchEvents(intent.destination, startDate, endDate, intent, skeleton, svcClient, logger),
    ]);
    tStage("search_places_and_events", tSearch);
    const places = searchResult.places;
    const rankingStats = searchResult.stats;

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
      venuesByPool,
      events,
      googleKey,
      geo,
      startDate,
      endDate,
      logger,
      pipelineStartedAt,
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
    for (const dest of ranked.destinations) {
      const decorate = (a: EnrichedActivity) => {
        // Events (place_id === "") pass null → event_direct; their event_url
        // (fuzzy-matched during hydration) becomes booking_url.
        const place = a.place_id ? allPlacesById.get(a.place_id) ?? null : null;
        const aff = buildAffiliateUrl(place, affEnv, a.event_url);
        a.booking_url = aff.booking_url;
        a.booking_partner = aff.booking_partner;
      };
      if (dest.accommodation) decorate(dest.accommodation);
      for (const day of dest.days) {
        for (const act of day.activities) decorate(act);
      }
    }

    tStage("junto_and_affiliate", tJunto);

    loggedStep = "validateActivities";
    const tValidate = Date.now();
    const validated = validateActivities(ranked, allPlacesById, { lat: geo.lat, lng: geo.lng });
    tStage("validate", tValidate);

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

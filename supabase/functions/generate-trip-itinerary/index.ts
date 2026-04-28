// generate-trip-itinerary — source-of-truth pipeline (Places-first, Claude Haiku ranker)
//
// Pipeline (non-alternatives_mode):
//   1. parseIntent       — Claude Haiku extracts structured intent from form + free text
//   2. buildSkeleton     — pure-code pacing skeleton, slot cap scales with trip length
//   3. buildPlacesQueries— pure-code Google Places query plan, deduped + capped at 12
//   4. searchPlacesBatch — Places Text Search with ESSENTIALS field mask (ranking pass)
//   5. hydrateFinalists  — Place Details GET with PRO field mask for the ~15 venues
//                          the ranker actually selects (photos, priceLevel, reviews)
//   6. searchEvents      — Brave/Google CSE event search (optional, parallel)
//   7. rankAndEnrich     — Claude Haiku assigns venues to slots + writes editorial copy
//   8. markJuntoPicks    — pure code: rating/reviews/intent-match heuristic
//   9. buildAffiliateUrl — pure code: types[] -> Booking/Viator/GetYourGuide/Maps
//  10. validateActivities— drop hallucinations: missing place_id, > distance, not OPERATIONAL
//
// Cost shape (before this refactor → after):
//   - 20 fat text searches × $0.032  → up to 12 essentials × $0.005 + ≤15 details × $0.017
//     ≈ $0.64 → ≈ $0.32 on the Places line, plus 7d/30d cache sharing with concierge.
//
// All Claude calls go to direct Anthropic API (claude-haiku-4-5-20251001) with prompt
// caching on the static system blocks. The `alternatives_mode` branch is preserved
// verbatim and still uses Lovable AI Gateway / Gemini.

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
// Slot budget scales with trip length AND with the user's chosen pace, so
// longer/packed trips don't get gutted and shorter/leisurely trips don't get
// padded with filler.
//   leisurely → "light": lunch + dinner anchors only on full days
//   balanced  → today's default shape (morning + lunch + afternoon + dinner)
//   active    → "packed": morning + lunch + 2× afternoon + dinner (+ optional nightlife)
// 5-day lands at: leisurely 12 / balanced 20 / active 27.
// Ceilings hit at: leisurely 8d / balanced 9d / active 8d.
// The AbortController already caps each Anthropic call at the remaining 150s
// pipeline budget, so the active ceiling of 42 is structurally bounded.
const SLOTS_PER_DAY_BUDGET: Record<Intent["pace"], number> = {
  leisurely: 2.5,
  balanced: 4,
  active: 5.5,
};
const MAX_SLOTS_CEILING: Record<Intent["pace"], number> = {
  leisurely: 18,
  balanced: 36,
  active: 42,
};

// Per-pace ranker max_tokens. Activity copy averages ~250 tokens × slot count
// plus ~1.5k trip-level fields. Active 42-slot trips push ~12k output, so 16k
// is too tight — 18k restores ~50% headroom against truncation. Leisurely
// tops out at 18 slots (~6k output); 12k stays well clear and shaves a bit
// of headroom we don't need. Used by both the JSON path (rankAndEnrich) and
// the streaming path (callClaudeHaikuStreaming) — module-scoped so the two
// stay in lockstep.
const RANK_MAX_TOKENS: Record<Intent["pace"], number> = {
  leisurely: 12_000,
  balanced: 16_000,
  active: 18_000,
};

const MAX_FINALIST_HYDRATIONS = 20;     // safety cap on details pass; real trips pick 11–15

// Rate limit + circuit breaker defaults. Override via env if needed.
const DEFAULT_RATE_LIMIT_PER_HOUR = 5;                 // generations per user per rolling hour
const DEFAULT_PLACES_DAILY_BUDGET_USD = 50;            // rolling 24h Places spend hard cap

// Affiliate URL templates
const BOOKING_TEMPLATE = "https://www.booking.com/search.html?ss={loc}&aid={aid}";
const VIATOR_TEMPLATE = "https://www.viator.com/searchResults/all?text={name}&mcid={mcid}";
const GETYOURGUIDE_TEMPLATE = "https://www.getyourguide.com/s/?q={name}&partner_id={pid}";

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
  userContent: string,
  tool: ClaudeTool,
  maxTokens: number,
  pipelineStartedAt: number,
  step: string,
): Promise<ClaudeCallResult<T>> {
  if (!apiKey) {
    throw new Error("callClaudeHaiku: ANTHROPIC_API_KEY is empty");
  }
  if (systemBlocks.length === 0) {
    throw new Error("callClaudeHaiku: at least one system block is required");
  }

  // Remaining wall-clock budget before Supabase SIGKILLs the function. If it's
  // already gone, fail fast without spending an Anthropic call. Otherwise wrap
  // the fetch in an AbortController so a slow-to-finish rank call gets
  // interrupted cleanly instead of the whole function getting SIGKILLed.
  const remaining =
    PIPELINE_WALL_CLOCK_MS - (Date.now() - pipelineStartedAt) - PIPELINE_TIMEOUT_BUFFER_MS;
  if (remaining <= 0) {
    throw new PipelineError(
      step,
      "Trip generation took too long at rank step — try a shorter trip or fewer vibes.",
      `pipeline budget exhausted before "${step}" Anthropic call (elapsed ${Date.now() - pipelineStartedAt}ms)`,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), remaining);

  const body = {
    model: HAIKU_MODEL,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages: [{ role: "user", content: userContent }],
    tools: [
      {
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
      },
    ],
    tool_choice: { type: "tool", name: tool.name },
  };

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
        throw new PipelineError(
          step,
          "Trip generation took too long at rank step — try a shorter trip or fewer vibes.",
          `Anthropic fetch aborted after ${remaining}ms budget during step "${step}" (tool="${tool.name}")`,
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
        throw new PipelineError(
          step,
          "Trip generation took too long at rank step — try a shorter trip or fewer vibes.",
          `Anthropic response body aborted after ${remaining}ms budget during step "${step}" (tool="${tool.name}")`,
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

// ---------------------------------------------------------------------------
// Streaming Anthropic call — used by the SSE pipeline so the rankAndEnrich
// tool input can be parsed & emitted day-by-day as it arrives.
//
// Anthropic's Messages API streams tool_use blocks as a sequence of events:
//   - content_block_start { type: "tool_use", id, name, input: {} }
//   - content_block_delta { delta: { type: "input_json_delta", partial_json: "..." } }
//   - content_block_stop
//   - message_delta { delta: { stop_reason } }
//   - message_stop
// We concatenate `partial_json` strings to reconstruct the full tool input.
//
// Caller passes:
//   - onPartial(chunk): called with each partial_json string. Caller can run
//     an incremental parser to detect day boundaries.
// On completion the full reconstructed JSON string is returned along with
// usage tokens, mirroring callClaudeHaiku's shape.
// ---------------------------------------------------------------------------

async function callClaudeHaikuStreaming(
  apiKey: string,
  systemBlocks: ClaudeSystemBlock[],
  userContent: string,
  tool: ClaudeTool,
  maxTokens: number,
  pipelineStartedAt: number,
  step: string,
  onPartial: (chunk: string) => void,
): Promise<{ json: string; usage: ClaudeUsage }> {
  if (!apiKey) {
    throw new Error("callClaudeHaikuStreaming: ANTHROPIC_API_KEY is empty");
  }
  if (systemBlocks.length === 0) {
    throw new Error("callClaudeHaikuStreaming: at least one system block is required");
  }

  const remaining =
    PIPELINE_WALL_CLOCK_MS - (Date.now() - pipelineStartedAt) - PIPELINE_TIMEOUT_BUFFER_MS;
  if (remaining <= 0) {
    throw new PipelineError(
      step,
      "Trip generation took too long at rank step — try a shorter trip or fewer vibes.",
      `pipeline budget exhausted before "${step}" Anthropic streaming call (elapsed ${Date.now() - pipelineStartedAt}ms)`,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), remaining);

  const body = {
    model: HAIKU_MODEL,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages: [{ role: "user", content: userContent }],
    tools: [
      {
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
      },
    ],
    tool_choice: { type: "tool", name: tool.name },
    stream: true,
  };

  const callStart = Date.now();
  let firstByteAt = 0;
  let firstDeltaAt = 0;
  let usage: ClaudeUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  const accumulator: string[] = [];
  let totalLen = 0;

  try {
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
          "accept": "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      const err = e as Error;
      if (controller.signal.aborted || err?.name === "AbortError") {
        throw new PipelineError(
          step,
          "Trip generation took too long at rank step — try a shorter trip or fewer vibes.",
          `Anthropic streaming fetch aborted after ${remaining}ms budget during step "${step}"`,
        );
      }
      throw new Error(`Anthropic network error calling streaming "${tool.name}": ${err.message}`);
    }

    firstByteAt = Date.now();

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const snippet = errBody.slice(0, 500);
      throw new Error(`Anthropic streaming error ${res.status} for "${tool.name}". Body: ${snippet}`);
    }

    if (!res.body) {
      throw new Error(`Anthropic streaming response had no body for "${tool.name}"`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      sseBuf += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines (\n\n). Process whole frames.
      let nl: number;
      while ((nl = sseBuf.indexOf("\n\n")) >= 0) {
        const frame = sseBuf.slice(0, nl);
        sseBuf = sseBuf.slice(nl + 2);

        // Frame is one or more "field: value" lines. We care about `data:`.
        let eventName: string | null = null;
        let dataLine: string | null = null;
        for (const rawLine of frame.split("\n")) {
          if (rawLine.startsWith("event:")) {
            eventName = rawLine.slice(6).trim();
          } else if (rawLine.startsWith("data:")) {
            dataLine = rawLine.slice(5).trim();
          }
        }
        if (!dataLine) continue;
        if (dataLine === "[DONE]") continue;

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(dataLine);
        } catch {
          continue;
        }

        const type = (payload.type as string) ?? eventName ?? "";

        if (type === "content_block_delta") {
          const delta = payload.delta as { type?: string; partial_json?: string } | undefined;
          if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
            if (!firstDeltaAt) firstDeltaAt = Date.now();
            accumulator.push(delta.partial_json);
            totalLen += delta.partial_json.length;
            try {
              onPartial(delta.partial_json);
            } catch (e) {
              console.error(`[stream.${step}] onPartial threw:`, e);
            }
          }
        } else if (type === "message_start") {
          const msg = payload.message as { usage?: Record<string, unknown> } | undefined;
          const u = msg?.usage as Record<string, number> | undefined;
          if (u) {
            usage.input_tokens = u.input_tokens ?? usage.input_tokens;
            usage.cache_creation_input_tokens = u.cache_creation_input_tokens ?? usage.cache_creation_input_tokens;
            usage.cache_read_input_tokens = u.cache_read_input_tokens ?? usage.cache_read_input_tokens;
          }
        } else if (type === "message_delta") {
          const u = payload.usage as Record<string, number> | undefined;
          if (u) {
            usage.output_tokens = u.output_tokens ?? usage.output_tokens;
          }
        } else if (type === "error") {
          const err = payload.error as { message?: string; type?: string } | undefined;
          throw new Error(
            `Anthropic stream error during "${tool.name}": ${err?.type ?? "unknown"} ${err?.message ?? ""}`,
          );
        }
      }
    }

    const json = accumulator.join("");
    console.log(
      `[timing] llm.${step}.stream ttfb_ms=${firstByteAt - callStart} ` +
        `ttft_ms=${firstDeltaAt ? firstDeltaAt - callStart : -1} ` +
        `total_ms=${Date.now() - callStart} ` +
        `input_tokens=${usage.input_tokens} output_tokens=${usage.output_tokens} ` +
        `cache_read=${usage.cache_read_input_tokens} bytes=${totalLen}`,
    );
    return { json, usage };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// TripStreamParser — incremental JSON parser for the rankAndEnrich tool input.
//
// Schema (from RANKER_TOOL):
//   { trip_title, trip_summary, packing_suggestions, accommodation, days: [...] }
//
// Goal: emit each completed `days[N]` object as soon as its closing `}` arrives,
// so downstream code can hydrate + emit a `day` SSE frame to the client without
// waiting for the entire 9-12k-token output.
//
// State machine handles:
//   - JSON string scanning with backslash escapes
//   - Brace/bracket depth counting
//   - Detecting the `days` key by walking back from the `[` at root depth and
//     matching the immediately-preceding `"<key>" :` pattern
//
// Property emission order is model-controlled — RANKER_SYSTEM_PROMPT nudges
// Haiku to emit `days` first, but if the model emits other keys before `days`
// the parser simply skips past them (their bytes are kept in the buffer but
// don't trigger emission).
// ---------------------------------------------------------------------------

class TripStreamParser {
  private buf = "";
  private pos = 0;
  private inString = false;
  private escapeNext = false;
  private depth = 0;
  private daysArrayActive = false;
  private daysArrayDepth = -1;
  private currentDayStart = -1;
  private daysSeen = 0;

  constructor(private onDay: (json: string) => void) {}

  feed(chunk: string): void {
    this.buf += chunk;
    while (this.pos < this.buf.length) {
      const c = this.buf[this.pos];

      if (this.inString) {
        if (this.escapeNext) {
          this.escapeNext = false;
        } else if (c === "\\") {
          this.escapeNext = true;
        } else if (c === '"') {
          this.inString = false;
        }
        this.pos++;
        continue;
      }

      if (c === '"') {
        this.inString = true;
        this.pos++;
        continue;
      }

      if (c === "{" || c === "[") {
        if (
          c === "[" &&
          !this.daysArrayActive &&
          this.depth === 1 &&
          this.precedingKeyIs("days")
        ) {
          this.daysArrayActive = true;
          this.daysArrayDepth = this.depth;
        }

        if (
          this.daysArrayActive &&
          c === "{" &&
          this.depth === this.daysArrayDepth
        ) {
          this.currentDayStart = this.pos;
        }

        this.depth++;
        this.pos++;
        continue;
      }

      if (c === "}" || c === "]") {
        this.depth--;

        if (
          this.daysArrayActive &&
          c === "]" &&
          this.depth === this.daysArrayDepth - 1
        ) {
          this.daysArrayActive = false;
          this.daysArrayDepth = -1;
        }

        if (
          this.daysArrayActive &&
          c === "}" &&
          this.depth === this.daysArrayDepth &&
          this.currentDayStart >= 0
        ) {
          const dayJson = this.buf.slice(this.currentDayStart, this.pos + 1);
          this.currentDayStart = -1;
          this.daysSeen++;
          try {
            this.onDay(dayJson);
          } catch (e) {
            console.error(`[TripStreamParser] onDay threw on day ${this.daysSeen}:`, (e as Error).message);
          }
        }

        this.pos++;
        continue;
      }

      this.pos++;
    }
  }

  full(): string {
    return this.buf;
  }

  daysEmitted(): number {
    return this.daysSeen;
  }

  private precedingKeyIs(key: string): boolean {
    let i = this.pos - 1;
    while (i >= 0 && /\s/.test(this.buf[i])) i--;
    if (i < 0 || this.buf[i] !== ":") return false;
    i--;
    while (i >= 0 && /\s/.test(this.buf[i])) i--;
    if (i < 0 || this.buf[i] !== '"') return false;
    const closeQuote = i;
    i--;
    while (i >= 0) {
      if (this.buf[i] === '"' && (i === 0 || this.buf[i - 1] !== "\\")) {
        return this.buf.slice(i + 1, closeQuote) === key;
      }
      i--;
    }
    return false;
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
- Start from the user's explicit vibes[] array.
- Add vibes that are clearly implied by free_text (e.g. "we want to eat our way through" => add "foodie"; "chill beach days" => add "beach", "slow").
- Short lowercase tags, 1-3 words each. De-duplicate.

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
  const result = await callClaudeHaiku<{
    destination: string;
    vibes: string[];
    must_haves: string[];
    must_avoids: string[];
    budget_tier: "budget" | "mid-range" | "premium";
    pace: "leisurely" | "balanced" | "active";
    dietary: string[];
    group_composition: string;
  }>(
    anthropicKey,
    [{ type: "text", text: INTENT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    buildIntentUserMessage(body, destinationHint),
    INTENT_TOOL,
    1024,
    pipelineStartedAt,
    "parseIntent",
  );

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

  const rawNotes = [body.notes ?? "", body.free_text ?? ""].filter(Boolean).join("\n\n").trim();

  return {
    destination: result.data.destination ?? "",
    vibes: Array.isArray(result.data.vibes) ? result.data.vibes : [],
    must_haves: Array.isArray(result.data.must_haves) ? result.data.must_haves : [],
    must_avoids: Array.isArray(result.data.must_avoids) ? result.data.must_avoids : [],
    budget_tier: result.data.budget_tier ?? "mid-range",
    pace: result.data.pace ?? "balanced",
    dietary: Array.isArray(result.data.dietary) ? result.data.dietary : [],
    group_composition: result.data.group_composition ?? "group",
    raw_notes: rawNotes,
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

function themeForDay(opts: {
  isFirst: boolean;
  isLast: boolean;
  isRest: boolean;
  pace: Intent["pace"];
}): string {
  if (opts.isFirst) return "Arrival & settling in";
  if (opts.isLast) return "Last highlights & departure";
  if (opts.isRest) return "Rest day — recharge";
  if (opts.pace === "active") return "Full exploration";
  if (opts.pace === "leisurely") return "Slow wandering";
  return "Balanced exploration";
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
      // Arrival day: afternoon arrival buffer, one light sight, dinner.
      slots.push({ type: "arrival", start_time: hhmm(13, 0), duration_minutes: 180, region_tag_for_queries: transitHub });
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 30), duration_minutes: 75, region_tag_for_queries: primary });
      slots.push({ type: "afternoon_major", start_time: hhmm(16, 0), duration_minutes: 120, region_tag_for_queries: primary });
      slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
    } else if (isLast) {
      // Departure day: morning highlight, farewell lunch, then departure buffer.
      // Breakfast is dropped — the day already has lunch + a transit anchor;
      // morning_major is the more valuable slot before flight time.
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
      // Leisurely / "light": food anchors only on full interior days. No
      // morning_major, no afternoon_major, no breakfast — the user explicitly
      // asked for minimal pre-planning. Arrival and departure days keep their
      // bookend activity (handled in the isFirst/isLast branches above) so
      // transit days don't collapse to lunch + dinner around a flight.
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 30), duration_minutes: 90, region_tag_for_queries: primary });
      slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
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
      // Balanced (default): breakfast, morning + afternoon major, dinner, optional nightlife.
      slots.push({ type: "breakfast", start_time: hhmm(9, 0), duration_minutes: 45, region_tag_for_queries: primary });
      slots.push({ type: "morning_major", start_time: hhmm(10, 0), duration_minutes: 150, region_tag_for_queries: primary });
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 75, region_tag_for_queries: primary });
      slots.push({ type: "afternoon_major", start_time: hhmm(14, 30), duration_minutes: 150, region_tag_for_queries: primary });
      slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
      if (wantsNightlife && !isFirst) {
        slots.push({ type: "nightlife", start_time: hhmm(dinnerStart + 2, 30), duration_minutes: 90, region_tag_for_queries: primary });
      }
    }

    days.push({
      date,
      day_number: d + 1,
      theme: themeForDay({ isFirst, isLast, isRest, pace: intent.pace }),
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

  for (const kind of trimOrder) {
    if (totalSlots() <= budget) break;
    const byLength = [...days].sort((a, b) => b.slots.length - a.slots.length);
    for (const day of byLength) {
      if (totalSlots() <= budget) break;
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
  const topVibe = intent.vibes[0] ?? "";
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

  // ---- Attractions (base + top vibe specialization) ----
  if (slotTypesSeen.has("morning_major") || slotTypesSeen.has("afternoon_major")) {
    add("attractions:base", {
      textQuery: `${sightPrefix}top attractions ${city}`,
      locationBias,
      poolKey: "attractions",
    });
    if (topVibe) {
      add(`attractions:vibe:${topVibe.toLowerCase()}`, {
        textQuery: `${sightPrefix}${topVibe} ${city}`,
        locationBias,
        poolKey: "attractions",
      });
    }
  }

  // ---- Nightlife ----
  if (slotTypesSeen.has("nightlife")) {
    add("nightlife:base", {
      textQuery: `${wantsRooftop ? "rooftop " : ""}bars ${city}`,
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
  userId: string,
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
const PLACES_DETAILS_FIELD_MASK =
  "id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,priceRange,types,photos,googleMapsUri,businessStatus,addressComponents";

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
        // Fire-and-forget cache write so the next trip/concierge query in the
        // same bucket can skip Google.
        cacheSet(svcClient, "search", cacheKey, places).catch(() => {});
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
  const unique = Array.from(new Set(placeIds)).slice(0, MAX_FINALIST_HYDRATIONS);

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
        cacheSet(svcClient, "details", id, data).catch(() => {});
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
): Promise<EventCandidate[]> {
  // ---- Heuristic short-circuit ----
  if (!shouldSearchEvents(intent, skeleton)) {
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

// Clamp LLM-quoted cost against Google's priceLevel band in the trip's local
// currency. LLM is allowed to exceed the band by ≤ 20 % before we clamp — this
// avoids noise on values that are plausibly right but unlucky. Free venues
// always return 0. Warn (not throw) so the trip still ships.
function clampCostPerPerson(
  llmCost: number,
  priceLevel: string | null,
  currency: string,
  venueTitle: string,
): number {
  if (!Number.isFinite(llmCost) || llmCost < 0) return 0;
  const idx = priceLevelIndex(priceLevel);
  if (idx === 0) return 0;
  if (idx < 0) return llmCost; // unknown priceLevel — trust the LLM
  const band = PRICE_BANDS[currency] ?? PRICE_BANDS.USD;
  const upper = band[idx - 1];
  const tolerated = upper * 1.2;
  if (llmCost > tolerated) {
    console.warn(
      `[rankAndEnrich] clamped "${venueTitle}" from ${llmCost} ${currency} → ${upper} ${currency} ` +
        `(priceLevel=${priceLevel}, band upper=${upper}, tolerated=${tolerated.toFixed(0)})`,
    );
    return upper;
  }
  return llmCost;
}

// ---------------------------------------------------------------------------
// Static system prompt (cache_control: ephemeral). Keep stable — every edit
// busts the prompt cache across the whole codebase.
// ---------------------------------------------------------------------------

const RANKER_SYSTEM_PROMPT = `You are an editorial trip curator for Junto. Your job is to pick venues from the provided venue pool and write specific, honest, opinionated copy for each slot in the day skeleton.

ABSOLUTE RULES — violating any of these makes your output useless:
1. Every activity you emit MUST reference a place_id that appears in the provided venue pool. NEVER invent a place_id. If the pool truly has no fit for a slot, emit place_id=null AND set is_event=false — the validator will drop the slot. Events from the events list are the only case where place_id may be null AND is_event=true.
2. Never assign the same place_id to two different slots in the same trip. The only exception: accommodation may repeat across nights — but pick one lodging venue for the whole destination.
3. Honor start_time and duration_minutes from the skeleton slot exactly as given. Do not reshape pacing. Your job is editorial, not scheduling.
4. Filter venues that violate intent.must_avoids BEFORE picking. If the only remaining pool candidates violate must_avoids, pick the least-bad and say so honestly in why_for_you.
5. slot_type must match the skeleton — if the slot is "dinner", do not pick a museum.
6. Pick exactly one activity per slot in the skeleton. If a slot is "arrival", "departure", "transit_buffer", or "rest", emit an activity whose category reflects the downtime (e.g. "transit" or "rest") with a short helpful description ("Arrive, check in, unpack" / "Return to the hotel; you've earned it"). place_id=null is acceptable for pure-downtime slots — set is_event=false.

EDITORIAL VOICE — MANDATORY, NOT OPTIONAL:
- Never generic. "Great restaurant" is banned. "A cozy spot" is banned. "Popular with locals" is banned unless you can name the specific local tradition, regular dish, or community ritual that makes it popular. Every description cites something specific to THAT venue: a signature dish, a view, a founder's name, an architectural detail, a ritual, the year it opened, the pastry that sells out by 10am.
- why_for_you MUST reference a concrete signal from the user's parsed intent — a vibe, a must_have, a dietary preference, a pace descriptor, or their group_composition. If no real match exists, say so honestly: "No strong match on your stated vibes; picked because the dinner pool was thin and this is the strongest remaining option." Do NOT fabricate a match.
- pro_tip MUST be actionable and specific. Banned: "Consider booking ahead", "Arrive early", "Check their website". Required format examples: "Book 2 weeks ahead for a terrace table overlooking the plaza", "Order the black cod miso — it's what regulars come back for", "Arrive 15 minutes before the 11am tour to beat the noon bus", "Ask for the chef's tasting if the bar counter is open — not on the printed menu".
- skip_if is OPTIONAL but HONEST negative signal. Include only when there's a real caveat — do not invent caveats. Good examples: "Skip if you dislike communal seating", "Skip if you're vegetarian — the menu is 90 % seafood", "Skip if stairs are hard for you — the climb has 400 steps". Empty string or null when no genuine caveat.
- description is 2–3 sentences, evocative but concrete. No travel-brochure adjectives ("stunning", "breathtaking", "world-class", "iconic", "must-see") unless immediately grounded in a specific observation. "Stunning view" is banned. "The rooftop terrace frames the cathedral bell tower dead center at sunset" is fine.

COST GUIDANCE:
- estimated_cost_per_person is an HONEST expected spend in the trip's local currency (provided in the user message). Google's priceLevel is the anchor: 1 ≈ cheap, 2 ≈ moderate, 3 ≈ expensive, 4 ≈ very expensive.
- The system will CLAMP your number against currency bands after you respond. Staying within ±20 % of the band upper bound is safe; going wildly over is wasted work because we'll clamp it.
- For lodging, cost is per room per night (assume a standard double).
- For attractions with free admission, use 0.
- For bars/nightlife, cost is a reasonable 2-drink average.
- NEVER quote USD when the trip currency is something else. The user message tells you which currency to use.

DIETARY:
- If intent.dietary contains values (vegan, vegetarian, halal, kosher, gluten-free, etc.), only pick food venues that plausibly serve them — or annotate dietary_notes with a specific caveat such as "vegetarian options available but menu is heavily meat-focused".
- dietary_notes is OPTIONAL. Only fill it for food activities when there's a real dietary consideration for THIS user.

MUST-AVOIDS HANDLING (specific examples):
- "tourist traps" → skip venues that are obviously the top tourist sight (the ones every major travel blog puts first). Prefer the 4.3–4.6 neighborhood gem over the 4.7 megasight. When you must pick a popular sight, justify it in why_for_you.
- "chain restaurants" → skip venues whose displayName matches a globally recognized chain (Starbucks, McDonald's, Hard Rock Cafe, etc.). Local-only franchise chains are okay if distinctive.
- "crowds" → prefer venues with 50–500 reviews where the rating is still ≥ 4.2. Avoid 5000-review megasights.
- "loud" → avoid venues with "lively" / "bustling" / "party" markers in types/displayName.

JUNTO PICKS:
- is_junto_pick is computed later by code — do NOT set it yourself. Leave it out of your output.

ACCOMMODATION:
- Pick ONE lodging for the whole destination from the "lodging" pool. Prefer rating ≥ 4.3, reviews 100+, and a priceLevel consistent with intent.budget_tier. If the pool is thin, pick the best available and note the limitation.

EVENTS (may be empty):
- The events list contains snippets from web search — dates are often missing or wrong. Only slot an event into the itinerary when there's a nightlife slot for it AND the event appears genuinely relevant to the trip's vibes. When you do include an event, set is_event=true and place_id=null.

TRIP SUMMARY:
- trip_title: 4–7 words, evocative, grounded in one specific thing the user is doing (a ritual, a season, a neighborhood). Not "Amazing Portugal Getaway". Try "Porto's Riverside Food & Port Nights".
- trip_summary: 2–3 sentences. Name one thing the traveler will taste, one thing they'll see, one thing they'll feel. No adjective spam.
- packing_suggestions: 5–8 items, weather-specific and activity-specific. Not "comfortable shoes" — "closed-toe walking shoes for the cobblestones on Rua das Flores".

OUTPUT: you MUST call the emit_trip tool with the full structured response. Do not include any text outside the tool call.

OUTPUT ORDERING (STREAMING-AWARE):
- Emit the "days" field FIRST in the tool input, before "trip_title", "trip_summary", "packing_suggestions", and "accommodation". The frontend streams day cards into the UI as soon as each day's JSON closes — every property emitted before "days" delays the user's first visible card. The order MUST be: days, then accommodation, then trip_title, trip_summary, packing_suggestions.`;

// ---------------------------------------------------------------------------
// Tool schema — forces the model into a structured emit_trip call.
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

const RANKER_TOOL: ClaudeTool = {
  name: "emit_trip",
  description: "Emit the full ranked & enriched trip. Call this exactly once.",
  input_schema: {
    type: "object",
    required: ["trip_title", "trip_summary", "packing_suggestions", "accommodation", "days"],
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
      days: {
        type: "array",
        items: {
          type: "object",
          required: ["day_number", "theme", "activities"],
          properties: {
            day_number: { type: "integer" },
            theme: { type: "string" },
            activities: {
              type: "array",
              items: RANKER_ACTIVITY_SCHEMA,
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

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
  };
}

function buildRankerUserMessage(
  intent: Intent,
  skeleton: DaySkeleton[],
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
  events: EventCandidate[],
  currency: string,
  countryCode: string | null,
): string {
  // Merge the consolidated "restaurants" pool into both lunch and dinner so
  // the ranker sees a rich meal-venue pool under each slot (it picks
  // meal-appropriate venues based on rating + types + opening signals).
  // Tone/vibe-specific queries (dinner:romantic / lunch:vibe:foodie) stay
  // in their own pools to preserve the biased options.
  const merged = new Map(venuesByPool);
  const shared = merged.get("restaurants") ?? [];
  if (shared.length > 0) {
    const lunch = merged.get("lunch") ?? [];
    const dinner = merged.get("dinner") ?? [];
    merged.set("lunch", dedupeByIdKeepFirst([...lunch, ...shared]));
    merged.set("dinner", dedupeByIdKeepFirst([...dinner, ...shared]));
    merged.delete("restaurants");
  }

  // Condense pool: per pool, sort by (rating desc, reviews desc), cap at 15.
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
    skeleton: skeleton.map((d) => ({
      day_number: d.day_number,
      date: d.date,
      theme: d.theme,
      slots: d.slots.map((s, i) => ({
        slot_index: i,
        type: s.type,
        start_time: s.start_time,
        duration_minutes: s.duration_minutes,
        region_tag: s.region_tag_for_queries,
      })),
    })),
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
  return `Rank, assign, and enrich this trip. Return exactly one emit_trip tool call.\n\n${JSON.stringify(payload)}`;
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
    ? clampCostPerPerson(raw.estimated_cost_per_person, place.priceLevel, currency, raw.title)
    : Math.max(0, raw.estimated_cost_per_person);

  const title = raw.title?.trim() || place?.displayName || "Activity";

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

interface RawRankerOutput {
  trip_title: string;
  trip_summary: string;
  packing_suggestions: string[];
  accommodation: RawRankerAccommodation;
  days: Array<{
    day_number: number;
    theme: string;
    activities: RawRankerActivity[];
  }>;
}

async function rankAndEnrich(
  anthropicKey: string,
  intent: Intent,
  skeleton: DaySkeleton[],
  venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
  events: EventCandidate[],
  googleKey: string,
  geo: GeocodeResult,
  logger: LLMLogger,
  pipelineStartedAt: number,
): Promise<PipelineResult> {
  const currency = resolveTripCurrency(geo.country_code);

  // Build an id → place map spanning every pool so hydration can resolve
  // place_ids regardless of which pool the ranker drew from.
  const placeById = new Map<string, BatchPlaceResult>();
  for (const venues of venuesByPool.values()) {
    for (const v of venues) placeById.set(v.id, v);
  }

  const result = await callClaudeHaiku<RawRankerOutput>(
    anthropicKey,
    [{ type: "text", text: RANKER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    buildRankerUserMessage(intent, skeleton, venuesByPool, events, currency, geo.country_code),
    RANKER_TOOL,
    RANK_MAX_TOKENS[intent.pace],
    pipelineStartedAt,
    "rankAndEnrich",
  );

  await logger.log({
    feature: "trip_builder_rank",
    model: HAIKU_MODEL,
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    cost_usd: computeHaikuCost(result.usage),
    cached: result.usage.cache_read_input_tokens > 0,
  });

  if (!result.data) {
    throw new Error("rankAndEnrich: Claude returned no tool input");
  }
  const raw = result.data;

  // ---- Assemble days, honoring skeleton slot order ----
  const ranked_days: RankedDay[] = [];
  const seenIds = new Set<string>();
  for (const day of skeleton) {
    const rawDay = raw.days.find((d) => d.day_number === day.day_number);
    const theme = rawDay?.theme?.trim() || day.theme;
    const activities: EnrichedActivity[] = [];
    const rawActs = rawDay?.activities ?? [];
    for (let i = 0; i < day.slots.length; i++) {
      const slot = day.slots[i];
      const rawAct = rawActs.find((a) => a.slot_index === i);
      if (!rawAct) continue;
      // Reject duplicate place_ids across the trip (ranker was instructed not
      // to reuse venues; guard in case it ignored the rule).
      if (rawAct.place_id && seenIds.has(rawAct.place_id)) continue;
      const place = rawAct.place_id ? placeById.get(rawAct.place_id) ?? null : null;
      // Non-event activities need a pool-resident place.
      if (!rawAct.is_event && rawAct.place_id && !place) continue;
      const activity = hydrateActivity(rawAct, slot, place, googleKey, currency, events);
      if (!activity) continue;
      if (place) seenIds.add(place.id);
      activities.push(activity);
    }
    ranked_days.push({
      date: day.date,
      day_number: day.day_number,
      theme,
      activities,
    });
  }

  // ---- Accommodation ----
  let accommodation: EnrichedActivity | undefined;
  if (raw.accommodation.place_id) {
    const place = placeById.get(raw.accommodation.place_id) ?? null;
    if (place) {
      const fakeSlot: PacingSlot = {
        type: "lodging",
        start_time: "15:00",
        duration_minutes: 0,
        region_tag_for_queries: "primary",
      };
      const hydrated = hydrateActivity(
        {
          slot_index: -1,
          slot_type: "lodging",
          place_id: raw.accommodation.place_id,
          is_event: false,
          title: raw.accommodation.title,
          description: raw.accommodation.description,
          pro_tip: raw.accommodation.pro_tip,
          why_for_you: raw.accommodation.why_for_you,
          skip_if: raw.accommodation.skip_if,
          category: "accommodation",
          estimated_cost_per_person: raw.accommodation.estimated_cost_per_person,
          dietary_notes: raw.accommodation.dietary_notes,
        },
        fakeSlot,
        place,
        googleKey,
        currency,
      );
      if (hydrated) accommodation = hydrated;
    }
  }

  // ---- Trip-level rollups ----
  const total_activities = ranked_days.reduce((n, d) => n + d.activities.length, 0);
  const numDays = skeleton.length;
  const dailySpend = ranked_days.map((d) =>
    d.activities.reduce((s, a) => s + (a.estimated_cost_per_person || 0), 0),
  );
  const daily_budget_estimate = numDays > 0
    ? Math.round(dailySpend.reduce((s, n) => s + n, 0) / numDays)
    : 0;

  const destination: RankedDestination = {
    name: intent.destination,
    start_date: skeleton[0]?.date ?? "",
    end_date: skeleton[skeleton.length - 1]?.date ?? "",
    intro: raw.trip_summary?.trim() ?? "",
    days: ranked_days,
    accommodation,
  };

  return {
    trip_title: raw.trip_title?.trim() ?? intent.destination,
    trip_summary: raw.trip_summary?.trim() ?? "",
    destinations: [destination],
    map_center: { lat: geo.lat, lng: geo.lng },
    map_zoom: 12,
    daily_budget_estimate,
    currency,
    packing_suggestions: Array.isArray(raw.packing_suggestions) ? raw.packing_suggestions.slice(0, 10) : [],
    total_activities,
    budget_tier: intent.budget_tier,
  };
}

// ---------------------------------------------------------------------------
// Step 8: post-ranking finishers (all pure code, no LLM)
// ---------------------------------------------------------------------------

// ---- markJuntoPicks ----
//
// Marks 2–3 activities per trip with is_junto_pick=true. Qualifying bar:
//   rating >= 4.5 AND user_rating_count in [50, 500]  (hidden-gem band)
//   AND the activity matches >= 2 intent signals (vibe / must_have / dietary).
// Events never qualify (no rating/review data).
// Fewer than 2 qualifiers → mark what we have; never force a bad pick.

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
  // Score every candidate across the whole trip, then pick up to 3.
  interface Candidate { act: EnrichedActivity; score: number; }
  const candidates: Candidate[] = [];

  for (const dest of result.destinations) {
    for (const day of dest.days) {
      for (const act of day.activities) {
        // Events ineligible — no rating/review data.
        if (!act.place_id) continue;
        const rating = act.rating ?? 0;
        const reviews = act.user_rating_count ?? 0;
        if (rating < 4.5) continue;
        if (reviews < 50 || reviews > 500) continue;
        const signalMatches = countIntentSignalMatches(act, intent);
        if (signalMatches < 2) continue;
        // Tie-breaker: higher signalMatches, then higher rating, then fewer reviews
        // (hidden-gem bias — prefer 80-review 4.7 over 450-review 4.6).
        const score =
          signalMatches * 1000 +
          rating * 10 -
          reviews / 100;
        candidates.push({ act, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates.slice(0, 3)) {
    c.act.is_junto_pick = true;
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

function buildAffiliateUrl(
  place: BatchPlaceResult | null,
  env: { booking: string; viator: string; gyg: string },
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
    case "booking":
      return {
        booking_url: BOOKING_TEMPLATE
          .replace("{loc}", urlencode(nameWithCity))
          .replace("{aid}", urlencode(env.booking)),
        booking_partner: "booking",
      };
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

  if (totalBefore > 0 && dropped / totalBefore > VALIDATION_DROP_THRESHOLD) {
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
  userId: string,
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
  userId: string,
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

async function buildIntentCacheKey(intent: Intent, numDays: number): Promise<string> {
  const shape = {
    destination: intent.destination.toLowerCase().trim(),
    days: numDays,
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
    // ---- Auth ----
    loggedStep = "auth";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    loggedUserId = user.id;

    const body: TripBuilderRequest = await req.json();
    if (typeof body?.destination === "string" && body.destination.trim()) {
      loggedDestination = body.destination.trim();
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

    let startDate: string;
    let endDate: string;
    if (body.flexible || (!body.start_date && !body.end_date)) {
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

    const numDays = daysBetween(startDate, endDate);
    if (numDays < 1) {
      return jsonResponse({ success: false, error: "end_date must be on or after start_date" }, 400);
    }
    if (numDays > 21) {
      return jsonResponse({ success: false, error: "Trip duration cannot exceed 21 days" }, 400);
    }

    // ---- Required env ----
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    const bookingAid = Deno.env.get("BOOKING_AID") ?? "";
    const viatorMcid = Deno.env.get("VIATOR_MCID") ?? "";
    const gygPid = Deno.env.get("GETYOURGUIDE_PARTNER_ID") ?? "";

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
    const logger = makeLLMLogger(svcClient, user.id);

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
    const rateLimit = Number.parseInt(Deno.env.get("RATE_LIMIT_TRIPS_PER_HOUR") ?? "", 10);
    const effectiveRateLimit = Number.isFinite(rateLimit) && rateLimit > 0 ? rateLimit : DEFAULT_RATE_LIMIT_PER_HOUR;
    const recentCount = await userGenerationsInLastHour(svcClient, user.id);
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
    //   event: progress     { stage, ...detail }       (UX heartbeats)
    //   event: meta         { destination, country_code, dates: [...], skeleton, currency, num_days }
    //   event: image        { url }                    (when destination cover resolves)
    //   event: day          { day_number, date, theme, activities }  (one per closed day)
    //   event: trip_complete { trip_title, trip_summary, accommodation, packing_suggestions, junto_pick_place_ids, daily_budget_estimate, total_activities, map_center, map_zoom, currency, budget_tier }
    //   event: error        { error, step, message }
    //   event: ping         {}                         (10s keepalive)
    //
    // The full payload is also written to ai_response_cache so non-streaming
    // callers (TripBuilderFlow, useResultsState) keep working from the same
    // intent-keyed cache.
    // =========================================================================
    const wantsStream = (req.headers.get("accept") ?? "").toLowerCase().includes("text/event-stream");
    if (wantsStream) {
      const encoder = new TextEncoder();
      const closedRef = { closed: false };
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            if (closedRef.closed) return;
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            } catch (e) {
              console.error("[stream] enqueue failed:", (e as Error).message);
            }
          };
          const ping = setInterval(() => {
            if (closedRef.closed) return;
            try { controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`)); } catch {}
          }, 10_000);

          let stepLabel = "stream_init";
          try {
            send("progress", { stage: "parsing_intent" });

            // ---- parseIntent in parallel with geocode (non-surprise) ----
            const tParseIntent = Date.now();
            const earlyGeocodePromise: Promise<GeocodeResult> | null = !surpriseMe && rawDest
              ? geocodeDestination(googleKey, rawDest, svcClient, user.id).catch((e) => { throw e; })
              : null;
            stepLabel = "parseIntent";
            checkPipelineTimeout(pipelineStartedAt, stepLabel);
            const intent = await parseIntent(anthropicKey, body, surpriseMe ? "" : rawDest, logger, pipelineStartedAt);
            tStage("parse_intent", tParseIntent);
            if (intent.destination) loggedDestination = intent.destination;

            if (surpriseMe) {
              send("progress", { stage: "picking_destination" });
              stepLabel = "pickSurpriseDestination";
              checkPipelineTimeout(pipelineStartedAt, stepLabel);
              const tSurprise = Date.now();
              intent.destination = await pickSurpriseDestination(anthropicKey, intent, numDays, logger, pipelineStartedAt);
              tStage("pick_surprise", tSurprise);
              loggedDestination = intent.destination;
              send("progress", { stage: "destination_picked", destination: intent.destination });
            }

            // ---- Cache lookup ----
            stepLabel = "cacheLookup";
            checkPipelineTimeout(pipelineStartedAt, stepLabel);
            const tCacheLookup = Date.now();
            const cacheKey = await buildIntentCacheKey(intent, numDays);
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
              tStage("cache_lookup_hit", tCacheLookup);
              const payload = cached.response_json as Record<string, any>;
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
              for (const d of dest?.days ?? []) send("day", d);
              const juntoPlaceIds: string[] = [];
              for (const day of dest?.days ?? []) {
                for (const a of day.activities ?? []) if (a?.is_junto_pick && a.place_id) juntoPlaceIds.push(a.place_id);
              }
              send("trip_complete", {
                trip_title: payload?.trip_title ?? "",
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
                from_cache: true,
              });
              await logger.log({
                feature: "trip_builder_cache_hit", model: "cache",
                input_tokens: 0, output_tokens: 0, cost_usd: 0, cached: true,
              });
              console.log(`[timing-summary] ${JSON.stringify({ total_ms: Date.now() - pipelineStartedAt, cache_hit: true, stream: true, stages: stageTimings })}`);
              return;
            }
            tStage("cache_lookup_miss", tCacheLookup);

            // ---- Geocode + skeleton + queries ----
            send("progress", { stage: "geocoding" });
            stepLabel = "geocodeDestination";
            checkPipelineTimeout(pipelineStartedAt, stepLabel);
            const tGeocode = Date.now();
            const geo: GeocodeResult = earlyGeocodePromise
              ? await earlyGeocodePromise
              : await geocodeDestination(googleKey, intent.destination, svcClient, user.id);
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
            const maxPerPool = Math.max(3, Math.ceil(MAX_FINALIST_HYDRATIONS / Math.max(1, byPool.size)));
            for (const pool of byPool.values()) {
              for (const p of pool.slice(0, maxPerPool)) {
                if (seenFinalist.has(p.id)) continue;
                seenFinalist.add(p.id);
                finalistIds.push(p.id);
                if (finalistIds.length >= MAX_FINALIST_HYDRATIONS) break;
              }
              if (finalistIds.length >= MAX_FINALIST_HYDRATIONS) break;
            }
            const idToBase = new Map<string, BatchPlaceResult>();
            for (const p of places) idToBase.set(p.id, p);
            const tHydrate = Date.now();
            const { hydrated: hydratedById, stats: hydrationStats } = await hydrateFinalists(finalistIds, idToBase, googleKey, svcClient);
            tStage("hydrate_finalists", tHydrate);

            await logPlacesByTier(svcClient, logger, user.id, {
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

            // ---- Streaming rank: emit days as they close ----
            send("progress", { stage: "ranking" });
            stepLabel = "rankAndEnrich";
            checkPipelineTimeout(pipelineStartedAt, stepLabel);
            const tRank = Date.now();

            const currency = resolveTripCurrency(geo.country_code);
            const affEnv = { booking: bookingAid, viator: viatorMcid, gyg: gygPid };
            const ranked_days: RankedDay[] = [];
            const seenIds = new Set<string>();
            const emittedDayNumbers = new Set<number>();
            const allActivities: EnrichedActivity[] = [];
            let totalDropped = 0;

            const handleDay = (rawDay: { day_number?: number; theme?: string; activities?: RawRankerActivity[] }) => {
              if (typeof rawDay.day_number !== "number") return;
              if (emittedDayNumbers.has(rawDay.day_number)) return;
              const day = skeleton.find((d) => d.day_number === rawDay.day_number);
              if (!day) return;
              const theme = rawDay.theme?.trim() || day.theme;
              const activities: EnrichedActivity[] = [];
              const rawActs = Array.isArray(rawDay.activities) ? rawDay.activities : [];
              for (let i = 0; i < day.slots.length; i++) {
                const slot = day.slots[i];
                const rawAct = rawActs.find((a) => a?.slot_index === i);
                if (!rawAct) continue;
                if (rawAct.place_id && seenIds.has(rawAct.place_id)) continue;
                const place = rawAct.place_id ? placeById.get(rawAct.place_id) ?? null : null;
                if (!rawAct.is_event && rawAct.place_id && !place) continue;
                const activity = hydrateActivity(rawAct, slot, place, googleKey, currency, events);
                if (!activity) continue;
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
              ranked_days.push(rankedDay);
              emittedDayNumbers.add(rawDay.day_number);
              for (const a of validated.kept) allActivities.push(a);
              send("day", rankedDay);
            };

            const parser = new TripStreamParser((dayJson) => {
              try {
                const parsed = JSON.parse(dayJson);
                handleDay(parsed);
              } catch (e) {
                console.warn(`[stream.parser] day JSON.parse failed: ${(e as Error).message}`);
              }
            });

            const { json: fullJson, usage } = await callClaudeHaikuStreaming(
              anthropicKey,
              [{ type: "text", text: RANKER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
              buildRankerUserMessage(intent, skeleton, venuesByPool, events, currency, geo.country_code),
              RANKER_TOOL,
              RANK_MAX_TOKENS[intent.pace],
              pipelineStartedAt,
              "rankAndEnrich",
              (chunk) => parser.feed(chunk),
            );

            await logger.log({
              feature: "trip_builder_rank", model: HAIKU_MODEL,
              input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
              cost_usd: computeHaikuCost(usage),
              cached: usage.cache_read_input_tokens > 0,
            });
            tStage("rank_and_enrich", tRank);

            // ---- Final full-parse to recover trip-level fields + late days ----
            let raw: RawRankerOutput;
            try {
              raw = JSON.parse(fullJson) as RawRankerOutput;
            } catch (e) {
              throw new Error(`[stream] final tool JSON parse failed: ${(e as Error).message}`);
            }

            // Catch any days the streaming parser missed (defensive — shouldn't happen)
            for (const d of raw.days ?? []) {
              if (!emittedDayNumbers.has(d.day_number)) handleDay(d as any);
            }
            // Re-sort by day_number for downstream rollups
            ranked_days.sort((a, b) => a.day_number - b.day_number);

            // Trip-wide drop threshold check (mirrors validateActivities)
            const totalBefore = ranked_days.reduce((n, d) => n + d.activities.length, 0) + totalDropped;
            if (totalBefore > 0 && totalDropped / totalBefore > VALIDATION_DROP_THRESHOLD) {
              throw new Error(`Validation dropped ${totalDropped}/${totalBefore} activities (>${(VALIDATION_DROP_THRESHOLD * 100).toFixed(0)}%) — pool too thin`);
            }

            // ---- Accommodation ----
            let accommodation: EnrichedActivity | undefined;
            if (raw.accommodation?.place_id) {
              const place = placeById.get(raw.accommodation.place_id) ?? null;
              if (place) {
                const fakeSlot: PacingSlot = {
                  type: "lodging", start_time: "15:00", duration_minutes: 0, region_tag_for_queries: "primary",
                };
                const hydrated = hydrateActivity(
                  {
                    slot_index: -1, slot_type: "lodging", place_id: raw.accommodation.place_id, is_event: false,
                    title: raw.accommodation.title, description: raw.accommodation.description,
                    pro_tip: raw.accommodation.pro_tip, why_for_you: raw.accommodation.why_for_you,
                    skip_if: raw.accommodation.skip_if, category: "accommodation",
                    estimated_cost_per_person: raw.accommodation.estimated_cost_per_person,
                    dietary_notes: raw.accommodation.dietary_notes,
                  },
                  fakeSlot, place, googleKey, currency,
                );
                if (hydrated) {
                  const aff = buildAffiliateUrl(place, affEnv, hydrated.event_url);
                  hydrated.booking_url = aff.booking_url;
                  hydrated.booking_partner = aff.booking_partner;
                  accommodation = hydrated;
                }
              }
            }

            // ---- Trip-level rollups + junto picks ----
            const total_activities = ranked_days.reduce((n, d) => n + d.activities.length, 0);
            const dailySpend = ranked_days.map((d) => d.activities.reduce((s, a) => s + (a.estimated_cost_per_person || 0), 0));
            const daily_budget_estimate = ranked_days.length > 0
              ? Math.round(dailySpend.reduce((s, n) => s + n, 0) / ranked_days.length)
              : 0;

            const destinationFinal: RankedDestination = {
              name: intent.destination,
              start_date: skeleton[0]?.date ?? "",
              end_date: skeleton[skeleton.length - 1]?.date ?? "",
              intro: raw.trip_summary?.trim() ?? "",
              days: ranked_days,
              accommodation,
            };
            const pipelineResult: PipelineResult = {
              trip_title: raw.trip_title?.trim() ?? intent.destination,
              trip_summary: raw.trip_summary?.trim() ?? "",
              destinations: [destinationFinal],
              map_center: { lat: geo.lat, lng: geo.lng },
              map_zoom: 12,
              daily_budget_estimate,
              currency,
              packing_suggestions: Array.isArray(raw.packing_suggestions) ? raw.packing_suggestions.slice(0, 10) : [],
              total_activities,
              budget_tier: intent.budget_tier,
            };

            markJuntoPicks(pipelineResult, intent);

            const juntoPlaceIds: string[] = [];
            for (const day of ranked_days) {
              for (const a of day.activities) if (a.is_junto_pick && a.place_id) juntoPlaceIds.push(a.place_id);
            }

            // ---- Image (await final URL) ----
            const destinationImageUrl = await imagePromise;

            // ---- Cache write ----
            const responsePayload: Record<string, unknown> = {
              ...pipelineResult, destination_image_url: destinationImageUrl,
            };
            const tCacheWrite = Date.now();
            const { error: cacheInsErr } = await svcClient.from("ai_response_cache").insert({
              cache_key: cacheKey, response_json: responsePayload,
              expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            });
            if (cacheInsErr) {
              console.error("[stream] cache insert failed:", cacheInsErr);
              // Non-fatal at this point — we've already streamed days and are about to send trip_complete.
            }
            tStage("cache_write", tCacheWrite);

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
              from_cache: false,
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
              user_id: user.id, feature: "trip_builder_total", model: modelLabel,
              input_tokens: totals.input_tokens, output_tokens: totals.output_tokens,
              cost_usd: totals.cost_usd, cached: false,
            }).then((r: { error: { message: string } | null }) => {
              if (r.error) console.error("[stream.ai_request_log] insert failed:", r.error);
            });
            await svcClient.from("analytics_events").insert({
              event_name: "ai_trip_builder", user_id: user.id,
              properties: {
                source: "generated_stream", destination: intent.destination, days: numDays,
                budget_level: intent.budget_tier, pace: intent.pace, duration_ms: durationMs,
                places_ranking_live: rankingStats.live_calls, places_ranking_cache: rankingStats.cache_hits,
                places_details_live: hydrationStats.live_calls, places_details_cache: hydrationStats.cache_hits,
                llm_cost_usd: totals.cost_usd, days_emitted_streaming: emittedDayNumbers.size,
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
          } finally {
            clearInterval(ping);
            closedRef.closed = true;
            try { controller.close(); } catch {}
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
      ? geocodeDestination(googleKey, rawDest, svcClient, user.id).catch((e) => {
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
    if (intent.destination) loggedDestination = intent.destination;

    // ---- Step 1.5: surprise destination picker (only when surprise_me) ----
    if (surpriseMe) {
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

    // ---- Cache check by intent hash (BEFORE Places spend) ----
    loggedStep = "cacheLookup";
    checkPipelineTimeout(pipelineStartedAt, loggedStep);
    const tCacheLookup = Date.now();
    const cacheKey = await buildIntentCacheKey(intent, numDays);
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
        tStage("cache_lookup_hit", tCacheLookup);
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
        return jsonResponse({ success: true, ...(cached.response_json as Record<string, unknown>) });
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
      : await geocodeDestination(googleKey, intent.destination, svcClient, user.id);
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
    // 100+ venues. Instead, pick up to MAX_FINALIST_HYDRATIONS per trip from
    // the first venues in each pool (search results come back in relevance
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
    const maxPerPool = Math.max(3, Math.ceil(MAX_FINALIST_HYDRATIONS / Math.max(1, byPool.size)));
    for (const pool of byPool.values()) {
      for (const p of pool.slice(0, maxPerPool)) {
        if (seenFinalist.has(p.id)) continue;
        seenFinalist.add(p.id);
        finalistIds.push(p.id);
        if (finalistIds.length >= MAX_FINALIST_HYDRATIONS) break;
      }
      if (finalistIds.length >= MAX_FINALIST_HYDRATIONS) break;
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
    await logPlacesByTier(svcClient, logger, user.id, {
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

    // ---- Step 6: rank + enrich ----
    loggedStep = "rankAndEnrich";
    checkPipelineTimeout(pipelineStartedAt, loggedStep);
    const tRank = Date.now();
    const ranked = await rankAndEnrich(
      anthropicKey,
      intent,
      skeleton,
      venuesByPool,
      events,
      googleKey,
      geo,
      logger,
      pipelineStartedAt,
    );
    tStage("rank_and_enrich", tRank);

    // ---- Step 7-9: junto picks, affiliate URLs, validation ----
    const tJunto = Date.now();
    markJuntoPicks(ranked, intent);

    const affEnv = { booking: bookingAid, viator: viatorMcid, gyg: gygPid };
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
        user_id: user.id,
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
      user_id: user.id,
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
      },
    });

    return jsonResponse({ success: true, ...responsePayload });
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

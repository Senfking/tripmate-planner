// generate-trip-itinerary — source-of-truth pipeline (Places-first, Claude Haiku ranker)
//
// Pipeline (non-alternatives_mode):
//   1. parseIntent       — Claude Haiku extracts structured intent from form + free text
//   2. buildSkeleton     — pure-code pacing skeleton (slots per day)
//   3. buildPlacesQueries— pure-code Google Places query plan, deduped + capped at 20
//   4. searchPlacesBatch — Google Places Text Search in parallel, dedup by place_id
//   5. searchEvents      — Brave/Google CSE event search (optional, parallel)
//   6. rankAndEnrich     — Claude Haiku assigns venues to slots + writes editorial copy
//   7. markJuntoPicks    — pure code: rating/reviews/intent-match heuristic
//   8. buildAffiliateUrl — pure code: types[] -> Booking/Viator/GetYourGuide/Maps
//   9. validateActivities— drop hallucinations: missing place_id, > distance, not OPERATIONAL
//
// All Claude calls go to direct Anthropic API (claude-haiku-4-5-20251001) with prompt
// caching on the static system blocks. The `alternatives_mode` branch is preserved
// verbatim and still uses Lovable AI Gateway / Gemini.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Google Places (New) — Enterprise SKU because we request rating/userRatingCount/priceLevel
const PLACES_PRICE_PER_CALL = 0.032;
const MAX_PLACES_QUERIES_PER_TRIP = 20;

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
  | "attractions"
  | "nightlife"
  | "experiences"
  | "rest";

interface BatchPlaceResult {
  id: string;
  displayName: string | null;
  formattedAddress: string | null;
  location: { latitude: number; longitude: number } | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;
  types: string[];
  photos: Array<{ name: string }>;
  googleMapsUri: string | null;
  businessStatus: string | null;
  poolKey: PoolKey;
}

interface EventCandidate {
  name: string;
  date: string | null;
  venue: string | null;
  description: string;
  url: string | null;
}

type AffiliatePartner = "booking" | "viator" | "getyourguide" | "google_maps";

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
  price_level: string | null;
  photos: string[];                 // pre-built media URLs
  google_maps_url: string | null;
  estimated_cost_per_person: number;
  currency: string;
  booking_url: string;
  booking_partner: AffiliatePartner;
  is_junto_pick: boolean;
  dietary_notes?: string;
  // Transitional alias so the unchanged frontend keeps rendering tips
  tips: string;
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
  maxTokens = 4096,
): Promise<ClaudeCallResult<T>> {
  if (!apiKey) {
    throw new Error("callClaudeHaiku: ANTHROPIC_API_KEY is empty");
  }
  if (systemBlocks.length === 0) {
    throw new Error("callClaudeHaiku: at least one system block is required");
  }

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
    });
  } catch (e) {
    throw new Error(`Anthropic network error calling "${tool.name}": ${(e as Error).message}`);
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

  const data = await res.json().catch((e) => {
    throw new Error(`Anthropic returned non-JSON body: ${(e as Error).message}`);
  });

  const usage: ClaudeUsage = {
    input_tokens: typeof data?.usage?.input_tokens === "number" ? data.usage.input_tokens : 0,
    output_tokens: typeof data?.usage?.output_tokens === "number" ? data.usage.output_tokens : 0,
    cache_creation_input_tokens:
      typeof data?.usage?.cache_creation_input_tokens === "number"
        ? data.usage.cache_creation_input_tokens
        : 0,
    cache_read_input_tokens:
      typeof data?.usage?.cache_read_input_tokens === "number"
        ? data.usage.cache_read_input_tokens
        : 0,
  };

  const blocks: Array<Record<string, unknown>> = Array.isArray(data?.content) ? data.content : [];
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
        `stop_reason=${data?.stop_reason ?? "unknown"}. Text content: ${textSnippet}`,
    );
  }

  const input = (toolBlock as { input?: unknown }).input;
  if (!input || typeof input !== "object") {
    throw new Error(
      `Anthropic tool_use block for "${tool.name}" had no input object (got ${typeof input})`,
    );
  }

  return { data: input as T, usage };
}

// ---------------------------------------------------------------------------
// Intent parser — static, cache-friendly system prompt
// ---------------------------------------------------------------------------

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
): Promise<string> {
  const result = await callClaudeHaiku<{ destination: string; rationale: string }>(
    anthropicKey,
    [{ type: "text", text: SURPRISE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    buildSurpriseUserMessage(intent, numDays),
    SURPRISE_TOOL,
    512,
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
      // Departure day: one short morning highlight, lunch, then departure buffer.
      slots.push({ type: "breakfast", start_time: hhmm(9, 0), duration_minutes: 45, region_tag_for_queries: primary });
      slots.push({ type: "morning_major", start_time: hhmm(10, 0), duration_minutes: 90, region_tag_for_queries: primary });
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 75, region_tag_for_queries: primary });
      slots.push({ type: "departure", start_time: hhmm(15, 0), duration_minutes: 180, region_tag_for_queries: transitHub });
    } else if (isRest) {
      // Rest day: late breakfast, long lunch, afternoon rest, dinner.
      slots.push({ type: "breakfast", start_time: hhmm(10, 0), duration_minutes: 60, region_tag_for_queries: primary });
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
      slots.push({ type: "rest", start_time: hhmm(14, 30), duration_minutes: 150, region_tag_for_queries: primary });
      slots.push({ type: "dinner", start_time: hhmm(dinnerStart, 0), duration_minutes: 90, region_tag_for_queries: primary });
    } else if (intent.pace === "leisurely") {
      // Leisurely: late breakfast, one morning sight, lunch, one afternoon sight, dinner.
      slots.push({ type: "breakfast", start_time: hhmm(10, 0), duration_minutes: 60, region_tag_for_queries: primary });
      slots.push({ type: "morning_major", start_time: hhmm(11, 30), duration_minutes: 120, region_tag_for_queries: primary });
      slots.push({ type: "lunch", start_time: hhmm(lunchStart, 30), duration_minutes: 90, region_tag_for_queries: primary });
      slots.push({ type: "afternoon_major", start_time: hhmm(15, 30), duration_minutes: 120, region_tag_for_queries: primary });
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

  // ---- Lunch (base + optional food-vibe specialization) ----
  if (slotTypesSeen.has("lunch")) {
    add("lunch:base", {
      textQuery: `${foodPrefix}lunch restaurants ${city}`,
      includedType: "restaurant",
      priceLevels,
      locationBias,
      poolKey: "lunch",
    });
    if (foodVibe) {
      add(`lunch:vibe:${foodVibe}`, {
        textQuery: `${foodPrefix}${foodVibe} ${city}`,
        includedType: "restaurant",
        priceLevels,
        locationBias,
        poolKey: "lunch",
      });
    }
  }

  // ---- Dinner (tone variant + broad fallback) ----
  if (slotTypesSeen.has("dinner")) {
    if (dinnerTone) {
      add(`dinner:${dinnerTone}`, {
        textQuery: `${foodPrefix}${dinnerTone} dinner restaurants ${city}`,
        includedType: "restaurant",
        priceLevels,
        locationBias,
        poolKey: "dinner",
      });
    }
    add("dinner:base", {
      textQuery: `${foodPrefix}dinner restaurants ${city}`,
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
// Resolves a destination string to { lat, lng, country_code, viewport } using
// Google's Geocoding API. country_code (ISO-3166-1 alpha-2) feeds
// buildSkeleton's MEAL_PATTERNS lookup; lat/lng feed locationBias on every
// Places search; viewport is kept for future bounding-box queries.
//
// Cached in ai_response_cache under "geocode:v1:{normalized destination}" for
// 30 days (cities don't move). We rely on this cache, NOT place_details_cache
// — that table exists but isn't populated in production today.
// ---------------------------------------------------------------------------

interface GeocodeResult {
  lat: number;
  lng: number;
  country_code: string | null;
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

async function geocodeDestination(
  googleKey: string,
  destination: string,
  svcClient: ReturnType<typeof createClient>,
): Promise<GeocodeResult | null> {
  const normalized = destination.trim().toLowerCase();
  if (!normalized) return null;
  const cacheKey = `geocode:v1:${await sha256Hex(normalized)}`;

  // Cache lookup — fail loud on DB errors, miss silently on not-found.
  const { data: cached, error: cacheErr } = await svcClient
    .from("ai_response_cache")
    .select("response_json")
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (cacheErr) {
    throw new Error(`ai_response_cache geocode lookup failed: ${cacheErr.message}`);
  }
  if (cached?.response_json) {
    return cached.response_json as unknown as GeocodeResult;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", destination);
  url.searchParams.set("key", googleKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error(`[geocodeDestination] HTTP ${res.status}`);
    return null;
  }
  const body = (await res.json()) as {
    status: string;
    results?: Array<{
      geometry?: {
        location?: { lat: number; lng: number };
        viewport?: {
          northeast: { lat: number; lng: number };
          southwest: { lat: number; lng: number };
        };
      };
      address_components?: Array<{
        short_name: string;
        long_name: string;
        types: string[];
      }>;
    }>;
  };
  if (body.status !== "OK" || !body.results?.length) {
    console.error(`[geocodeDestination] status=${body.status} for "${destination}"`);
    return null;
  }
  const top = body.results[0];
  const loc = top.geometry?.location;
  if (!loc) return null;
  const countryComp = top.address_components?.find((c) => c.types.includes("country"));
  const result: GeocodeResult = {
    lat: loc.lat,
    lng: loc.lng,
    country_code: countryComp?.short_name?.toLowerCase() ?? null,
    viewport: top.geometry?.viewport ?? null,
  };

  // Write-through cache — 30 days.
  const { error: cacheWriteErr } = await svcClient.from("ai_response_cache").insert({
    cache_key: cacheKey,
    response_json: result as unknown as Record<string, unknown>,
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  if (cacheWriteErr && cacheWriteErr.code !== "23505") {
    // 23505 = unique_violation (race); anything else is a real problem.
    throw new Error(`ai_response_cache geocode insert failed: ${cacheWriteErr.message}`);
  }

  return result;
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
// logPlacesCalls in the main handler — the fail-loud contract applies there.
// ---------------------------------------------------------------------------

const PLACES_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.photos,places.googleMapsUri,places.businessStatus";

async function searchPlacesBatch(
  queries: PlacesSearchQuery[],
  googleKey: string,
): Promise<BatchPlaceResult[]> {
  const perQueryResults = await Promise.all(
    queries.map(async (q) => {
      try {
        const body = {
          textQuery: q.textQuery,
          ...(q.includedType ? { includedType: q.includedType } : {}),
          ...(q.priceLevels ? { priceLevels: q.priceLevels } : {}),
          locationBias: q.locationBias,
          maxResultCount: 10,
        };
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleKey,
            "X-Goog-FieldMask": PLACES_FIELD_MASK,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          console.error(
            `[searchPlacesBatch] HTTP ${res.status} for "${q.textQuery}" (${q.poolKey})`,
          );
          return [] as Array<Record<string, unknown>>;
        }
        const data = (await res.json()) as { places?: Array<Record<string, unknown>> };
        return data.places ?? [];
      } catch (err) {
        console.error(`[searchPlacesBatch] threw for "${q.textQuery}":`, err);
        return [] as Array<Record<string, unknown>>;
      }
    }),
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
        rating: (p.rating as number | null) ?? null,
        userRatingCount: (p.userRatingCount as number | null) ?? null,
        priceLevel: (p.priceLevel as string | null) ?? null,
        types: (p.types as string[] | undefined) ?? [],
        photos: (p.photos as Array<{ name: string }> | undefined) ?? [],
        googleMapsUri: (p.googleMapsUri as string | null) ?? null,
        businessStatus: (p.businessStatus as string | null) ?? null,
        poolKey: pool,
      });
    }
  }
  return out;
}

async function searchEvents(
  _destination: string,
  _startDate: string,
  _endDate: string,
  _intent: Intent,
): Promise<EventCandidate[]> {
  throw new Error("searchEvents: not implemented");
}

async function rankAndEnrich(
  _anthropicKey: string,
  _intent: Intent,
  _skeleton: DaySkeleton[],
  _venuesByPool: Map<PoolKey, BatchPlaceResult[]>,
  _events: EventCandidate[],
  _googleKey: string,
  _logger: LLMLogger,
): Promise<PipelineResult> {
  throw new Error("rankAndEnrich: not implemented");
}

function markJuntoPicks(_result: PipelineResult, _intent: Intent): void {
  throw new Error("markJuntoPicks: not implemented");
}

function buildAffiliateUrl(
  _place: BatchPlaceResult,
  _slot: PacingSlot,
  _env: { booking: string; viator: string; gyg: string },
): { booking_url: string; booking_partner: AffiliatePartner } {
  throw new Error("buildAffiliateUrl: not implemented");
}

function validateActivities(
  _result: PipelineResult,
  _allPlaces: Map<string, BatchPlaceResult>,
  _center: { lat: number; lng: number },
): PipelineResult {
  throw new Error("validateActivities: not implemented");
}

// ---------------------------------------------------------------------------
// Logging — fail loud on any DB write error
// ---------------------------------------------------------------------------

interface LLMLogger {
  log: (entry: {
    feature: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    cached: boolean;
  }) => Promise<void>;
}

function makeLLMLogger(
  svcClient: ReturnType<typeof createClient>,
  userId: string,
): LLMLogger {
  return {
    async log(entry) {
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

async function logPlacesCalls(
  svcClient: ReturnType<typeof createClient>,
  userId: string,
  callCount: number,
): Promise<void> {
  if (callCount <= 0) return;
  const { error } = await svcClient.from("ai_request_log").insert({
    user_id: userId,
    feature: "places_search",
    model: "google-places-text-search",
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: callCount * PLACES_PRICE_PER_CALL,
    cached: false,
  });
  if (error) {
    console.error("[ai_request_log] places insert failed:", error);
    throw new Error(`ai_request_log places insert failed: ${error.message}`);
  }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Auth ----
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

    const body: TripBuilderRequest = await req.json();

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
    const logger = makeLLMLogger(svcClient, user.id);

    // ---- Step 1: parse intent ----
    // In surprise mode we pass an empty destination hint — the surprise picker
    // runs next with the parsed vibes/must_haves/must_avoids and fills in
    // intent.destination. This ordering means the picker sees the same
    // extracted must_avoids the ranker will later enforce.
    const intent = await parseIntent(
      anthropicKey,
      body,
      surpriseMe ? "" : rawDest,
      logger,
    );

    // ---- Step 1.5: surprise destination picker (only when surprise_me) ----
    if (surpriseMe) {
      intent.destination = await pickSurpriseDestination(
        anthropicKey,
        intent,
        numDays,
        logger,
      );
    }

    // ---- Cache check by intent hash (BEFORE Places spend) ----
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

    // ---- Step 2a: geocode (must run before buildSkeleton so MEAL_PATTERNS
    //               gets the country_code rather than parsing the string) ----
    const geo = await geocodeDestination(googleKey, intent.destination, svcClient);
    if (!geo) {
      return jsonResponse(
        { success: false, error: `Could not geocode destination "${intent.destination}"` },
        500,
      );
    }

    // ---- Step 2b: pacing skeleton ----
    const skeleton = buildSkeleton(intent, numDays, startDate, geo.country_code);

    // ---- Step 3 + 4: query plan + Places batch ----
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

    // Step 4 + Step 5 in parallel
    const [places, events] = await Promise.all([
      searchPlacesBatch(queries, googleKey),
      searchEvents(intent.destination, startDate, endDate, intent),
    ]);

    await logPlacesCalls(svcClient, user.id, queries.length);

    // Group venues by pool for the ranker prompt
    const venuesByPool = new Map<PoolKey, BatchPlaceResult[]>();
    for (const p of places) {
      const pool = venuesByPool.get(p.poolKey) ?? [];
      pool.push(p);
      venuesByPool.set(p.poolKey, pool);
    }
    const allPlacesById = new Map<string, BatchPlaceResult>();
    for (const p of places) allPlacesById.set(p.id, p);

    // ---- Step 6: rank + enrich ----
    const ranked = await rankAndEnrich(
      anthropicKey,
      intent,
      skeleton,
      venuesByPool,
      events,
      googleKey,
      logger,
    );

    // ---- Step 7-9: junto picks, affiliate URLs, validation ----
    markJuntoPicks(ranked, intent);

    for (const dest of ranked.destinations) {
      const decorate = (a: EnrichedActivity, slotType: SlotType) => {
        const place = allPlacesById.get(a.place_id);
        if (!place) return; // validator will drop this
        const slotShim: PacingSlot = {
          type: slotType,
          start_time: a.start_time,
          duration_minutes: a.duration_minutes,
          region_tag_for_queries: "primary",
        };
        const aff = buildAffiliateUrl(place, slotShim, {
          booking: bookingAid,
          viator: viatorMcid,
          gyg: gygPid,
        });
        a.booking_url = aff.booking_url;
        a.booking_partner = aff.booking_partner;
      };
      if (dest.accommodation) decorate(dest.accommodation, "lodging");
      for (const day of dest.days) {
        for (const act of day.activities) {
          // Slot type is reconstructed from category; ranker also returns it directly when present.
          // Step 8's buildAffiliateUrl reads partner from place.types, so category is redundant here.
          const slotType: SlotType =
            act.category === "food" ? "lunch" :
            act.category === "nightlife" ? "nightlife" :
            "morning_major";
          decorate(act, slotType);
        }
      }
    }

    const validated = validateActivities(ranked, allPlacesById, { lat: geo.lat, lng: geo.lng });

    // ---- Cache write (fail loud) ----
    {
      const { error: cacheInsErr } = await svcClient.from("ai_response_cache").insert({
        cache_key: cacheKey,
        response_json: validated,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
      if (cacheInsErr) {
        console.error("[ai_response_cache] insert failed:", cacheInsErr);
        throw new Error(`ai_response_cache insert failed: ${cacheInsErr.message}`);
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
      },
    });

    return jsonResponse({ success: true, ...validated });
  } catch (e) {
    console.error("generate-trip-itinerary error:", e);
    return jsonResponse({ success: false, error: (e as Error).message || "Internal error" }, 500);
  }
});

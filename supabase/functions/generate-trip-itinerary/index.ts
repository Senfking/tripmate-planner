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

// Country -> meal-time pattern. Default = americas/asia.
const MEAL_PATTERNS: Record<string, { lunch: [number, number]; dinner: [number, number] }> = {
  spain:    { lunch: [14, 16], dinner: [21, 23] },
  italy:    { lunch: [13, 15], dinner: [20, 22] },
  portugal: { lunch: [13, 15], dinner: [20, 22] },
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
  category: string;         // for query routing: food | culture | nightlife | accommodation | nature | relaxation
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
  duration_minutes: number;
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

// ---------------------------------------------------------------------------
// Stubs — implemented in subsequent commits
// ---------------------------------------------------------------------------

async function callClaudeHaiku<T = Record<string, unknown>>(
  _apiKey: string,
  _systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>,
  _userContent: string,
  _toolName: string,
  _toolSchema: Record<string, unknown>,
  _maxTokens = 4096,
): Promise<ClaudeCallResult<T>> {
  throw new Error("callClaudeHaiku: not implemented");
}

async function parseIntent(
  _anthropicKey: string,
  _body: TripBuilderRequest,
  _resolvedDestination: string,
  _logger: LLMLogger,
): Promise<Intent> {
  throw new Error("parseIntent: not implemented");
}

async function pickSurpriseDestination(
  _anthropicKey: string,
  _body: TripBuilderRequest,
  _logger: LLMLogger,
): Promise<string> {
  throw new Error("pickSurpriseDestination: not implemented");
}

function buildSkeleton(
  _intent: Intent,
  _numDays: number,
  _startDate: string,
): DaySkeleton[] {
  throw new Error("buildSkeleton: not implemented");
}

function buildPlacesQueries(
  _intent: Intent,
  _skeleton: DaySkeleton[],
  _center: { lat: number; lng: number; name: string },
): PlacesSearchQuery[] {
  throw new Error("buildPlacesQueries: not implemented");
}

async function geocodeDestination(
  _googleKey: string,
  _destination: string,
): Promise<{ lat: number; lng: number } | null> {
  throw new Error("geocodeDestination: not implemented");
}

async function searchPlacesBatch(
  _queries: PlacesSearchQuery[],
  _googleKey: string,
): Promise<BatchPlaceResult[]> {
  throw new Error("searchPlacesBatch: not implemented");
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

    // ---- Step 0: surprise destination picker (only when surprise_me) ----
    const resolvedDestination = surpriseMe
      ? await pickSurpriseDestination(anthropicKey, body, logger)
      : rawDest;

    // ---- Step 1: parse intent ----
    const intent = await parseIntent(anthropicKey, body, resolvedDestination, logger);

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

    // ---- Step 2: pacing skeleton ----
    const skeleton = buildSkeleton(intent, numDays, startDate);

    // ---- Step 3 + 4: query plan + Places batch ----
    const center = await geocodeDestination(googleKey, intent.destination);
    if (!center) {
      return jsonResponse(
        { success: false, error: `Could not geocode destination "${intent.destination}"` },
        500,
      );
    }
    const queries = buildPlacesQueries(intent, skeleton, { ...center, name: intent.destination });
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
      const decorate = (a: EnrichedActivity, slotType: SlotType, category: string) => {
        const place = allPlacesById.get(a.place_id);
        if (!place) return; // validator will drop this
        const slotShim: PacingSlot = {
          type: slotType,
          start_time: a.start_time,
          duration_minutes: a.duration_minutes,
          category,
        };
        const aff = buildAffiliateUrl(place, slotShim, {
          booking: bookingAid,
          viator: viatorMcid,
          gyg: gygPid,
        });
        a.booking_url = aff.booking_url;
        a.booking_partner = aff.booking_partner;
      };
      if (dest.accommodation) decorate(dest.accommodation, "lodging", "accommodation");
      for (const day of dest.days) {
        for (const act of day.activities) {
          // Slot type is reconstructed from category; ranker also returns it directly when present.
          const slotType: SlotType =
            act.category === "food" ? "lunch" :
            act.category === "nightlife" ? "nightlife" :
            "morning_major";
          decorate(act, slotType, act.category);
        }
      }
    }

    const validated = validateActivities(ranked, allPlacesById, center);

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

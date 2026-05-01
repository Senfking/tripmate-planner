// get-entry-requirements
//
// MVP visa / entry requirements lookup. LLM-only for now (Anthropic Haiku 4.5
// via direct Messages API + forced tool_use). We'll swap this for a paid API
// (Sherpa or similar) post-launch — when that happens, the cache key contract
// and response shape stay the same; only the fetch path changes.
//
// Cost shape per uncached call: ~800 max output tokens at $5/MTok = ~$0.004
// per nationality lookup. With 30-day caching keyed by
// "{ISO_NATIONALITY}|{ISO_DESTINATION}|{PURPOSE}" the marginal cost on
// repeat lookups is one tiny SELECT.
//
// Multi-passport: we run one cache+LLM lookup per nationality and pick the
// "most permissive" result (visa_required: no > depends > yes > unknown).
// Single-passport requests skip the merge step.
//
// Two input shapes are supported:
//   - trip_id path (production): { trip_id, purpose? } — the function
//     resolves the caller's nationality (profile first, then
//     trip_traveller_passports as fallback) plus destination +
//     trip_length_days from the DB after a membership check.
//   - direct path (testing / admin): { nationalities, destination_country,
//     trip_length_days, purpose }.
//
// Auth: verify_jwt = true (set in supabase/config.toml). We additionally
// validate the JWT on the function side so we can record user_id in
// ai_request_log and membership-check trip_id requests.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 800;
const TEMPERATURE = 0.2;

// Anthropic Claude Haiku 4.5 pricing (USD per token)
const HAIKU_PRICING = {
  input: 1.0 / 1_000_000,
  output: 5.0 / 1_000_000,
};

const CACHE_TTL_DAYS = 30;
const FEATURE_NAME = "get_entry_requirements";

// Permissiveness ranking — used to pick the best passport for the trip.
// Lower number = less friction at the border.
const PERMISSIVENESS_RANK: Record<string, number> = {
  no: 0,        // visa typically not required
  depends: 1,   // conditions apply (length of stay, etc.)
  yes: 2,       // visa required
  unknown: 3,   // can't determine — push to manual verification
};

const SYSTEM_PROMPT = `You are a travel-document research assistant for Junto, a trip planning app. Given a passport nationality, a destination country, a planned trip length, and a travel purpose, you return structured entry requirements via the report_entry_requirements tool.

CORE RULES — these are not suggestions

1. Hedge every visa-related claim. Begin claims with "Typically", "Generally", "In most cases", or "As of recent guidance". NEVER use absolute phrasing like "you do not need a visa" or "you must have". Phrase as "a visa is typically not required for [nationality] passport holders for stays under [duration]".

2. When uncertain, set confidence to "low" and say what to verify. Do not invent specifics. If the nationality + destination pairing is obscure, politically complex, or you are not confident in current guidance, return confidence: "low" and put "Please verify with the destination's embassy or consulate before travel" in additional_notes.

3. Always populate embassy_url with a real official URL. Prefer government foreign-travel-advice pages from the traveller's home country (e.g. https://www.gov.uk/foreign-travel-advice/{country-slug} for UK travellers, https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages/{Country}.html for US travellers, https://www.smartraveller.gov.au/destinations/{region}/{country} for Australian travellers). If you do not know a specific URL, fall back to the destination's official immigration / tourism authority. NEVER invent URLs that look plausible — use a known root only.

4. Cover passport validity. Most countries enforce a 6-month validity rule beyond the planned departure date; some enforce 3 months; some only require validity for the duration of stay. Always include this in passport_validity. Hedge with "Typically".

5. Cover entry forms / pre-arrival authorisation when relevant. Examples:
   - USA: ESTA (https://esta.cbp.dhs.gov) for Visa Waiver Program nationals
   - UK: ETA (https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta) for eligible nationals
   - Canada: eTA (https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta.html)
   - Australia: ETA / eVisitor (https://immi.homeaffairs.gov.au)
   - EU/Schengen: ETIAS (rolling out — hedge appropriately)
   - Various: e-Visa portals
   If relevant, populate entry_form_required with type and url. If not relevant, set it to null.

6. Documents needed should always include the passport (mandatory: true) and any visa / ETA / vaccination cert that applies. Be specific where possible — onward ticket, proof of funds, yellow fever certificate when arriving from endemic regions, etc. Each item gets a one-sentence description.

7. Common gotchas worth flagging in additional_notes when applicable: passport blank-page requirements, return / onward ticket requirements, proof-of-funds, yellow fever certificate (esp. for African / South American transits), Israel stamp issues for some Middle East destinations, single-entry vs multi-entry visa nuances, visa-on-arrival fees in cash USD.

8. summary is 2-3 sentences in plain English, hedged appropriately, capturing the headline answer for the traveller.

9. confidence:
   - "high"  — well-known, stable pairing (e.g. US passport to France for tourism)
   - "medium" — common but with conditions you're hedging on
   - "low"   — obscure pairing, politically complex, or recent rule changes you can't verify

OUTPUT
You MUST respond by calling the report_entry_requirements tool with all required fields. Do not respond with plain text.`;

const ENTRY_REQUIREMENTS_TOOL = {
  name: "report_entry_requirements",
  description:
    "Report structured entry requirements for a single nationality + destination + purpose lookup.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "2-3 sentence plain-English headline, hedged with 'Typically' / 'Generally' phrasing.",
      },
      visa_required: {
        type: "string",
        enum: ["yes", "no", "depends", "unknown"],
        description:
          "Headline answer. Use 'depends' when conditional on length of stay or purpose; 'unknown' when uncertain.",
      },
      documents_needed: {
        type: "array",
        description: "Documents the traveller should have. Always include passport.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            mandatory: { type: "boolean" },
          },
          required: ["name", "description", "mandatory"],
          additionalProperties: false,
        },
      },
      passport_validity: {
        type: "string",
        description:
          "Passport validity rule (e.g. 'Typically valid for at least 6 months beyond your planned departure date'). Always hedged.",
      },
      entry_form_required: {
        type: ["object", "null"],
        description:
          "Pre-arrival authorisation (ESTA, ETA, eTA, ETIAS, e-Visa). Set to null if none applies.",
        properties: {
          type: { type: "string" },
          url: { type: "string" },
        },
        required: ["type", "url"],
        additionalProperties: false,
      },
      embassy_url: {
        type: "string",
        description:
          "Real official URL — government travel advisory or destination's official immigration site. NEVER invent URLs.",
      },
      additional_notes: {
        type: "array",
        items: { type: "string" },
        description:
          "Common gotchas, verification reminders, conditional caveats. Plain sentences.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description:
          "Self-rated confidence. Use 'low' for obscure pairings, politically complex, or unverifiable recent changes.",
      },
    },
    required: [
      "summary",
      "visa_required",
      "documents_needed",
      "passport_validity",
      "entry_form_required",
      "embassy_url",
      "additional_notes",
      "confidence",
    ],
    additionalProperties: false,
  },
} as const;

type EntryFormRequired = { type: string; url: string } | null;

interface DocumentNeeded {
  name: string;
  description: string;
  mandatory: boolean;
}

interface EntryRequirementsResult {
  summary: string;
  visa_required: "yes" | "no" | "depends" | "unknown";
  documents_needed: DocumentNeeded[];
  passport_validity: string;
  entry_form_required: EntryFormRequired;
  embassy_url: string;
  additional_notes: string[];
  confidence: "high" | "medium" | "low";
  generated_at: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Normalize ISO codes for cache keys. Accepts 2- or 3-letter ISO; uppercases.
// We don't try to translate full names here — caller is expected to pass ISO.
function normalizeIso(s: string): string {
  return s.trim().toUpperCase();
}

function buildCacheKey(nationality: string, destination: string, purpose: string): string {
  return `${normalizeIso(nationality)}|${normalizeIso(destination)}|${purpose.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Cache helpers — service-role client only.
// ---------------------------------------------------------------------------

async function cacheGet(
  svcClient: ReturnType<typeof createClient>,
  cacheKey: string,
): Promise<EntryRequirementsResult | null> {
  const { data, error } = await svcClient
    .from("entry_requirements_cache")
    .select("response_json, generated_at, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) {
    console.warn("[get-entry-requirements] cache lookup failed:", error.message);
    return null;
  }
  if (!data) return null;

  const expiresAt = new Date(data.expires_at as string).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }

  const json = data.response_json as Record<string, unknown> | null;
  if (!json || typeof json !== "object") return null;

  return {
    ...(json as unknown as EntryRequirementsResult),
    generated_at: data.generated_at as string,
  };
}

async function cacheSet(
  svcClient: ReturnType<typeof createClient>,
  cacheKey: string,
  result: EntryRequirementsResult,
): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 86400 * 1000).toISOString();
  const { error } = await svcClient
    .from("entry_requirements_cache")
    .upsert(
      {
        cache_key: cacheKey,
        response_json: result,
        generated_at: result.generated_at,
        expires_at: expiresAt,
      },
      { onConflict: "cache_key" },
    );
  if (error) {
    console.warn("[get-entry-requirements] cache write failed:", error.message);
  }
}

// ---------------------------------------------------------------------------
// ai_request_log — fail loud, per CLAUDE.md guidance for telemetry.
// ---------------------------------------------------------------------------

async function logAiRequest(
  svcClient: ReturnType<typeof createClient>,
  entry: {
    user_id: string | null;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    cached: boolean;
  },
): Promise<void> {
  const { error } = await svcClient.from("ai_request_log").insert({
    user_id: entry.user_id,
    feature: FEATURE_NAME,
    model: HAIKU_MODEL,
    input_tokens: entry.input_tokens,
    output_tokens: entry.output_tokens,
    cost_usd: entry.cost_usd,
    cached: entry.cached,
  });
  if (error) {
    console.error("[ai_request_log] insert failed:", error);
  }
}

// ---------------------------------------------------------------------------
// Anthropic call — single nationality lookup with forced tool_use.
// ---------------------------------------------------------------------------

interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

async function fetchEntryRequirementsLLM(
  apiKey: string,
  params: {
    nationality: string;
    destination: string;
    tripLengthDays: number;
    purpose: string;
  },
): Promise<{ result: EntryRequirementsResult; usage: ClaudeUsage }> {
  const userMessage =
    `Lookup:\n` +
    `- Passport nationality (ISO): ${params.nationality}\n` +
    `- Destination country (ISO): ${params.destination}\n` +
    `- Trip length: ${params.tripLengthDays} days\n` +
    `- Purpose: ${params.purpose}\n\n` +
    `Respond by calling the report_entry_requirements tool. Hedge every claim. Use confidence: "low" if you are unsure.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [ENTRY_REQUIREMENTS_TOOL],
      tool_choice: { type: "tool", name: ENTRY_REQUIREMENTS_TOOL.name },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const usage: ClaudeUsage = {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };

  const blocks = Array.isArray(data.content) ? data.content : [];
  const toolBlock = blocks.find(
    (b: { type?: string; name?: string }) =>
      b?.type === "tool_use" && b?.name === ENTRY_REQUIREMENTS_TOOL.name,
  );
  if (!toolBlock || typeof toolBlock !== "object") {
    throw new Error(
      `Anthropic response did not include expected tool_use block (stop_reason=${data?.stop_reason ?? "unknown"})`,
    );
  }

  const input = (toolBlock as { input?: unknown }).input;
  if (!input || typeof input !== "object") {
    throw new Error("Anthropic tool_use block had no input object");
  }

  const validated = validateEntryRequirements(input as Record<string, unknown>);
  return {
    result: { ...validated, generated_at: new Date().toISOString() },
    usage,
  };
}

// Schema validation — defense in depth. The forced tool_use already constrains
// the shape, but we validate before persisting to the cache so a malformed
// response can't poison the table for 30 days.
function validateEntryRequirements(
  raw: Record<string, unknown>,
): Omit<EntryRequirementsResult, "generated_at"> {
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!summary) throw new Error("validateEntryRequirements: missing summary");

  const visaRequired = raw.visa_required;
  if (
    visaRequired !== "yes" &&
    visaRequired !== "no" &&
    visaRequired !== "depends" &&
    visaRequired !== "unknown"
  ) {
    throw new Error(`validateEntryRequirements: invalid visa_required: ${String(visaRequired)}`);
  }

  const documentsRaw = Array.isArray(raw.documents_needed) ? raw.documents_needed : [];
  const documents_needed: DocumentNeeded[] = documentsRaw
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({
      name: typeof d.name === "string" ? d.name : "",
      description: typeof d.description === "string" ? d.description : "",
      mandatory: Boolean(d.mandatory),
    }))
    .filter((d) => d.name.length > 0);

  const passport_validity =
    typeof raw.passport_validity === "string" ? raw.passport_validity.trim() : "";
  if (!passport_validity) {
    throw new Error("validateEntryRequirements: missing passport_validity");
  }

  let entry_form_required: EntryFormRequired = null;
  const efr = raw.entry_form_required;
  if (efr && typeof efr === "object") {
    const t = (efr as Record<string, unknown>).type;
    const u = (efr as Record<string, unknown>).url;
    if (typeof t === "string" && typeof u === "string" && t && u) {
      entry_form_required = { type: t, url: u };
    }
  }

  const embassy_url = typeof raw.embassy_url === "string" ? raw.embassy_url.trim() : "";
  if (!embassy_url) {
    throw new Error("validateEntryRequirements: missing embassy_url");
  }

  const notesRaw = Array.isArray(raw.additional_notes) ? raw.additional_notes : [];
  const additional_notes = notesRaw.filter(
    (n): n is string => typeof n === "string" && n.trim().length > 0,
  );

  const conf = raw.confidence;
  if (conf !== "high" && conf !== "medium" && conf !== "low") {
    throw new Error(`validateEntryRequirements: invalid confidence: ${String(conf)}`);
  }

  return {
    summary,
    visa_required: visaRequired,
    documents_needed,
    passport_validity,
    entry_form_required,
    embassy_url,
    additional_notes,
    confidence: conf,
  };
}

// ---------------------------------------------------------------------------
// Multi-passport merge: pick the most permissive passport.
// ---------------------------------------------------------------------------

interface PerPassportLookup {
  nationality: string;
  result: EntryRequirementsResult;
}

function pickMostPermissive(
  lookups: PerPassportLookup[],
): { recommended_passport: string; result: EntryRequirementsResult } {
  if (lookups.length === 0) {
    throw new Error("pickMostPermissive: no lookups provided");
  }

  let best = lookups[0];
  for (const candidate of lookups.slice(1)) {
    const bestRank = PERMISSIVENESS_RANK[best.result.visa_required] ?? 99;
    const candRank = PERMISSIVENESS_RANK[candidate.result.visa_required] ?? 99;
    if (candRank < bestRank) {
      best = candidate;
      continue;
    }
    // Tie-break on confidence: high beats medium beats low. We'd rather
    // surface a confident "depends" than an unconfident "no".
    if (candRank === bestRank) {
      const order = { high: 0, medium: 1, low: 2 } as const;
      const bestConf = order[best.result.confidence];
      const candConf = order[candidate.result.confidence];
      if (candConf < bestConf) best = candidate;
    }
  }

  return { recommended_passport: best.nationality, result: best.result };
}

// ---------------------------------------------------------------------------
// Single-nationality pipeline: cache → LLM → cache write.
// ---------------------------------------------------------------------------

async function lookupOne(
  svcClient: ReturnType<typeof createClient>,
  apiKey: string,
  userId: string | null,
  params: {
    nationality: string;
    destination: string;
    tripLengthDays: number;
    purpose: string;
  },
): Promise<{ result: EntryRequirementsResult; cached: boolean }> {
  const cacheKey = buildCacheKey(params.nationality, params.destination, params.purpose);

  const cached = await cacheGet(svcClient, cacheKey);
  if (cached) {
    await logAiRequest(svcClient, {
      user_id: userId,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      cached: true,
    });
    return { result: cached, cached: true };
  }

  const { result, usage } = await fetchEntryRequirementsLLM(apiKey, {
    nationality: normalizeIso(params.nationality),
    destination: normalizeIso(params.destination),
    tripLengthDays: params.tripLengthDays,
    purpose: params.purpose,
  });

  await cacheSet(svcClient, cacheKey, result);

  const cost =
    usage.input_tokens * HAIKU_PRICING.input + usage.output_tokens * HAIKU_PRICING.output;
  await logAiRequest(svcClient, {
    user_id: userId,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cost_usd: cost,
    cached: false,
  });

  return { result, cached: false };
}

// ---------------------------------------------------------------------------
// Request validation.
//
// Two input shapes are accepted:
//
//   1. trip_id path (production):
//      { trip_id: string, purpose?: "tourism" }
//      The function resolves nationalities + destination_country +
//      trip_length_days from the database (membership-checked).
//
//   2. direct path (testing / admin):
//      { nationalities: string[], destination_country: string,
//        trip_length_days: number, purpose: "tourism" }
//      Caller supplies everything explicitly; no DB lookups.
//
// If the body contains BOTH trip_id and a nationalities array, trip_id wins
// — the DB is the source of truth and we don't want callers stuffing
// inconsistent values past the membership check.
// ---------------------------------------------------------------------------

interface ValidatedRequest {
  nationalities: string[];
  destination_country: string;
  trip_length_days: number;
  purpose: "tourism";
  // Set when the request came in via the trip_id path; used purely for
  // logging / response metadata so callers can tell the two paths apart.
  source_trip_id: string | null;
}

const DEFAULT_TRIP_LENGTH_DAYS = 7;

function validateDirectRequest(body: Record<string, unknown>): ValidatedRequest {
  const natRaw = body.nationalities;
  if (!Array.isArray(natRaw) || natRaw.length === 0) {
    throw new Error("nationalities must be a non-empty array of ISO country codes");
  }
  const nationalities = natRaw
    .filter((n): n is string => typeof n === "string" && n.trim().length >= 2)
    .map((n) => normalizeIso(n));
  if (nationalities.length === 0) {
    throw new Error("nationalities must contain at least one ISO country code");
  }
  if (nationalities.length > 4) {
    throw new Error("nationalities supports up to 4 passports per request");
  }
  const uniqueNationalities = Array.from(new Set(nationalities));

  const dest = body.destination_country;
  if (typeof dest !== "string" || dest.trim().length < 2) {
    throw new Error("destination_country must be an ISO country code");
  }

  const len = body.trip_length_days;
  if (typeof len !== "number" || !Number.isFinite(len) || len <= 0 || len > 365) {
    throw new Error("trip_length_days must be a positive number <= 365");
  }

  // MVP only supports tourism. Future: business, transit, study, work.
  const purpose = body.purpose;
  if (purpose !== "tourism") {
    throw new Error("purpose must be 'tourism' (other purposes not yet supported)");
  }

  return {
    nationalities: uniqueNationalities,
    destination_country: normalizeIso(dest),
    trip_length_days: Math.round(len),
    purpose,
    source_trip_id: null,
  };
}

// ---------------------------------------------------------------------------
// Caller nationality lookup. Profile-first; falls back to
// trip_traveller_passports for accounts that haven't set profile nationality
// yet. Returns up to 4 distinct uppercase ISO codes (matches the direct-path
// validation cap).
// ---------------------------------------------------------------------------

async function resolveCallerNationalities(
  svcClient: ReturnType<typeof createClient>,
  authUserId: string,
  tripId: string,
): Promise<string[]> {
  const { data: profile, error: profileErr } = await svcClient
    .from("profiles")
    .select("nationality_iso, secondary_nationality_iso")
    .eq("id", authUserId)
    .maybeSingle();
  if (profileErr) {
    throw new Error(`Profile lookup failed: ${profileErr.message}`);
  }

  const fromProfile: string[] = [];
  const primary = (profile as Record<string, unknown> | null)?.nationality_iso;
  const secondary = (profile as Record<string, unknown> | null)?.secondary_nationality_iso;
  if (typeof primary === "string" && primary.trim().length === 2) {
    fromProfile.push(normalizeIso(primary));
  }
  if (typeof secondary === "string" && secondary.trim().length === 2) {
    fromProfile.push(normalizeIso(secondary));
  }
  if (fromProfile.length > 0) {
    return Array.from(new Set(fromProfile)).slice(0, 4);
  }

  // Profile not populated — fall back to per-trip passports. is_primary rows
  // take precedence; if none are flagged primary, use all rows.
  const { data: passports, error: passErr } = await svcClient
    .from("trip_traveller_passports")
    .select("nationality_iso, is_primary")
    .eq("trip_id", tripId)
    .eq("user_id", authUserId);
  if (passErr) {
    throw new Error(`Passport lookup failed: ${passErr.message}`);
  }
  if (!Array.isArray(passports) || passports.length === 0) {
    return [];
  }

  const usable = passports.filter(
    (p): p is { nationality_iso: string; is_primary: boolean } =>
      !!p && typeof (p as Record<string, unknown>).nationality_iso === "string",
  );
  const useRows = usable.some((p) => p.is_primary)
    ? usable.filter((p) => p.is_primary)
    : usable;

  return Array.from(new Set(useRows.map((p) => normalizeIso(p.nationality_iso)))).slice(0, 4);
}

// ---------------------------------------------------------------------------
// trip_id resolution path. Service-role client is required so we can read
// the trip + caller's passports across RLS — but we always membership-check
// the caller before trusting any of the data we read.
// ---------------------------------------------------------------------------

async function resolveFromTripId(
  svcClient: ReturnType<typeof createClient>,
  authUserId: string,
  tripId: string,
  purpose: "tourism",
): Promise<ValidatedRequest> {
  const { data: isMember, error: memberErr } = await svcClient.rpc("is_trip_member", {
    _trip_id: tripId,
    _user_id: authUserId,
  });
  if (memberErr) {
    throw new Error(`Membership check failed: ${memberErr.message}`);
  }
  if (!isMember) {
    // Same response shape as the auth path — don't leak existence of the trip.
    const err = new Error("Forbidden: not a member of this trip");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

  const { data: trip, error: tripErr } = await svcClient
    .from("trips")
    .select("id, destination_country_iso, tentative_start_date, tentative_end_date")
    .eq("id", tripId)
    .maybeSingle();
  if (tripErr) {
    throw new Error(`Trip lookup failed: ${tripErr.message}`);
  }
  if (!trip) {
    const err = new Error("Trip not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const destinationIso = (trip as Record<string, unknown>).destination_country_iso;
  if (typeof destinationIso !== "string" || destinationIso.length !== 2) {
    const err = new Error(
      "Trip has no destination_country_iso set yet. Re-generate the trip or supply destination_country directly.",
    );
    (err as Error & { status?: number }).status = 422;
    throw err;
  }

  // Resolve the caller's nationality. Preferred source is the profile —
  // nationality is account-level data and shouldn't have to be re-entered per
  // trip. Fall back to trip_traveller_passports for users who haven't set a
  // profile nationality yet (or for trips imported before the profile-level
  // refactor). Free-text travellers on group trips still use
  // trip_traveller_passports exclusively, but they aren't the caller — this
  // function only reasons about the authenticated user's own passports.
  const nationalities = await resolveCallerNationalities(svcClient, authUserId, tripId);
  if (nationalities.length === 0) {
    const err = new Error(
      "No nationality on file. Add your nationality in account settings to see entry requirements.",
    );
    (err as Error & { status?: number }).status = 422;
    throw err;
  }

  // Trip length from dates when both present; default to 7 otherwise.
  let tripLengthDays = DEFAULT_TRIP_LENGTH_DAYS;
  const start = (trip as Record<string, unknown>).tentative_start_date;
  const end = (trip as Record<string, unknown>).tentative_end_date;
  if (typeof start === "string" && typeof end === "string") {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      const days = Math.round((endMs - startMs) / 86_400_000) + 1;
      if (days > 0 && days <= 365) {
        tripLengthDays = days;
      }
    }
  }

  return {
    nationalities,
    destination_country: normalizeIso(destinationIso),
    trip_length_days: tripLengthDays,
    purpose,
    source_trip_id: tripId,
  };
}

// ---------------------------------------------------------------------------
// HTTP handler.
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // verify_jwt = true is set in supabase/config.toml, but we additionally
    // resolve the user here so we can attribute the ai_request_log row.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Supabase env not configured" }, 500);
    }
    if (!anthropicKey) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: authUser }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authUser) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return jsonResponse({ error: "Request body must be an object" }, 400);
    }
    const body = rawBody as Record<string, unknown>;

    const svcClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const purposeRaw = body.purpose ?? "tourism";
    if (purposeRaw !== "tourism") {
      return jsonResponse(
        { error: "purpose must be 'tourism' (other purposes not yet supported)" },
        400,
      );
    }

    let validated: ValidatedRequest;
    const tripIdRaw = body.trip_id;
    try {
      if (typeof tripIdRaw === "string" && tripIdRaw.trim().length > 0) {
        validated = await resolveFromTripId(
          svcClient,
          authUser.id,
          tripIdRaw.trim(),
          "tourism",
        );
      } else {
        validated = validateDirectRequest(body);
      }
    } catch (e) {
      const status =
        typeof (e as { status?: unknown })?.status === "number"
          ? ((e as { status: number }).status)
          : 400;
      return jsonResponse(
        { error: e instanceof Error ? e.message : "Invalid request" },
        status,
      );
    }

    // Run per-nationality lookups in parallel. Each one is independently
    // cached, so concurrency only fans out on cache misses.
    const lookups = await Promise.all(
      validated.nationalities.map(async (nationality) => {
        const { result, cached } = await lookupOne(svcClient, anthropicKey, authUser.id, {
          nationality,
          destination: validated.destination_country,
          tripLengthDays: validated.trip_length_days,
          purpose: validated.purpose,
        });
        return { nationality, result, cached };
      }),
    );

    const perPassport = lookups.map(({ nationality, result }) => ({ nationality, result }));
    const allCached = lookups.every((l) => l.cached);

    // Single passport: skip the merge step entirely.
    if (perPassport.length === 1) {
      const only = perPassport[0];
      return jsonResponse({
        ...only.result,
        recommended_passport: only.nationality,
        per_passport: { [only.nationality]: only.result },
        cached: allCached,
        source_trip_id: validated.source_trip_id,
        disclaimer:
          "This information is AI-generated and may be out of date or incomplete. Always verify entry requirements with the destination country's embassy or official immigration authority before travel.",
      });
    }

    const merged = pickMostPermissive(perPassport);
    const perPassportMap: Record<string, EntryRequirementsResult> = {};
    for (const { nationality, result } of perPassport) {
      perPassportMap[nationality] = result;
    }

    return jsonResponse({
      ...merged.result,
      recommended_passport: merged.recommended_passport,
      per_passport: perPassportMap,
      cached: allCached,
      source_trip_id: validated.source_trip_id,
      disclaimer:
        "This information is AI-generated and may be out of date or incomplete. Always verify entry requirements with the destination country's embassy or official immigration authority before travel.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[get-entry-requirements] error:", message);
    return jsonResponse({ error: message }, 500);
  }
});

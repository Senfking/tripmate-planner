// Shared Places-API cache + cost logger used by both
// generate-trip-itinerary and concierge-suggest.
//
// Cache tiers:
//   - "search"  : Places Text Search results                           7d
//   - "details" : Place Details (rich fields) keyed by place_id       30d
//   - "geocode" : destination → {lat,lng,country,scale,viewport}      30d
//   - "photo"   : (reserved) photo URL -> bytes mapping, currently    n/a
//
// All writers insert with `expires_at` so the daily cron prunes stale rows
// without the app needing to know the TTL. Cache reads filter by
// `expires_at > now()` so a fresh write always wins.
//
// Cost model (USD per call, based on Google Places (New) public pricing
// as of Q4 2025; tuned on observed bills):
//   - search ranking pass (Essentials field mask) : 0.005
//   - search hydration pass (Pro field mask)      : 0.025
//   - place details GET (Pro fields)              : 0.017
//   - photo media download                        : 0.007
//   - geocoding API lookup                        : 0.005
//   - places searchText (legacy fat mask)         : 0.032
//
// Every call site logs via `logPlacesCall` so the ai_request_log table
// accumulates feature='places_*' rows that the daily-spend circuit breaker
// can sum against `places_daily_budget_usd`.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CacheTier = "search" | "details" | "geocode" | "photo";

export const PLACES_COST: Record<string, number> = {
  search_essentials: 0.005,
  search_pro: 0.025,
  search_enterprise: 0.032,
  details: 0.017,
  photo: 0.007,
  geocode: 0.005,
};

export const CACHE_TTL_DAYS: Record<CacheTier, number> = {
  search: 30,   // bumped from 7 → 30 (Q2 perf push). Restaurants and attractions
                // around a city change much slower than 7 days; warming the cache
                // longer keeps the per-trip Places spend near zero on repeat
                // destinations. Cache rows past TTL are pruned by the daily
                // cleanup_expired_places_cache cron.
  details: 30,
  geocode: 30,
  photo: 30,
};

export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Normalize a lat/lng to ~1km grid to improve cache reuse across nearby
// searches. 0.01 degrees ≈ 1.1 km at the equator. Two users searching
// "restaurants in Tibubeneng" one minute apart should hit the same cache
// row even if the geocoder resolved their destinations to coords 100m apart.
export function bucketLatLng(lat: number, lng: number): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  return `${r(lat)},${r(lng)}`;
}

// Aggressively normalize a free-text query so that "Romantic dinner Paris",
// "  romantic dinner paris ", "Romantic-Dinner Paris!" all collapse to the
// same cache key. Without this, near-identical queries from different intent
// shapes used to bypass the cache and re-hit Google. Steps:
//   1. lower-case
//   2. strip diacritics (NFD + remove combining marks) — "Café" → "cafe"
//   3. replace any non-alphanumeric run with a single space
//   4. collapse whitespace
//   5. trim
function normalizeQueryForCache(s: string): string {
  return s
    .normalize("NFD")
    // Strip Unicode "Combining Diacritical Marks" (U+0300..U+036F).
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchCacheKey(
  rawQuery: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  includedType: string | undefined,
  priceLevels: string[] | undefined,
): string {
  const typeTag = includedType ? `t=${includedType};` : "";
  const priceTag = priceLevels?.length ? `p=${[...priceLevels].sort().join(",")};` : "";
  return `${normalizeQueryForCache(rawQuery)}|${bucketLatLng(lat, lng)}|r=${Math.round(radiusMeters / 1000)}km|${typeTag}${priceTag}`;
}

export function buildGeocodeCacheKey(destination: string): string {
  return normalizeQueryForCache(destination);
}

export interface CacheEntry<T = unknown> {
  data: T;
  cached_at: string;
  expires_at: string;
}

// Returns the cache hit, or null on miss. Errors bubble up — the caller
// must decide whether to fail loud or swallow. In both edge functions
// we fail loud on unexpected DB errors so silent misses never return.
export async function cacheGet<T>(
  client: SupabaseClient,
  tier: CacheTier,
  key: string,
): Promise<T | null> {
  const { data, error } = await client
    .from("places_cache")
    .select("data")
    .eq("cache_tier", tier)
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    throw new Error(`places_cache lookup failed (tier=${tier}): ${error.message}`);
  }
  return (data?.data as T) ?? null;
}

export async function cacheSet<T>(
  client: SupabaseClient,
  tier: CacheTier,
  key: string,
  data: T,
): Promise<void> {
  const ttlDays = CACHE_TTL_DAYS[tier];
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
  // Upsert so re-fetches during TTL just refresh the entry rather than
  // accumulating duplicate rows (unique index enforces this too).
  const { error } = await client
    .from("places_cache")
    .upsert(
      {
        cache_tier: tier,
        cache_key: key,
        data: data as unknown as Record<string, unknown>,
        expires_at: expiresAt,
        cached_at: new Date().toISOString(),
      },
      { onConflict: "cache_tier,cache_key" },
    );
  if (error) {
    // Don't throw — cache writes are best-effort; a failure here should not
    // take down a user trip build. Log loudly so we notice in Supabase logs.
    console.error(`[places_cache] upsert failed (tier=${tier} key=${key.slice(0, 80)}):`, error.message);
    return;
  }
  // Success log lets us grep for `cache_write_ok tier=` in Supabase logs to
  // confirm the cache is actually populating after a deploy. Previously we
  // only logged on error, so a silent "writes never happen" bug would never
  // surface.
  console.log(`[places_cache] cache_write_ok tier=${tier} key=${key.slice(0, 80)} ttl_days=${ttlDays}`);
}

// Log a single Places API call to ai_request_log so the daily-spend circuit
// breaker and billing dashboards can aggregate. `sku` is a short label
// matching PLACES_COST keys; cost is derived there. `feature` tags the
// caller (trip_builder / concierge_suggest) so SQL breakdowns are easy.
export async function logPlacesCall(
  client: SupabaseClient,
  opts: {
    userId: string | null;
    feature: "trip_builder" | "concierge_suggest";
    sku: keyof typeof PLACES_COST;
    count?: number;
    cached?: boolean;
  },
): Promise<void> {
  const count = opts.count ?? 1;
  if (count <= 0) return;
  const unitCost = opts.cached ? 0 : (PLACES_COST[opts.sku] ?? 0);
  const cost = unitCost * count;
  const { error } = await client.from("ai_request_log").insert({
    user_id: opts.userId,
    feature: `places_${opts.sku}_${opts.feature}`,
    model: opts.cached ? "places-cache" : `google-places-${opts.sku}`,
    input_tokens: 0,
    output_tokens: count, // using output_tokens slot as a call-count column — avoids schema bump
    cost_usd: cost,
    cached: !!opts.cached,
  });
  if (error) {
    console.error("[places_log] insert failed:", error.message);
  }
}

// Per-user rate limit. Returns the current count so the caller can decide
// whether to refuse the request with a friendly 429.
export async function userGenerationsInLastHour(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await client.rpc("count_user_trip_generations_last_hour", {
    p_user_id: userId,
  });
  if (error) {
    console.error("[rate_limit] count_user_trip_generations_last_hour failed:", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

// Rolling 24h total Places-API spend in USD. Used by both edge functions as
// a cheap circuit breaker — if exceeded, refuse new generations until the
// window rolls forward. Never throws — a DB failure here shouldn't block
// users. Returns 0 on any error so the circuit stays closed.
export async function placesSpendLastDayUsd(
  client: SupabaseClient,
): Promise<number> {
  const { data, error } = await client.rpc("sum_places_spend_last_day");
  if (error) {
    console.error("[circuit_breaker] sum_places_spend_last_day failed:", error.message);
    return 0;
  }
  const n = typeof data === "string" ? Number.parseFloat(data) : (data as number | null);
  return Number.isFinite(n ?? NaN) ? (n ?? 0) : 0;
}

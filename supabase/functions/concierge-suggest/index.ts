// v2.6 deployed — venue drop instrumentation
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
// Haversine distance (km) between two lat/lng points
// ---------------------------------------------------------------------------
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
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
// Check if free-text query is time-sensitive
// ---------------------------------------------------------------------------
function isTimeSensitiveQuery(query: string): boolean {
  const patterns =
    /\b(tonight|today|this week|this weekend|what'?s on|event|festival|concert|show|live music|happening now|current|opening|closing)\b/i;
  return patterns.test(query);
}

// ---------------------------------------------------------------------------
// Infer category from a free-text query when no structured category is set.
// Returns the best-matching category ID, or undefined if no strong signal.
// ---------------------------------------------------------------------------
function inferCategoryFromQuery(query: string): string | undefined {
  const q = query.toLowerCase();

  // Order matters — check more specific categories first
  const categoryPatterns: Array<{ category: string; pattern: RegExp }> = [
    {
      category: "events",
      pattern:
        /\b(events?|festival|concert|gig|live music|dj|show|performance|whats on|what'?s on|happening|party tonight|music tonight)\b/,
    },
    {
      category: "party",
      pattern: /\b(nightclub|club|party|nightlife|rave|afterparty|dance floor)\b/,
    },
    {
      category: "eat",
      pattern:
        /\b(restaurant|eat|food|dinner|lunch|breakfast|brunch|dining|cuisine|sushi|pizza|taco|burger|cafe|bistro)\b/,
    },
    {
      category: "drink",
      pattern: /\b(bar|cocktail|pub|beer|wine|drinks?|speakeasy|rooftop bar)\b/,
    },
    {
      category: "relax",
      pattern: /\b(spa|massage|wellness|relax|yoga|meditation|retreat)\b/,
    },
    {
      category: "workout",
      pattern: /\b(gym|fitness|crossfit|workout|exercise|training)\b/,
    },
    {
      category: "explore",
      pattern:
        /\b(explore|sightseeing|attraction|museum|temple|market|tour|hike|waterfall)\b/,
    },
  ];

  for (const { category, pattern } of categoryPatterns) {
    if (pattern.test(q)) return category;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Check if structured "when" filter is time-sensitive
// ---------------------------------------------------------------------------
function isTimeSensitiveWhen(when?: string): boolean {
  if (!when) return false;
  return /\b(now|tonight|today|tomorrow|this weekend)\b/i.test(when);
}

// ---------------------------------------------------------------------------
// Build a synthetic query string from structured filters (for caching/history)
// ---------------------------------------------------------------------------
function buildQueryFromFilters(
  category: string,
  destination: string,
  when?: string | string[],
  vibe?: string | string[],
  budget?: string | string[],
): string {
  const parts = [category];
  const vibeArr = Array.isArray(vibe) ? vibe : vibe ? [vibe] : [];
  const whenArr = Array.isArray(when) ? when : when ? [when] : [];
  const budgetArr = Array.isArray(budget) ? budget : budget ? [budget] : [];
  if (vibeArr.length) parts.push(vibeArr.join(" or "));
  if (whenArr.length) parts.push(whenArr.join(" or ").toLowerCase());
  parts.push(`in ${destination}`);
  if (budgetArr.length) parts.push(`(${budgetArr.join(" or ")})`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Resolve "when" filter to a concrete date, time-of-day, and day-of-week
// ---------------------------------------------------------------------------
function resolveWhen(
  when: string,
): { date: string; timeOfDay: string; dayOfWeek: string } {
  const now = new Date();
  let target: Date;
  let timeOfDay: string;

  switch (when.toLowerCase()) {
    case "now":
      target = now;
      timeOfDay = now.getHours() < 12
        ? "morning"
        : now.getHours() < 17
          ? "afternoon"
          : "evening";
      break;
    case "tonight":
      target = now;
      timeOfDay = "night";
      break;
    case "tomorrow": {
      target = new Date(now);
      target.setDate(target.getDate() + 1);
      timeOfDay = "any time";
      break;
    }
    case "this weekend": {
      target = new Date(now);
      const dow = target.getDay();
      if (dow !== 0 && dow !== 6) {
        target.setDate(target.getDate() + (6 - dow));
      }
      timeOfDay = "any time";
      break;
    }
    default:
      target = now;
      timeOfDay = "any time";
  }

  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return {
    date: `${yyyy}-${mm}-${dd}`,
    timeOfDay,
    dayOfWeek: days[target.getDay()],
  };
}

// ---------------------------------------------------------------------------
// Map structured category ID to a descriptive label
// ---------------------------------------------------------------------------
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  eat: "restaurants and food spots",
  drink: "bars and drinking spots",
  party: "nightlife, clubs, and party venues",
  explore: "attractions and things to see",
  relax: "relaxation and wellness spots",
  workout: "gyms and fitness activities",
  events: "events, festivals, concerts, and happenings",
  surprise: "unique and unexpected experiences",
};

// ---------------------------------------------------------------------------
// Universal ranking principle — injected into every system prompt
// ---------------------------------------------------------------------------
const RANKING_PRINCIPLE = `
RANKING PRINCIPLE — applies to every suggestion you make:
Always rank results by how directly they answer the user's specific request.

TIER 1 — Direct matches: Results that are exactly what the user asked for. If they asked for "rooftop bars," a rooftop bar. If they asked for "electronic music events," a specific event. If they asked for "best sushi," a sushi restaurant. These go first.

TIER 2 — Strong adjacent matches: Results that are closely related and enhance the answer. For "rooftop bars," a highly-rated sky lounge. For "electronic music events," a special DJ night at a known venue. For "best sushi," an omakase experience. These fill out the middle.

TIER 3 — Contextual recommendations: Results that are relevant to the broader intent but not exact matches. For "rooftop bars," a ground-level cocktail bar that's too good to skip. For "electronic music events," a club known for that genre even without a specific event listed. For "best sushi," a Japanese restaurant with exceptional sushi as part of a broader menu. These round out the list if needed.

ALWAYS:
- Lead with Tier 1 results. If none exist, say so honestly in the summary.
- Fill remaining slots with Tier 2, then Tier 3.
- Each result's "why" field should make clear WHY it's recommended for this specific query — don't make the user guess the connection.
- The summary text should reflect what was actually found, not generic filler.`;

// ---------------------------------------------------------------------------
// Suggestion JSON schema (shared between structured & free-text prompts)
// ---------------------------------------------------------------------------
function suggestionJsonSchema(destination: string): string {
  return `{
  "summary": "Brief one-liner response to their query",
  "suggestions": [
    {
      "name": "Venue Name",
      "category": "food|nightlife|culture|relaxation|activity|wellness|shopping|events",
      "why": "One sentence why this fits their request",
      "best_time": "7pm-11pm",
      "estimated_cost_per_person": 150000,
      "currency": "IDR",
      "is_event": false,
      "event_details": null,
      "booking_url": "https://example.com/book (optional — venue website or booking page if known, null otherwise)",
      "pro_tip": "Insider hack or tip that makes the experience better (optional, null if none)",
      "what_to_order": "Specific dish or drink to order (optional, null if not relevant)",
      "specific_night": "If this place is best on a specific night, explain why (optional, null if any night works)",
      "opening_hours": "Opening hours if known (optional, null if unknown)",
      "full_description": "2-3 sentence detailed description of the place"
    }
  ]
}

Rules for is_event and event_details:
- Set is_event to true ONLY for specifically named, date-limited happenings: a festival edition (Day Zero, Epizode), a touring artist's one-off show, a themed party with a specific name and date, or a popup — NOT for permanent venues or their regular programming.
- A venue's regular weekly/nightly programming (sunset sessions, resident DJs, weekly parties) is NOT an event. Present as a regular venue and mention the programming in pro_tip.
- When a specific named event happens at a venue, use format "Event Name at Venue Name" as the name (e.g. "Day Zero at Savaya").
- When is_event is true, event_details MUST be a short string like "DJ Set by [name], 10pm-3am, IDR 200k cover" or "Night Market, 6pm-midnight, free entry".
- When is_event is false, event_details should be null.
- pro_tip should be a genuine insider tip, not generic advice. Think: "Ask for the secret menu" or "Sit upstairs for the view".
- what_to_order: specific items, not generic ("The wagyu tartare" not "try their food").
- booking_url: If you know the venue has a website, booking page, or reservation system, include the URL. For restaurants, link to their reservation page. For activities, link to GetYourGuide or the venue's booking page if known. Otherwise null.`;
}

// ---------------------------------------------------------------------------
// Build event-search instructions for time-sensitive requests
// ---------------------------------------------------------------------------
function eventSearchInstructions(
  destination: string,
  category: string | undefined,
  dateStr: string,
  whenLabel: string,
  dayOfWeek: string,
  hasEventData: boolean,
): string {
  const catLabel = category
    ? CATEGORY_DESCRIPTIONS[category] || category
    : "things to do";

  if (hasEventData) {
    // We have real event data from web search — tell the LLM to use it
    return `

CRITICAL — TIME-SENSITIVE REQUEST (${whenLabel}, ${dateStr}, ${dayOfWeek}):
The user is looking for ${catLabel} in ${destination} for a specific time.
You have been provided EVENT DATA from a web search above. Use it.
- Apply the RANKING PRINCIPLE: specific events from EVENT DATA that directly match the query are Tier 1. Venues known for ${catLabel} are Tier 2-3 depending on relevance.
- Mark events with "type": "event" and "is_event": true, and fill in event_details with times, performers, cover charges, etc.
- Venues you pick should be ones known for ${catLabel} — places a local would recommend for this kind of night/activity.
- DATE ACCURACY: For event dates and times, ONLY use dates explicitly mentioned in the EVENT DATA section. Never guess, infer, or use dates from your training data. If an event's date is not in the EVENT DATA, say "check listing for dates" instead of inventing one.`;
  }

  // No event data available — instruct the LLM to use its own knowledge
  return `

CRITICAL — TIME-SENSITIVE REQUEST (${whenLabel}, ${dateStr}, ${dayOfWeek}):
The user is looking for ${catLabel} in ${destination} for a specific time.
No web search results were available, so use your best knowledge of recurring events, weekly parties, and cultural happenings in ${destination}.
- Apply the RANKING PRINCIPLE: time-specific happenings (a DJ night, a weekly market, a recurring event) that match the query are Tier 1. Permanent venues known for this type of activity are Tier 2-3.
- Mark time-specific happenings with "type": "event" and "is_event": true, and fill in event_details.
- If you know of major festivals or events around ${dateStr} in ${destination}, include them.
- DATE ACCURACY: Only state specific dates if you are highly confident they are correct. For events where you are unsure of the exact date, say "check listing for exact dates" rather than guessing.`;
}

// ---------------------------------------------------------------------------
// Event web search result shape
// ---------------------------------------------------------------------------
interface EventSearchResult {
  name: string;
  date: string | null;
  venue: string | null;
  description: string;
  url: string | null;
  source: string;
}

// ---------------------------------------------------------------------------
// searchEvents — server-side web search for live/upcoming events.
// Tries Brave Search API first (BRAVE_API_KEY), falls back to Google Custom
// Search (GOOGLE_SEARCH_API_KEY + GOOGLE_CSE_ID). Returns structured results.
// ---------------------------------------------------------------------------
// Strip relative-time phrases from a query so they don't clash with absolute dates
function stripTimePhrases(q: string): string {
  return q
    .replace(
      /\b(this week|this weekend|tonight|today|tomorrow|next week|next weekend)\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function searchEvents(
  destination: string,
  userQuery: string,
  dateStr: string,
  category: string | undefined,
): Promise<EventSearchResult[]> {
  const braveKey = Deno.env.get("BRAVE_API_KEY");
  const googleSearchKey = Deno.env.get("GOOGLE_SEARCH_API_KEY");
  const googleCseId = Deno.env.get("GOOGLE_CSE_ID");

  // Build 4 targeted query angles
  const dateObj = new Date(dateStr + "T12:00:00");
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthYear = `${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  const cleanQuery = stripTimePhrases(userQuery);

  // Query 1: Direct user intent — "{user query} {location}"
  // e.g. "electronic music events Bali April 2026"
  const q1 = `${cleanQuery} ${destination} ${monthYear}`.trim();

  // Query 2: Broad listing — "events {location} {month} {year}"
  // e.g. "events Bali April 2026"
  const q2 = `events ${destination} ${monthYear}`.trim();

  // Query 3: Festival specific — "festival {location} {month} {year}"
  // e.g. "festival Bali April 2026"
  const q3 = `festival ${destination} ${monthYear}`.trim();

  // Query 4: Site-targeted — event listing sites surface actual events, not venue pages
  // e.g. "Bali events site:ra.co OR site:eventbrite.com OR site:dice.fm"
  const q4 =
    `${destination} events ${monthYear} site:ra.co OR site:eventbrite.com OR site:dice.fm`.trim();

  const queries = [q1, q2, q3, q4];
  console.log(
    `[concierge-suggest] === EVENT SEARCH QUERIES === ${JSON.stringify(queries)}`,
  );

  if (braveKey) {
    console.log("[concierge-suggest] === CALLING BRAVE === key present, dispatching", queries.length, "queries");
    const results = await searchEventsViaBrave(braveKey, queries);
    console.log(`[concierge-suggest] === BRAVE RESPONSE === ${results.length} total results, first 3: ${JSON.stringify(results.slice(0, 3).map(r => r.name))}`);
    return results;
  }

  if (googleSearchKey && googleCseId) {
    return searchEventsViaGoogleCSE(googleSearchKey, googleCseId, queries);
  }

  // No search API key available
  console.warn(
    "[concierge-suggest] No web search API key configured. " +
      "Set BRAVE_API_KEY or (GOOGLE_SEARCH_API_KEY + GOOGLE_CSE_ID) in Supabase secrets " +
      "to enable event search. Falling back to LLM knowledge only.",
  );
  return [];
}

// Deduplicate event search results by URL (exact) and name (fuzzy token subset).
// Catches "Day Zero" vs "Day Zero Bali" as the same event.
function deduplicateEventResults(
  batches: EventSearchResult[][],
  limit = 20,
): EventSearchResult[] {
  const seenUrls = new Set<string>();
  const seenTokenSets: Set<string>[] = [];
  const merged: EventSearchResult[] = [];

  for (const batch of batches) {
    for (const r of batch) {
      // URL-based dedup (exact match)
      if (r.url && seenUrls.has(r.url)) continue;

      // Name-based fuzzy dedup via token subset
      const tokNew = new Set(tokenize(r.name));
      let nameIsDupe = false;
      if (tokNew.size > 0) {
        for (const prevSet of seenTokenSets) {
          const [smaller, larger] =
            tokNew.size <= prevSet.size
              ? [tokNew, prevSet]
              : [prevSet, tokNew];
          let allFound = true;
          for (const w of smaller) {
            if (!larger.has(w)) { allFound = false; break; }
          }
          if (allFound) { nameIsDupe = true; break; }
        }
      }
      if (nameIsDupe) continue;

      if (r.url) seenUrls.add(r.url);
      if (tokNew.size > 0) seenTokenSets.push(tokNew);
      merged.push(r);
    }
  }

  return merged.slice(0, limit);
}

async function searchEventsViaBrave(
  apiKey: string,
  queries: string[],
): Promise<EventSearchResult[]> {
  const runQuery = async (q: string): Promise<EventSearchResult[]> => {
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
        console.error(
          `[concierge-suggest] Brave search error for "${q}": ${res.status}`,
        );
        return [];
      }
      const data = await res.json();
      const results = data.web?.results ?? [];
      console.log(
        `[concierge-suggest] Brave raw for "${q}": ${results.length} hits — ${results
          .slice(0, 5)
          .map((r: { title?: string }) => r.title)
          .join(" | ")}`,
      );
      return results.map(
        (r: {
          title?: string;
          url?: string;
          description?: string;
          page_age?: string;
        }) => ({
          name: r.title ?? "Unknown event",
          date: r.page_age ?? null,
          venue: null,
          description: r.description ?? "",
          url: r.url ?? null,
          source: "brave_search",
        }),
      );
    } catch (err) {
      console.error("[concierge-suggest] Brave search exception:", err);
      return [];
    }
  };

  // Run all queries in parallel, deduplicate by URL + fuzzy name
  const allResults = await Promise.all(queries.map(runQuery));

  const merged = deduplicateEventResults(allResults);
  console.log(
    `[concierge-suggest] Brave search total: ${merged.length} unique results`,
  );
  return merged;
}

async function searchEventsViaGoogleCSE(
  apiKey: string,
  cseId: string,
  queries: string[],
): Promise<EventSearchResult[]> {
  const runQuery = async (q: string): Promise<EventSearchResult[]> => {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(q)}&num=10&dateRestrict=m1`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`[concierge-suggest] Google CSE error for "${q}": ${res.status}`);
        return [];
      }
      const data = await res.json();
      const items = data.items ?? [];
      return items.map(
        (r: { title?: string; link?: string; snippet?: string }) => ({
          name: r.title ?? "Unknown event",
          date: null,
          venue: null,
          description: r.snippet ?? "",
          url: r.link ?? null,
          source: "google_cse",
        }),
      );
    } catch (err) {
      console.error("[concierge-suggest] Google CSE exception:", err);
      return [];
    }
  };

  const allResults = await Promise.all(queries.map(runQuery));

  const merged = deduplicateEventResults(allResults);
  console.log(
    `[concierge-suggest] Google CSE total: ${merged.length} unique results`,
  );
  return merged;
}

// ---------------------------------------------------------------------------
// Interfaces for batch Places pipeline
// ---------------------------------------------------------------------------

interface PlacesSearchQuery {
  textQuery: string;
  includedType?: string;
  priceLevels?: string[];
  locationBias: {
    circle: {
      center: { latitude: number; longitude: number };
      radius: number;
    };
  };
}

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
}

// ---------------------------------------------------------------------------
// buildPlacesQueries — generate 3-4 Google Places Text Search query objects
// from structured filters (no LLM involved)
// ---------------------------------------------------------------------------
function buildPlacesQueries(
  category: string,
  vibes: string[],
  budget: string | undefined,
  location: { name: string; lat: number; lng: number },
  customText?: string,
): PlacesSearchQuery[] {
  // Category → base search terms
  const searchTermsByCategory: Record<string, string[]> = {
    eat: ["restaurant", "dining", "dinner"],
    drink: ["bar", "cocktail bar", "pub"],
    party: ["nightclub", "nightlife", "party venue"],
    explore: ["things to do", "attractions", "must visit"],
    relax: ["spa", "wellness", "massage"],
    workout: ["gym", "fitness center", "crossfit"],
    events: ["nightclub", "live music venue", "concert venue"],
    surprise: ["hidden gem", "unique experience", "local favorite"],
  };

  // Only assign includedType for categories with a clear 1:1 mapping
  const includedTypeMap: Record<string, string> = {
    eat: "restaurant",
    drink: "bar",
    workout: "gym",
    relax: "spa",
  };

  // Budget string → Google Places priceLevels enum values
  const budgetToPriceLevels: Record<string, string[]> = {
    "$": ["PRICE_LEVEL_INEXPENSIVE"],
    "$$": ["PRICE_LEVEL_MODERATE"],
    "$$$": ["PRICE_LEVEL_EXPENSIVE"],
  };

  const terms = searchTermsByCategory[category] || searchTermsByCategory.explore;
  const includedType = includedTypeMap[category];
  const priceLevels = budget ? budgetToPriceLevels[budget] : undefined;

  const locationBias = {
    circle: {
      center: { latitude: location.lat, longitude: location.lng },
      radius: 15000,
    },
  };

  const makeQuery = (textQuery: string): PlacesSearchQuery => ({
    textQuery,
    ...(includedType && { includedType }),
    ...(priceLevels && { priceLevels }),
    locationBias,
  });

  const queries: PlacesSearchQuery[] = [];

  // Query 1: vibe + primary term + location (e.g. "romantic restaurant Canggu")
  const primaryVibe = vibes.length > 0 ? vibes[0] : "";
  queries.push(
    makeQuery(
      primaryVibe
        ? `${primaryVibe} ${terms[0]} ${location.name}`
        : `best ${terms[0]} ${location.name}`,
    ),
  );

  // Query 2: secondary vibe/term + location (e.g. "fine dining Canggu")
  const secondaryVibe = vibes.length > 1 ? vibes[1] : "";
  queries.push(
    makeQuery(
      secondaryVibe
        ? `${secondaryVibe} ${terms[1]} ${location.name}`
        : `${terms[1]} ${location.name}`,
    ),
  );

  // Query 3: broader search (e.g. "best dinner Canggu")
  queries.push(makeQuery(`best ${terms[2]} ${location.name}`));

  // Query 4 (optional): custom text with location appended
  if (customText) {
    queries.push(makeQuery(`${customText} ${location.name}`));
  }

  return queries;
}

// ---------------------------------------------------------------------------
// searchPlacesBatch — run all queries against Google Places Text Search API
// (New) in parallel, deduplicate, and filter excluded IDs
// ---------------------------------------------------------------------------
async function searchPlacesBatch(
  queries: PlacesSearchQuery[],
  googleKey: string,
  excludePlaceIds: string[] = [],
): Promise<BatchPlaceResult[]> {
  const excludeSet = new Set(excludePlaceIds);

  const allResults = await Promise.all(
    queries.map(async (q) => {
      try {
        const res = await fetch(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": googleKey,
              "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.photos,places.googleMapsUri,places.businessStatus",
            },
            body: JSON.stringify(q),
          },
        );

        if (!res.ok) return [];

        const data = await res.json();
        return (data.places ?? []) as Array<Record<string, unknown>>;
      } catch {
        return [];
      }
    }),
  );

  // Flatten and deduplicate by place ID, filtering out excluded IDs
  const seen = new Set<string>();
  const deduped: BatchPlaceResult[] = [];

  for (const places of allResults) {
    for (const p of places) {
      const id = p.id as string;
      if (!id || seen.has(id) || excludeSet.has(id)) continue;
      seen.add(id);

      deduped.push({
        id,
        displayName:
          (p.displayName as { text?: string } | undefined)?.text ?? null,
        formattedAddress: (p.formattedAddress as string) ?? null,
        location:
          (p.location as { latitude: number; longitude: number } | undefined) ??
          null,
        rating: (p.rating as number) ?? null,
        userRatingCount: (p.userRatingCount as number) ?? null,
        priceLevel: (p.priceLevel as string) ?? null,
        types: Array.isArray(p.types) ? (p.types as string[]) : [],
        photos: Array.isArray(p.photos)
          ? (p.photos as Array<{ name: string }>)
          : [],
        googleMapsUri: (p.googleMapsUri as string) ?? null,
        businessStatus: (p.businessStatus as string) ?? null,
      });
    }
  }

  return deduped;
}

// ---------------------------------------------------------------------------
// Fuzzy name matching — normalise to lowercase alphanumeric and check if one
// string contains the other (handles "Savaya" matching "Savaya Bali - Beach Club")
// ---------------------------------------------------------------------------
function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Tokenize a name into lowercase words, stripping punctuation
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

// Levenshtein distance between two strings
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Single-row DP to save memory
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function fuzzyNameMatch(a: string, b: string): boolean {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return false;

  // 1. Exact match after normalisation
  if (na === nb) return true;

  // 2. One contains the other as a substring
  if (na.length >= 4 && nb.length >= 4) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }

  // 3. Token-based matching (location-agnostic, no hardcoded word lists)
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  if (tokA.length === 0 || tokB.length === 0) return false;

  // Subset match: one name's tokens are entirely contained in the other's set
  // e.g. {"savaya"} ⊂ {"savaya", "beach", "club"}
  // e.g. {"la", "favela"} ⊂ {"la", "favela", "bali"}
  const setA = new Set(tokA);
  const setB = new Set(tokB);
  const [smaller, larger] =
    setA.size <= setB.size ? [setA, setB] : [setB, setA];
  if (smaller.size >= 1) {
    let allFound = true;
    for (const w of smaller) {
      if (!larger.has(w)) { allFound = false; break; }
    }
    if (allFound) return true;
  }

  // 4. Levenshtein distance < 20% of the longer normalised string
  const longer = na.length >= nb.length ? na : nb;
  const dist = levenshtein(na, nb);
  if (dist < longer.length * 0.2) return true;

  return false;
}

// ---------------------------------------------------------------------------
// validateAIResponse — pure-code validation of AI picks against Google Places
// ground truth. Merges AI enrichment (description, pro_tip) with verified data.
// ---------------------------------------------------------------------------
function validateAIResponse(
  aiResponse: Array<Record<string, unknown>>,
  originalPlaces: BatchPlaceResult[],
  searchLat: number,
  searchLng: number,
  excludeIds: string[] = [],
): Array<Record<string, unknown>> {
  const placesById = new Map<string, BatchPlaceResult>();
  for (const p of originalPlaces) {
    placesById.set(p.id, p);
  }
  const excludeSet = new Set(excludeIds);

  const validated: Array<Record<string, unknown>> = [];

  for (const item of aiResponse) {
    const isEvent = item.type === "event" || item.is_event === true;

    // --- Event-type suggestions: relaxed validation (no place_id required) ---
    // Events do NOT run the fuzzy-match-against-venue-names loop — that's a 50x
    // comparison per event that always fails for genuine events like festivals
    // and produces zero signal.
    if (isEvent) {
      const eventName = (item.name as string) || "";
      if (!eventName) continue;

      // Must have some date/time reference
      const hasTimeRef = !!(
        item.event_details ||
        item.best_time ||
        item.specific_night ||
        item.date
      );
      if (!hasTimeRef) continue;

      // If coordinates are provided, check distance
      const lat = item.lat as number | undefined;
      const lng = item.lng as number | undefined;
      let unverifiedLocation = true;
      if (
        typeof lat === "number" &&
        typeof lng === "number" &&
        searchLat !== null &&
        searchLng !== null
      ) {
        const dist = haversineKm(searchLat, searchLng, lat, lng);
        if (dist > 25) continue;
        unverifiedLocation = false;
      }

      validated.push({
        id: item.id ?? null,
        name: eventName,
        address: item.address ?? item.venue ?? null,
        lat: lat ?? null,
        lng: lng ?? null,
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        types: ["event"],
        photos: [],
        googleMapsUri: null,
        businessStatus: null,
        description: item.description ?? item.full_description ?? null,
        pro_tip: item.pro_tip ?? null,
        why: item.why ?? null,
        category: "events",
        best_time: item.best_time ?? null,
        estimated_cost_per_person: item.estimated_cost_per_person ?? null,
        currency: item.currency ?? null,
        what_to_order: item.what_to_order ?? null,
        booking_url: item.booking_url ?? item.url ?? null,
        is_event: true,
        event_details: item.event_details ?? null,
        specific_night: item.specific_night ?? null,
        opening_hours: item.opening_hours ?? null,
        type: "event",
        unverified_location: unverifiedLocation,
      });
      continue;
    }

    // --- Venue-type suggestions: hydrate from Places, THEN validate ---
    const id = item.id as string;
    if (!id) {
      console.log(
        `[concierge-suggest][venue-drop] DROP_EMPTY_ID item.id=${JSON.stringify(item.id)} item.name=${JSON.stringify(item.name)}`,
      );
      continue;
    }

    // Skip excluded IDs
    if (excludeSet.has(id)) {
      console.log(
        `[concierge-suggest][venue-drop] DROP_EXCLUDED id=${id}`,
      );
      continue;
    }

    // ID must exist in the original Places results. If not, the AI either
    // hallucinated the ID or copied it incorrectly — drop before hydration.
    const place = placesById.get(id);
    if (!place) {
      console.log(
        `[concierge-suggest][venue-drop] DROP_NOT_IN_PLACES id=${id} placesById.size=${placesById.size}`,
      );
      continue;
    }

    // --- HYDRATE from Places ground truth BEFORE any name-dependent validation.
    // AI is instructed to return only "id"; name/address/coords come from Places.
    const hydrated = {
      ...item,
      name: place.displayName ?? (item.name as string) ?? place.id,
      address: place.formattedAddress,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
    };
    if (!place.displayName) {
      console.warn(
        `[concierge-suggest] Places venue id=${place.id} has null displayName, using fallback="${hydrated.name}"`,
      );
    }

    // --- Now validate the hydrated venue ---
    // Coordinates must be within 25 km of the search center
    if (place.location) {
      const dist = haversineKm(
        searchLat,
        searchLng,
        place.location.latitude,
        place.location.longitude,
      );
      if (dist > 25) {
        console.log(
          `[concierge-suggest][venue-drop] DROP_DISTANCE id=${id} name=${JSON.stringify(hydrated.name)} distKm=${dist.toFixed(2)} searchLat=${searchLat} searchLng=${searchLng} venueLat=${place.location.latitude} venueLng=${place.location.longitude}`,
        );
        continue;
      }
    }

    // businessStatus must be OPERATIONAL (or not set)
    if (place.businessStatus && place.businessStatus !== "OPERATIONAL") {
      console.log(
        `[concierge-suggest][venue-drop] DROP_BUSINESS_STATUS id=${id} name=${JSON.stringify(hydrated.name)} businessStatus=${JSON.stringify(place.businessStatus)}`,
      );
      continue;
    }

    console.log(
      `[concierge-suggest][venue-pass] PASS id=${id} name=${JSON.stringify(hydrated.name)}`,
    );

    // Merge: Google Places ground truth + AI enrichment fields
    validated.push({
      id: place.id,
      name: hydrated.name,
      address: hydrated.address,
      lat: hydrated.lat,
      lng: hydrated.lng,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      priceLevel: place.priceLevel,
      types: place.types,
      photos: place.photos,
      googleMapsUri: place.googleMapsUri,
      businessStatus: place.businessStatus,
      // AI-provided enrichment
      description: item.description ?? item.full_description ?? null,
      pro_tip: item.pro_tip ?? null,
      why: item.why ?? null,
      category: item.category ?? null,
      best_time: item.best_time ?? null,
      estimated_cost_per_person: item.estimated_cost_per_person ?? null,
      currency: item.currency ?? null,
      what_to_order: item.what_to_order ?? null,
      booking_url: item.booking_url ?? null,
      is_event: false,
      event_details: null,
      specific_night: item.specific_night ?? null,
      opening_hours: item.opening_hours ?? null,
    });
  }

  return validated;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  console.log("[concierge-suggest] v2.6 deployed — venue drop instrumentation", new Date().toISOString());
  console.log("[concierge-suggest] === REQUEST RECEIVED ===", new Date().toISOString(), req.method, req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // ---- Parse body ----
    const body = await req.json();
    const { trip_id, context } = body as {
      trip_id: string;
      context: {
        destination: string;
        location?: string;
        user_location?: { lat: number; lng: number };
        date?: string;
        time_of_day?: string;
        group_size?: number;
        budget_level?: string;
        preferences?: string[];
        hotel_location?: { name: string; lat: number; lng: number };
      };
    };

    const specificLocation = context?.location;
    const userGps = context?.user_location;

    // Determine request type: structured filters vs free text
    const isStructured = !!body.category && !body.query;
    const structCategory: string | undefined = body.category;
    const structWhen: string | string[] | undefined = body.when;
    const structVibe: string | string[] | undefined = body.vibe;
    const structBudget: string | string[] | undefined = body.budget;
    const feelingLucky: boolean = !!body.feeling_lucky;
    const excludeNames: string[] = Array.isArray(body.exclude_names) ? body.exclude_names : [];
    // Normalize to arrays for multi-select support
    const whenArr = Array.isArray(structWhen) ? structWhen : structWhen ? [structWhen] : [];
    const vibeArr = Array.isArray(structVibe) ? structVibe : structVibe ? [structVibe] : [];
    const budgetArr = Array.isArray(structBudget) ? structBudget : structBudget ? [structBudget] : [];

    // Build query string (real query for free-text, synthetic for structured)
    const query: string = isStructured
      ? buildQueryFromFilters(
          structCategory!,
          context?.destination || "",
          structWhen,
          structVibe,
          structBudget,
        )
      : body.query;

    if (!trip_id || (!body.query && !isStructured) || !context?.destination) {
      return jsonResponse(
        {
          error:
            "trip_id, query (or category), and context.destination are required",
        },
        400,
      );
    }

    // ---- Trip membership check ----
    const { data: isMember } = await supabase.rpc("is_trip_member", {
      _trip_id: trip_id,
      _user_id: user.id,
    });
    if (!isMember) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // ---- Check cache for non-time-sensitive queries ----
    const timeSensitive =
      isTimeSensitiveQuery(query) ||
      whenArr.some(w => isTimeSensitiveWhen(w)) ||
      structCategory === "events";

    if (!timeSensitive && excludeNames.length === 0) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from("concierge_messages")
        .select("content, suggestions")
        .eq("trip_id", trip_id)
        .eq("role", "assistant")
        .gte("created_at", oneHourAgo)
        .order("created_at", { ascending: false })
        .limit(20);

      if (cached && cached.length > 0) {
        const normalise = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normQuery = normalise(query);
        const normDest = normalise(context.destination);

        const hit = cached.find((row) => {
          const sugStr = JSON.stringify(row.suggestions ?? "").toLowerCase();
          return (
            sugStr.includes(normDest) &&
            sugStr.includes(normQuery.slice(0, 10))
          );
        });

        if (hit) {
          await supabase.from("concierge_messages").insert({
            trip_id,
            user_id: user.id,
            role: "user",
            content: query,
          });

          return jsonResponse({
            summary: hit.content,
            suggestions: hit.suggestions ?? [],
            cached: true,
          });
        }
      }
    }

    // ---- Save user message ----
    const { error: insertUserErr } = await supabase
      .from("concierge_messages")
      .insert({
        trip_id,
        user_id: user.id,
        role: "user",
        content: query,
      });
    if (insertUserErr) {
      console.error("[concierge-suggest] insert user msg:", insertUserErr);
    }

    // ---- API keys ----
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);
    }
    const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY");

    // ---- Build system prompt ----
    const groupSize = context.group_size ?? 2;
    const budgetLevel = budgetArr.length ? budgetArr.join(" or ") : context.budget_level || "mid-range";
    const vibes =
      context.preferences && context.preferences.length > 0
        ? context.preferences.join(", ")
        : "open to anything";

    const hotelNote = context.hotel_location
      ? `They are staying at ${context.hotel_location.name}.`
      : "";

    const locationEnforcement = `CRITICAL: Every suggestion MUST be a real, currently operating venue in or within 15 minutes of ${specificLocation || context.destination}. Do NOT invent venue names. If you're not confident a venue exists, don't include it. It's better to suggest 3 verified real places than 5 questionable ones.`;

    // Location-precision block: constrains suggestions to a specific area
    const locationNote = specificLocation
      ? `The user is currently in ${specificLocation} (within the broader destination of ${context.destination}). ALL suggestions must be in or very near ${specificLocation}. Do NOT suggest places in other areas — if the user is in ${specificLocation.split(",")[0].trim()}, don't suggest spots in distant neighborhoods. Only suggest spots that are within 15-20 minutes of ${specificLocation}. If the user wants suggestions elsewhere, they'll change their location.`
      : "";
    const gpsNote = userGps
      ? `User's GPS coordinates: ${userGps.lat}, ${userGps.lng}. Prioritize venues closest to these coordinates.`
      : "";

    // Resolve dates for event search
    let dateStr: string;
    let timeOfDay: string;
    let dayOfWeek: string;
    let whenLabel: string;

    if (isStructured && whenArr.length > 0) {
      // Use first "when" for date resolution, but pass all for labeling
      const resolved = resolveWhen(whenArr[0]);
      dateStr = resolved.date;
      timeOfDay = resolved.timeOfDay;
      dayOfWeek = resolved.dayOfWeek;
      whenLabel = whenArr.join(" or ").toLowerCase();
    } else {
      dateStr = context.date ?? new Date().toISOString().split("T")[0];
      timeOfDay = context.time_of_day ?? "any time";
      const d = new Date(dateStr + "T12:00:00");
      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      dayOfWeek = dayNames[d.getDay()] || "Saturday";
      whenLabel = timeOfDay;
    }

    // ---- Fetch real venue data via batch Places pipeline ----
    // Guard: (0, 0) is Null Island — never a valid user location. Treat as missing.
    const rawLat = userGps?.lat ?? context.hotel_location?.lat ?? null;
    const rawLng = userGps?.lng ?? context.hotel_location?.lng ?? null;
    let searchLat = rawLat === 0 && rawLng === 0 ? null : rawLat;
    let searchLng = rawLat === 0 && rawLng === 0 ? null : rawLng;
    const searchLocationName = specificLocation || context.destination;

    // Geocode destination if no GPS coordinates provided
    if (searchLat === null && searchLng === null && googleKey && context.destination) {
      try {
        console.log(`[concierge-suggest] No GPS coords — geocoding "${context.destination}"`);
        const geoRes = await fetch(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": googleKey,
              "X-Goog-FieldMask": "places.location,places.displayName",
            },
            body: JSON.stringify({
              textQuery: context.destination,
              maxResultCount: 1,
            }),
          },
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          const firstPlace = geoData.places?.[0];
          if (firstPlace?.location) {
            searchLat = firstPlace.location.latitude;
            searchLng = firstPlace.location.longitude;
            console.log(`[concierge-suggest] Geocoded "${context.destination}" → ${searchLat}, ${searchLng}`);
          }
        }
      } catch (geoErr) {
        console.warn("[concierge-suggest] Geocoding failed:", geoErr);
      }
    }

    // For free-text queries, infer category from the query text
    const inferredCategory = !isStructured ? inferCategoryFromQuery(body.query) : undefined;
    const searchCategory = structCategory || inferredCategory || "explore";
    console.log(`[concierge-suggest] category resolution: struct=${structCategory}, inferred=${inferredCategory}, final=${searchCategory}`);
    const customSearchText = !isStructured ? body.query : undefined;
    const excludePlaceIds: string[] = Array.isArray(body.exclude_place_ids)
      ? body.exclude_place_ids
      : [];

    let venueData: BatchPlaceResult[] = [];

    if (googleKey && searchLat !== null && searchLng !== null) {
      const queries = buildPlacesQueries(
        searchCategory,
        vibeArr,
        budgetArr[0],
        { name: searchLocationName, lat: searchLat, lng: searchLng },
        customSearchText,
      );
      console.log(`[concierge-suggest] Places queries: ${JSON.stringify(queries.map(q => q.textQuery))}`);
      venueData = await searchPlacesBatch(queries, googleKey, excludePlaceIds);
      console.log(`[concierge-suggest] Places API returned ${venueData.length} venues for category="${searchCategory}"`);

      // FALLBACK: When category is "events" and Google Places returns fewer than
      // 3 venues (the narrow terms "nightclub", "live music venue", "concert venue"
      // often miss bars and beach clubs), run a second round with broader terms so
      // the AI always has venues to mix with events.
      if (searchCategory === "events" && venueData.length < 3) {
        console.log(`[concierge-suggest] Events category has only ${venueData.length} venues — running broader fallback Places queries`);
        const existingIds = venueData.map(v => v.id);
        const fallbackTerms = [
          `popular bar ${searchLocationName}`,
          `nightclub ${searchLocationName}`,
          `beach club ${searchLocationName}`,
          `live music ${searchLocationName}`,
        ];
        const locationBias = {
          circle: {
            center: { latitude: searchLat, longitude: searchLng },
            radius: 15000,
          },
        };
        const fallbackQueries: PlacesSearchQuery[] = fallbackTerms.map(t => ({
          textQuery: t,
          locationBias,
        }));
        console.log(`[concierge-suggest] Fallback Places queries: ${JSON.stringify(fallbackTerms)}`);
        const fallbackVenues = await searchPlacesBatch(
          fallbackQueries,
          googleKey,
          [...excludePlaceIds, ...existingIds],
        );
        console.log(`[concierge-suggest] Fallback Places returned ${fallbackVenues.length} additional venues`);
        venueData = [...venueData, ...fallbackVenues];
        console.log(`[concierge-suggest] Total venues after fallback: ${venueData.length}`);
      }
    } else {
      console.log(`[concierge-suggest] Skipping Places API: googleKey=${!!googleKey}, lat=${searchLat}, lng=${searchLng}`);
    }

    // ---- Server-side event web search ----
    let eventSearchResults: EventSearchResult[] = [];
    const shouldSearchEvents =
      searchCategory === "events" || timeSensitive;

    if (shouldSearchEvents) {
      const eventQuery = !isStructured ? body.query : (
        CATEGORY_DESCRIPTIONS[structCategory!] || structCategory || "events"
      );
      eventSearchResults = await searchEvents(
        searchLocationName,
        eventQuery,
        dateStr,
        searchCategory,
      );
      console.log(
        `[concierge-suggest] event search returned ${eventSearchResults.length} results`,
      );
    }

    // ---- Apply excludeNames to venue data AND event results ----
    // (excludePlaceIds is already handled by searchPlacesBatch, but name-based
    // exclusion is needed for "show more" to remove previously shown results
    // from the data injected into the prompt — otherwise the AI picks them again)
    //
    // Exclude entries can be:
    //   - Simple venue names: "Savaya Beach Club"
    //   - Event+venue pairs: "Day Zero at Savaya" (format: "EventName at VenueName")
    // Same venue + different event = allowed. Same venue + same event = blocked.
    //
    // Parse exclude entries into {event, venue} pairs. If no " at " separator,
    // the whole string is treated as a venue-only entry.
    const excludePairs: Array<{ event: string; venue: string }> = excludeNames.map((n) => {
      const atIdx = n.toLowerCase().lastIndexOf(" at ");
      if (atIdx > 0) {
        return {
          event: normaliseName(n.slice(0, atIdx)),
          venue: normaliseName(n.slice(atIdx + 4)),
        };
      }
      return { event: "", venue: normaliseName(n) };
    });
    const excludeVenueOnly = new Set(
      excludePairs.filter((p) => !p.event).map((p) => p.venue),
    );

    function isExcludedVenue(venueName: string): boolean {
      const norm = normaliseName(venueName);
      if (!norm) return false;
      for (const v of excludeVenueOnly) {
        if (v && (norm.includes(v) || v.includes(norm))) return true;
      }
      return false;
    }

    function isExcludedEvent(eventName: string, venueName: string): boolean {
      const normEvent = normaliseName(eventName);
      const normVenue = normaliseName(venueName);
      if (!normEvent) return false;
      for (const pair of excludePairs) {
        if (pair.event) {
          // Event+venue pair: block only if BOTH match
          const eventMatch = normEvent && pair.event &&
            (normEvent.includes(pair.event) || pair.event.includes(normEvent));
          const venueMatch = normVenue && pair.venue &&
            (normVenue.includes(pair.venue) || pair.venue.includes(normVenue));
          if (eventMatch && venueMatch) return true;
        } else {
          // Venue-only entry: block event only if the event name itself matches
          // (but allow a different event at the same venue)
          if (normEvent && pair.venue &&
            (normEvent.includes(pair.venue) || pair.venue.includes(normEvent))) {
            return true;
          }
        }
      }
      return false;
    }

    if (excludeNames.length > 0) {
      console.log(
        `[concierge-suggest] Excluding: names=${JSON.stringify(excludeNames)}, place_ids=${JSON.stringify(excludePlaceIds)}, parsed_pairs=${JSON.stringify(excludePairs)}`,
      );

      // Filter venue data: remove venues whose name fuzzy-matches a venue-only exclude entry
      // (Venues are never event+venue pairs, so only check venue-only entries)
      venueData = venueData.filter((v) => !isExcludedVenue(v.displayName ?? ""));

      // Filter event results: remove events that match an excluded event+venue pair
      // or whose title matches a venue-only exclude entry
      eventSearchResults = eventSearchResults.filter((e) =>
        !isExcludedEvent(e.name, e.venue ?? ""),
      );
    }

    // Format venue data for prompt injection
    const hasVenueData = venueData.length > 0;
    const hasEventData = eventSearchResults.length > 0;

    const venueListForPrompt = venueData
      .map((v, i) => {
        const parts = [`id="${v.id}"`, `name="${v.displayName}"`];
        if (v.formattedAddress) parts.push(`address="${v.formattedAddress}"`);
        if (v.rating !== null) parts.push(`rating=${v.rating}`);
        if (v.userRatingCount !== null)
          parts.push(`reviews=${v.userRatingCount}`);
        if (v.priceLevel) parts.push(`price=${v.priceLevel}`);
        if (v.types.length)
          parts.push(`types=[${v.types.slice(0, 5).join(",")}]`);
        return `${i + 1}. ${parts.join(" | ")}`;
      })
      .join("\n");

    // Format event search results for prompt injection
    const eventListForPrompt = eventSearchResults
      .map((e, i) => {
        const parts = [`name="${e.name}"`];
        if (e.date) parts.push(`date="${e.date}"`);
        if (e.venue) parts.push(`venue="${e.venue}"`);
        if (e.url) parts.push(`url="${e.url}"`);
        parts.push(`description="${e.description}"`);
        return `${i + 1}. ${parts.join(" | ")}`;
      })
      .join("\n");

    const venueConstraint = hasVenueData
      ? `\nCRITICAL DATA RULES:
- For VENUE suggestions: You MUST ONLY recommend venues from the VENUE DATA list provided below.
- NEVER add or invent venues that are not in the list.
- Every venue recommendation MUST include the exact "id" field from the provided data.
- Your job is to RANK the best options using the RANKING PRINCIPLE and ENRICH them with descriptions, tips, and insights.${hasEventData ? `\n- For EVENT suggestions: Use "type": "event" and do NOT need a place_id. Apply the RANKING PRINCIPLE to decide how many events vs venues to include based on what the user actually asked for.` : ""}`
      : "";

    const venueDataBlock = hasVenueData
      ? `\n\nVENUE DATA:\n${venueListForPrompt}`
      : "";

    const eventDataBlock = hasEventData
      ? `\n\nEVENT DATA (from web search):

CLASSIFICATION RULES — Read carefully:

A venue's regular weekly/nightly programming is NOT a standalone event. Savaya's weekly sunset sessions, La Favela's nightly parties, Potato Head's resident DJ sets — these are regular venue operations. Present these as regular venues (type: "venue") and mention their programming in the description or as a pro_tip.

Only use type "event" for specifically named, date-limited happenings: a festival edition (Day Zero, Epizode), a touring artist's one-off show, a themed party with a specific name and date, or a popup.

A venue CAN appear multiple times IF each appearance is for a genuinely different named event. When this happens, the event name must be the primary title, with the venue as secondary context. Format: "Event Name at Venue Name" — e.g. "Day Zero at Savaya" not "Savaya Bali". The event name is the headline, the venue is the location.

NEVER mark permanent venues (clubs, bars, beach clubs, restaurants, spas) as type "event" — even if they appear in this web search data. If a result below is clearly a permanent venue, use its Google Places data from VENUE DATA instead and treat it as a regular venue suggestion.

Use the RANKING PRINCIPLE to decide how many events to include — specific dated events that directly match the query are Tier 1.

DATE ACCURACY — CRITICAL: For event dates, ONLY use dates explicitly stated in the event data below. NEVER guess or infer event dates from your training data — your training data dates are likely wrong or outdated. If an event listing below does not include a specific date, write "check listing for dates" in event_details instead of making one up.
${eventListForPrompt}`
      : "";

    // JSON response schema — includes "id" when venue data is available
    const eventSchemaNote = hasEventData
      ? `
    // --- OR for events from EVENT DATA (no place_id needed) ---
    {
      "type": "event",
      "name": "Event Name from EVENT DATA",
      "category": "events",
      "why": "One sentence why this fits their request",
      "best_time": "10pm-3am",
      "estimated_cost_per_person": 200000,
      "currency": "IDR",
      "is_event": true,
      "event_details": "Specific event info: performers, time, cover charge",
      "booking_url": "URL from EVENT DATA if available, null otherwise",
      "pro_tip": "Insider hack or tip (null if none)",
      "what_to_order": null,
      "specific_night": null,
      "opening_hours": null,
      "full_description": "2-3 sentence detailed description of the event"
    }`
      : "";

    const responseSchema = hasVenueData
      ? `{
  "summary": "Brief one-liner response to their query",
  "suggestions": [
    {
      "id": "EXACT place ID from VENUE DATA — copy verbatim, e.g. ChIJxxxxxx",
      "category": "food|nightlife|culture|relaxation|activity|wellness|shopping|events",
      "why": "One sentence why this fits their request",
      "best_time": "7pm-11pm",
      "estimated_cost_per_person": 150000,
      "currency": "IDR",
      "is_event": false,
      "event_details": null,
      "pro_tip": "Insider hack or tip (null if none)",
      "what_to_order": "Specific dish or drink (null if not relevant)",
      "specific_night": null,
      "opening_hours": null,
      "full_description": "2-3 sentence detailed description"
    }${eventSchemaNote}
  ]
}

Rules for the response:
- For VENUE suggestions: The "id" field MUST be copied exactly from the VENUE DATA list. Do not modify or fabricate IDs.
- For EVENT suggestions: Use "type": "event" and include "is_event": true. Events do NOT need an "id" field.
- When is_event is true, event_details MUST describe the event (e.g. "DJ Set by [name], 10pm-3am, IDR 200k cover").
- pro_tip should be a genuine insider tip, not generic advice. Think: "Ask for the secret menu" or "Sit upstairs for the view".
- what_to_order: specific items, not generic ("The wagyu tartare" not "try their food").`
      : suggestionJsonSchema(context.destination);

    // ---- Build system prompt ----
    let systemPrompt: string;

    if (feelingLucky) {
      // -- Feeling Lucky mode: go wild with unexpected suggestions --
      const categoryHint = structCategory && structCategory !== "surprise"
        ? `The user is interested in ${CATEGORY_DESCRIPTIONS[structCategory] || structCategory}, but wants the UNUSUAL and UNEXPECTED variety.`
        : "The user wants completely unexpected, off-the-beaten-path experiences.";

      systemPrompt = `You are Junto's secret insider concierge for a group of ${groupSize} traveling in ${context.destination}.

${locationNote}
${gpsNote}
${locationEnforcement}
${venueConstraint}
${categoryHint}
${RANKING_PRINCIPLE}

For "Feeling Lucky" mode, apply the ranking principle with a twist — prefer hidden gems and unexpected finds at every tier:
- Tier 1 should be surprising places that directly match the category
- Tier 2-3 should be genuinely unusual, one-of-a-kind experiences
- Think: places only locals know, underground scenes, things that make great stories

Do NOT suggest popular tourist attractions or well-known chains. Every suggestion should make someone say "wait, what? Let's do THAT."

${hotelNote}

Your summary should be playful and confident, like: "Okay, trust me on these..." or "You probably haven't heard of these..." or "These are the ones we don't tell everyone about..."

Each suggestion MUST have a pro_tip with a genuine insider hack.

Respond in this exact JSON format:
${responseSchema}

Return ONLY valid JSON, no other text.${venueDataBlock}${eventDataBlock}`;
    } else if (isStructured) {
      // -- Structured request: skip interpretation, use filters directly --
      const categoryDesc =
        CATEGORY_DESCRIPTIONS[structCategory!] || structCategory;
      const vibeNote = vibeArr.length ? `- Preferred vibes (match ANY): ${vibeArr.join(", ")}` : "";

      systemPrompt = `You are Junto's concierge for a group of ${groupSize} traveling in ${context.destination}.
${locationNote}
${gpsNote}
${locationEnforcement}
${venueConstraint}
${RANKING_PRINCIPLE}

Find the best ${categoryDesc} using these exact filters:
- Timing: ${whenArr.length ? whenArr.join(" or ") : "any time"} (${dateStr}, ${dayOfWeek})
- Budget: ${budgetLevel}
${vibeNote}
- Group vibes: ${vibes}
${hotelNote}

Suggest 3-5 specific, real venues or activities. Consider:
- Time appropriateness for ${timeOfDay} (don't suggest nightclubs for morning, don't suggest breakfast spots for evening)
- Their budget and vibe preferences
- Only suggest real, existing places (not generic descriptions)

Respond in this exact JSON format:
${responseSchema}

Return ONLY valid JSON, no other text.${venueDataBlock}${eventDataBlock}`;
    } else {
      // -- Free-text request: AI interprets intent --
      systemPrompt = `You are Junto's concierge for a group of ${groupSize} traveling in ${context.destination}. Budget level: ${budgetLevel}. Vibes: ${vibes}.
${locationNote}
${gpsNote}
${locationEnforcement}
${venueConstraint}
${RANKING_PRINCIPLE}

The user is asking about activities for ${dateStr} (${timeOfDay}).
${hotelNote}

Suggest 3-5 specific, real venues or activities that match their query. Consider:
- Time of day (don't suggest nightclubs for morning, don't suggest breakfast spots for evening)
- Their budget and vibe preferences
- Only suggest real, existing places (not generic descriptions)

Respond in this exact JSON format:
${responseSchema}

Return ONLY valid JSON, no other text.${venueDataBlock}${eventDataBlock}`;
    }

    // -- Add exclusion list when paginating ("show more") --
    if (excludeNames.length > 0) {
      systemPrompt += `\n\nIMPORTANT — EXCLUSION LIST: The user has already been shown these. Do NOT suggest the same combination again:
${excludeNames.map((n) => `- ${n}`).join("\n")}
Entries like "Event Name at Venue" mean that specific event at that venue was shown — you may suggest the SAME venue for a DIFFERENT event, but not the same event again.
Plain venue names mean the venue itself was shown — do not suggest it again as a venue.
Suggest DIFFERENT venues and events only.`;
    }

    // -- Add event search instructions for time-sensitive requests --
    if (timeSensitive) {
      systemPrompt += eventSearchInstructions(
        context.destination,
        structCategory || inferredCategory,
        dateStr,
        whenLabel,
        dayOfWeek,
        hasEventData,
      );
    }

    // ---- Call Lovable AI Gateway ----
    const userMessage = isStructured
      ? `Find me ${CATEGORY_DESCRIPTIONS[structCategory!] || structCategory}${whenArr.length ? ` for ${whenArr.join(" or ").toLowerCase()}` : ""}${vibeArr.length ? `, ${vibeArr.join(" or ").toLowerCase()} vibe` : ""} in ${context.destination}`
      : query;

    const aiBody = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 2048,
    };

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
        },
        body: JSON.stringify(aiBody),
      },
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error(
        "[concierge-suggest] AI Gateway error:",
        aiRes.status,
        errText,
      );
      if (aiRes.status === 429) {
        return jsonResponse(
          { error: "Rate limit exceeded, please try again shortly." },
          429,
        );
      }
      if (aiRes.status === 402) {
        return jsonResponse(
          { error: "AI credits exhausted. Please add funds in Settings." },
          402,
        );
      }
      throw new Error(`AI Gateway error ${aiRes.status}: ${errText}`);
    }

    const aiData = await aiRes.json();
    const textContent = aiData.choices?.[0]?.message?.content || "";

    // Log the full raw AI text BEFORE any parsing so we can see exact field names
    console.log(`[concierge-suggest] RAW AI text (first 2000 chars): ${textContent.slice(0, 2000)}`);

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [
      null,
      textContent,
    ];
    let parsed: { summary: string; suggestions: Record<string, unknown>[] };
    try {
      parsed = JSON.parse(jsonMatch[1].trim());
    } catch {
      // Try to find raw JSON object
      const rawJson = textContent.match(/\{[\s\S]*\}/);
      if (rawJson) {
        parsed = JSON.parse(rawJson[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      throw new Error("AI response missing suggestions array");
    }

    // ---- LOG RAW AI RESPONSE BEFORE VALIDATION ----
    console.log(
      `[concierge-suggest] RAW AI response (${parsed.suggestions.length} suggestions):`,
    );
    for (const s of parsed.suggestions) {
      const keys = Object.keys(s).join(",");
      console.log(
        `  → keys=[${keys}] name="${s.name}" type=${s.type ?? "unset"} is_event=${s.is_event ?? "unset"} id=${s.id ?? "NONE"}`,
      );
    }

    // ---- Validate & enrich suggestions ----
    let enriched: Record<string, unknown>[];

    console.log(`[concierge-suggest] hasVenueData=${hasVenueData} (${venueData.length} venues), hasEventData=${hasEventData}`);
    console.log(`[concierge-suggest] AI suggestions IDs: ${parsed.suggestions.map((s: Record<string, unknown>) => `"${s.id ?? 'NONE'}"`).join(", ")}`);
    console.log(`[concierge-suggest] Venue IDs available: ${venueData.map(v => `"${v.id}"`).join(", ")}`);

    if (hasVenueData) {
      // Places-first pipeline: validate AI picks against real venue data
      const validated = validateAIResponse(
        parsed.suggestions,
        venueData,
        searchLat!,
        searchLng!,
        excludePlaceIds,
      );
      console.log(`[concierge-suggest] After validation: ${validated.length} of ${parsed.suggestions.length} passed`);

      // Build place_id → displayName lookup for fallback name resolution
      const venueNameById = new Map<string, string>();
      for (const vd of venueData) {
        if (vd.id && vd.displayName) venueNameById.set(vd.id, vd.displayName);
      }

      // Map validated results to frontend-compatible shape
      enriched = validated.map((v) => {
        const photos = (v.photos as Array<{ name: string }>) || [];
        let photo_url: string | null = null;
        if (googleKey && photos.length > 0 && photos[0]?.name) {
          photo_url = `https://places.googleapis.com/v1/${photos[0].name}/media?maxWidthPx=800&key=${googleKey}`;
        }

        let distance_km: number | null = null;
        if (
          context.hotel_location &&
          typeof v.lat === "number" &&
          typeof v.lng === "number"
        ) {
          distance_km =
            Math.round(
              haversineKm(
                context.hotel_location.lat,
                context.hotel_location.lng,
                v.lat,
                v.lng,
              ) * 10,
            ) / 10;
        }

        // Name resolution: validated name → Google Places lookup by ID → empty string
        const placeId = v.id as string | undefined;
        const rawName = v.name as string | null | undefined;
        const venueName = rawName || (placeId ? venueNameById.get(placeId) : undefined) || "";
        if (!rawName && placeId) {
          console.warn(
            `[concierge-suggest] Venue id=${placeId} had falsy name (${String(rawName)}), resolved to "${venueName}" via Places lookup`,
          );
        }
        const mapsUrl = venueName
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueName + " " + searchLocationName)}`
          : (v.googleMapsUri as string) ?? null;

        const isEventItem = v.type === "event" || v.is_event === true;

        return {
          name: venueName,
          category: (v.category as string) || "",
          why: v.why ?? null,
          best_time: v.best_time ?? null,
          estimated_cost_per_person: v.estimated_cost_per_person ?? null,
          currency: v.currency ?? null,
          is_event: v.is_event ?? false,
          event_details: v.event_details ?? null,
          booking_url: v.booking_url ?? null,
          pro_tip: v.pro_tip ?? null,
          what_to_order: v.what_to_order ?? null,
          specific_night: v.specific_night ?? null,
          opening_hours: v.opening_hours ?? null,
          full_description: v.description ?? null,
          photo_url,
          rating: v.rating as number | null,
          totalRatings: v.userRatingCount as number | null,
          googleMapsUrl: mapsUrl,
          address: (v.address as string) ?? null,
          lat: (v.lat as number) ?? null,
          lng: (v.lng as number) ?? null,
          priceLevel: (v.priceLevel as string) ?? null,
          place_id: isEventItem ? null : ((v.id as string) || null),
          not_verified: isEventItem ? (v.unverified_location as boolean ?? true) : false,
          distance_km,
          type: isEventItem ? "event" : "venue",
        };
      });
    } else {
      // No verified venue data from Google Places. For venues, return empty
      // rather than unvalidated AI suggestions that could contain wrong-location
      // hallucinations. But event-type suggestions (sourced from web search data
      // injected into the prompt) are still allowed through.
      if (hasEventData) {
        enriched = parsed.suggestions
          .filter((s) => s.type === "event" || s.is_event === true)
          .map((s) => {
            const aiName = (s.name as string) || "";
            const mapsUrl = aiName
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(aiName + " " + searchLocationName)}`
              : null;

            return {
              name: aiName,
              category: (s.category as string) || "events",
              why: s.why ?? null,
              best_time: s.best_time ?? null,
              estimated_cost_per_person: s.estimated_cost_per_person ?? null,
              currency: s.currency ?? null,
              is_event: true,
              event_details: s.event_details ?? null,
              booking_url: s.booking_url ?? null,
              pro_tip: s.pro_tip ?? null,
              what_to_order: s.what_to_order ?? null,
              specific_night: s.specific_night ?? null,
              opening_hours: s.opening_hours ?? null,
              full_description: s.full_description ?? null,
              photo_url: null,
              rating: null,
              totalRatings: null,
              googleMapsUrl: mapsUrl,
              address: null,
              lat: null,
              lng: null,
              priceLevel: null,
              place_id: null,
              not_verified: true,
              distance_km: null,
              type: "event" as const,
            };
          });
      } else {
        enriched = [];
      }
      if (enriched.length === 0 && !parsed.summary) {
        parsed.summary = `I couldn't find verified venues in ${searchLocationName}. Try a different search or check your location.`;
      }
    }

    // ---- Save assistant message ----
    const { error: insertAssistantErr } = await supabase
      .from("concierge_messages")
      .insert({
        trip_id,
        user_id: null,
        role: "assistant",
        content: parsed.summary,
        suggestions: enriched,
      });
    if (insertAssistantErr) {
      console.error(
        "[concierge-suggest] insert assistant msg:",
        insertAssistantErr,
      );
    }

    console.log(`[concierge-suggest] === RETURNING ${enriched.length} suggestions, summary="${(parsed.summary ?? "").slice(0, 80)}" ===`);
    return jsonResponse({
      summary: parsed.summary,
      suggestions: enriched,
      cached: false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[concierge-suggest] === ERROR ===", err);
    return jsonResponse({ error: message }, 500);
  }
});

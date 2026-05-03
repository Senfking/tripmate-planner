// =============================================================================
// curate-template-highlights — admin-only, one-shot backfill that fills the
// trip_templates.curated_highlights jsonb column.
//
// For each template that doesn't already have highlights (or every template
// when { force: true } is passed), the function:
//   1. Hits Google Places Text Search twice — once for "top attractions in
//      <destination>", once for "best restaurants in <destination>" — using
//      the Pro field mask to get rating, userRatingCount, photos, and
//      editorialSummary in a single round-trip.
//   2. Filters out anything with no usable photo, < 4.0 rating, or < 200
//      reviews (the long tail is dominated by spam-rated chains).
//   3. Ranks the survivors by rating × log10(reviewCount + 10), then
//      picks ~5 attractions + ~2-3 standout restaurants.
//   4. Sends Place Details (types, editorialSummary, displayName) to Claude
//      Haiku with a tightly-scoped prompt that returns ONLY a 10-14 word
//      description. Names and place_ids never go through the LLM.
//   5. Validates the LLM output: name in the final row must equal the Google
//      Places displayName exactly (we set it server-side regardless of what
//      the model says, and reject if length-after-trim is 0).
//   6. Writes the resulting array into trip_templates.curated_highlights.
//
// Idempotent: by default skips templates whose curated_highlights IS NOT NULL.
// Pass { force: true } in the body to re-curate (overwrites in place).
// Pass { slugs: ["bangkok-7d", ...] } to limit scope.
//
// Auth: Bearer JWT must belong to ADMIN_USER_ID (same gate as admin-query).
// Service-role client is used for the writes — public-read RLS on
// trip_templates would block updates from the caller's JWT.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   - GOOGLE_PLACES_API_KEY (already configured for other functions)
//   - ANTHROPIC_API_KEY     (already configured)
//   - ADMIN_USER_ID         (already configured)
//   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto)
// =============================================================================

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { "Content-Type": "application/json", ...CORS_HEADERS };

const ANTHROPIC_VERSION = "2023-06-01";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// Filter thresholds. Below these, ranking gets noisy (rating-bombed venues,
// brand-new entries with two reviews, photo-less long tail).
const MIN_RATING = 4.0;
const MIN_REVIEWS = 200;
const TARGET_HIGHLIGHTS = 8;          // 4-up grid: 2 rows of 4
const TARGET_ATTRACTIONS = 5;
const TARGET_RESTAURANTS = TARGET_HIGHLIGHTS - TARGET_ATTRACTIONS; // 3

type TemplateRow = {
  slug: string;
  destination: string;
  country: string;
  curated_highlights: unknown | null;
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  photos?: Array<{ name?: string }>;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  types?: string[];
  editorialSummary?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
};

type Highlight = {
  name: string;
  area: string;
  description: string;
  place_id: string;
  photo_url: string;
};

type PerTemplateLog = {
  slug: string;
  destination: string;
  status: "skipped_existing" | "written" | "failed";
  candidates_fetched: number;
  filtered_out: number;
  written: number;
  error?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

// Score function: rating × log10(reviews + 10). Multiplying by log of review
// count rewards both high-rated AND well-loved places, while damping the
// noise from a 4.9-rating cafe with 12 reviews.
function score(p: GooglePlace): number {
  const r = typeof p.rating === "number" ? p.rating : 0;
  const n = typeof p.userRatingCount === "number" ? p.userRatingCount : 0;
  return r * Math.log10(n + 10);
}

// Pull the neighborhood/area from a formatted address. Google's
// formattedAddress for "Wat Pho" looks like
// "2 Sanam Chai Rd, Phra Borom Maha Ratchawang, Phra Nakhon, Bangkok 10200, Thailand".
// Heuristic: take the second-to-last meaningful segment (the district),
// fall back to shortFormattedAddress, fall back to "".
function extractArea(p: GooglePlace, destination: string): string {
  const candidate = p.formattedAddress ?? p.shortFormattedAddress ?? "";
  if (!candidate) return "";
  const segments = candidate.split(",").map((s) => s.trim()).filter(Boolean);
  // drop the country (last) and postal code segment (second-last), pick the
  // segment immediately before them — that's typically the district.
  if (segments.length >= 3) {
    const district = segments[segments.length - 3];
    // skip if it just repeats the destination name
    if (district && district.toLowerCase() !== destination.toLowerCase()) {
      return district;
    }
  }
  return segments[0] ?? "";
}

const HIGHLIGHTS_BUCKET = "template-highlights";

// Place ids are mostly base64ish ("ChIJ..."), but Google occasionally returns
// values with characters that aren't safe in storage paths. Belt-and-braces
// strip — the path doesn't need to be reversible, just deterministic.
function safePathSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 128);
}

// Mirror a Google Places photo into our public Storage bucket and return
// the resulting public URL. Idempotent on re-run: same path + upsert means
// the second invocation overwrites the same object instead of creating
// duplicates. The Places media endpoint redirects to a CDN; we follow that
// to get the actual JPEG bytes (Deno fetch follows redirects by default).
async function mirrorPhotoToStorage(
  db: SupabaseClient,
  apiKey: string,
  slug: string,
  placeId: string,
  photoName: string,
): Promise<string> {
  const sourceUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${apiKey}`;
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Places photo fetch failed (${res.status}) for ${photoName.slice(0, 60)}`);
  }
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error(`Places photo body empty for ${photoName.slice(0, 60)}`);
  }

  const path = `${safePathSegment(slug)}/${safePathSegment(placeId)}.jpg`;
  const { error: upErr } = await db.storage
    .from(HIGHLIGHTS_BUCKET)
    .upload(path, bytes, { upsert: true, contentType });
  if (upErr) {
    throw new Error(`Storage upload failed for ${path}: ${upErr.message}`);
  }
  const { data } = db.storage.from(HIGHLIGHTS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error(`getPublicUrl returned empty for ${path}`);
  }
  return data.publicUrl;
}

async function placesTextSearch(
  apiKey: string,
  textQuery: string,
): Promise<GooglePlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Pro field mask: enough to score, format, and describe in a single call.
      // Skipping reviews/priceLevel/location to keep the per-call cost down —
      // the backfill doesn't need them.
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.rating",
        "places.userRatingCount",
        "places.photos",
        "places.formattedAddress",
        "places.shortFormattedAddress",
        "places.types",
        "places.editorialSummary",
        "places.primaryTypeDisplayName",
      ].join(","),
    },
    body: JSON.stringify({ textQuery, pageSize: 20 }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Places text search failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json() as { places?: GooglePlace[] };
  return data.places ?? [];
}

// Single Anthropic call that turns Place Details into a punchy ~10-14 word
// description. Returns ONLY the description text — we rebuild the highlight
// object server-side so the LLM cannot rename or relocate the place.
async function describeHighlight(
  anthropicKey: string,
  destination: string,
  place: GooglePlace,
): Promise<string> {
  const name = place.displayName?.text ?? "";
  const summary = place.editorialSummary?.text ?? "";
  const primaryType = place.primaryTypeDisplayName?.text ?? "";
  const types = (place.types ?? []).slice(0, 6).join(", ");

  const systemPrompt =
    "You write short, evocative, sensory traveler-facing descriptions of real places. " +
    "Output a SINGLE sentence, 10-14 words, no period at the end, no place name, no city name, " +
    "no superlatives like 'must-see' or 'world-famous'. Focus on a concrete sensory detail or " +
    "experience the visitor will actually have. If you don't have enough material, write a plain " +
    "factual descriptor of the type of place — never invent specifics.";

  const userPrompt =
    `Destination: ${destination}\n` +
    `Place name (do NOT repeat in output): ${name}\n` +
    `Primary type: ${primaryType}\n` +
    `Google types: ${types}\n` +
    `Editorial summary (may be empty): ${summary}\n\n` +
    `Write the description now. Output only the sentence.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 80,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic call failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();

  // Clip to one line, strip stray quotes, drop trailing period.
  const oneLine = text.split("\n")[0]!.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\.$/, "");
  return oneLine;
}

// Filter + rank a raw Places result list into a candidate pool. Returns
// { candidates, filteredOut } so the caller can log the funnel.
function filterAndRank(places: GooglePlace[]): {
  candidates: GooglePlace[];
  filteredOut: number;
} {
  let filtered = 0;
  const survivors: GooglePlace[] = [];
  const seen = new Set<string>();
  for (const p of places) {
    if (!p.id || !p.displayName?.text) {
      filtered++;
      continue;
    }
    if (seen.has(p.id)) {
      filtered++;
      continue;
    }
    const r = p.rating ?? 0;
    const n = p.userRatingCount ?? 0;
    const hasPhoto = Array.isArray(p.photos) && p.photos.length > 0 && !!p.photos[0]?.name;
    if (r < MIN_RATING || n < MIN_REVIEWS || !hasPhoto) {
      filtered++;
      continue;
    }
    seen.add(p.id);
    survivors.push(p);
  }
  survivors.sort((a, b) => score(b) - score(a));
  return { candidates: survivors, filteredOut: filtered };
}

async function curateOneTemplate(
  db: SupabaseClient,
  template: TemplateRow,
  apiKey: string,
  anthropicKey: string,
  force: boolean,
): Promise<PerTemplateLog> {
  const log: PerTemplateLog = {
    slug: template.slug,
    destination: template.destination,
    status: "failed",
    candidates_fetched: 0,
    filtered_out: 0,
    written: 0,
  };

  if (!force && Array.isArray(template.curated_highlights) && template.curated_highlights.length > 0) {
    log.status = "skipped_existing";
    return log;
  }

  try {
    const dest = `${template.destination}, ${template.country}`;
    const [attractionRaw, restaurantRaw] = await Promise.all([
      placesTextSearch(apiKey, `top attractions in ${dest}`),
      placesTextSearch(apiKey, `best restaurants in ${dest}`),
    ]);
    log.candidates_fetched = attractionRaw.length + restaurantRaw.length;

    const attractions = filterAndRank(attractionRaw);
    const restaurants = filterAndRank(restaurantRaw);
    log.filtered_out = attractions.filteredOut + restaurants.filteredOut;

    const pickedAttractions = attractions.candidates.slice(0, TARGET_ATTRACTIONS);
    const pickedRestaurants = restaurants.candidates.slice(0, TARGET_RESTAURANTS);

    // De-dup by place_id across the two pools (a famous market may show up
    // in both queries) before generating descriptions.
    const merged: GooglePlace[] = [];
    const mergedIds = new Set<string>();
    for (const p of [...pickedAttractions, ...pickedRestaurants]) {
      if (!p.id || mergedIds.has(p.id)) continue;
      mergedIds.add(p.id);
      merged.push(p);
    }

    if (merged.length === 0) {
      log.error = "No candidates passed filter (zero photo+rating+review survivors).";
      return log;
    }

    // Sequential to keep concurrent Anthropic calls bounded — these are short
    // prompts but a 7-template backfill at parallel-7 is still fine. The
    // bottleneck is Google's per-template Places quota, not Claude.
    const highlights: Highlight[] = [];
    for (const place of merged) {
      const placeName = place.displayName?.text?.trim() ?? "";
      const placeId = place.id ?? "";
      const photoName = place.photos?.[0]?.name ?? "";
      if (!placeName || !placeId || !photoName) continue;

      let description = "";
      try {
        description = await describeHighlight(anthropicKey, template.destination, place);
      } catch (e) {
        console.warn(`[curate-template-highlights] description failed for ${placeName}:`, (e as Error).message);
        // Fall back to a plain primary-type label so we still get a usable
        // entry — the alternative is dropping a perfectly good Places result
        // because Claude flaked.
        description = place.primaryTypeDisplayName?.text ?? place.editorialSummary?.text ?? "Local favorite";
      }
      if (!description) continue;

      // Mirror the Places photo to our own bucket. We never persist the raw
      // Google media URL because (a) it embeds GOOGLE_PLACES_API_KEY and
      // would leak it to every visitor of /templates/{slug}, and (b) the
      // photo `name` rotates over time so the URL would silently 404.
      let photoUrl: string;
      try {
        photoUrl = await mirrorPhotoToStorage(db, apiKey, template.slug, placeId, photoName);
      } catch (e) {
        console.warn(`[curate-template-highlights] photo mirror failed for ${placeName}:`, (e as Error).message);
        // Skip this entry entirely — a highlight without a photo is what
        // the upstream filter is already rejecting, and we don't want to
        // fall back to the leaky Places URL.
        continue;
      }

      const highlight: Highlight = {
        name: placeName,
        area: extractArea(place, template.destination),
        description,
        place_id: placeId,
        photo_url: photoUrl,
      };

      // Defense-in-depth assertion: the row's `name` and `place_id` must
      // exactly match the Google Places result, and the description must NOT
      // contain the place name (we instructed the LLM to omit it). If a
      // future change accidentally routes the name through the LLM, or the
      // model leaks the name into the blurb, this catches it.
      if (highlight.name !== placeName) {
        throw new Error(`name drift for place_id=${placeId}: "${highlight.name}" vs "${placeName}"`);
      }
      if (highlight.place_id !== placeId) {
        throw new Error(`place_id drift on ${placeName}`);
      }
      const blurbLower = highlight.description.toLowerCase();
      if (placeName.length >= 4 && blurbLower.includes(placeName.toLowerCase())) {
        // Trim the leaked name segment rather than dropping the whole entry.
        highlight.description = highlight.description
          .replace(new RegExp(placeName, "gi"), "")
          .replace(/\s+/g, " ")
          .trim();
      }

      highlights.push(highlight);
    }

    if (highlights.length === 0) {
      log.error = "All candidates failed description / validation step.";
      return log;
    }

    const { error: writeErr } = await db
      .from("trip_templates")
      .update({ curated_highlights: highlights })
      .eq("slug", template.slug);
    if (writeErr) {
      log.error = `DB write failed: ${writeErr.message}`;
      return log;
    }

    log.status = "written";
    log.written = highlights.length;
    return log;
  } catch (e) {
    log.error = (e as Error).message ?? String(e);
    return log;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return err("Unauthorized", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminUserId = Deno.env.get("ADMIN_USER_ID");
  const placesKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey || !adminUserId) {
    return err("Server is missing Supabase secrets", 500);
  }
  if (!placesKey) return err("GOOGLE_PLACES_API_KEY not set", 500);
  if (!anthropicKey) return err("ANTHROPIC_API_KEY not set", 500);

  // Verify caller is admin (same gate as admin-query). We never trust the
  // JWT claims without the auth.getUser round-trip — that's what validates
  // the signature against Supabase's JWKS.
  const token = authHeader.slice("Bearer ".length).trim();
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !userData?.user) return err("Invalid token", 401);
  if (userData.user.id !== adminUserId) {
    console.error("[curate-template-highlights] non-admin caller:", userData.user.id);
    return err("Forbidden", 403);
  }

  let body: { force?: boolean; slugs?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — defaults to "all templates, skip existing".
  }
  const force = !!body.force;
  const restrictSlugs = Array.isArray(body.slugs) && body.slugs.length > 0 ? body.slugs : null;

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Pull the templates we'll consider. Idempotency filter is in JS so the
  // per-template log can record "skipped_existing" rather than silently
  // hiding them.
  let q = db.from("trip_templates").select("slug,destination,country,curated_highlights");
  if (restrictSlugs) q = q.in("slug", restrictSlugs);
  const { data: templates, error: fetchErr } = await q;
  if (fetchErr) return err(`Could not load templates: ${fetchErr.message}`, 500);

  const logs: PerTemplateLog[] = [];
  for (const t of (templates ?? []) as TemplateRow[]) {
    const result = await curateOneTemplate(db, t, placesKey, anthropicKey, force);
    console.log(
      `[curate-template-highlights] slug=${result.slug} status=${result.status} ` +
      `fetched=${result.candidates_fetched} filtered=${result.filtered_out} written=${result.written}` +
      (result.error ? ` error="${result.error}"` : ""),
    );
    logs.push(result);
  }

  const summary = {
    total: logs.length,
    written: logs.filter((l) => l.status === "written").length,
    skipped: logs.filter((l) => l.status === "skipped_existing").length,
    failed: logs.filter((l) => l.status === "failed").length,
    failures: logs.filter((l) => l.status === "failed").map((l) => ({
      slug: l.slug,
      destination: l.destination,
      error: l.error,
    })),
  };

  return json({ summary, logs });
});

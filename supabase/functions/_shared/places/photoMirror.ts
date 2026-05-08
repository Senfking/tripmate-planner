// Shared helper that mirrors Google Place photos into the public
// `place-photos` Supabase Storage bucket and returns the resulting public
// URL. Used by generate-trip-itinerary, get-place-details, and
// concierge-suggest so none of those functions leak GOOGLE_PLACES_API_KEY
// to the client.
//
// Observability: every failure path (missing photo name, Google fetch !ok,
// empty body, fetch threw, storage upload error, getPublicUrl miss) is
// counted into a per-batch MirrorStats record returned alongside the
// place→urls map. Call sites log the counts so a "photos:[] for every
// activity" regression surfaces an exact root cause in Edge Function logs
// (Google quota? missing bucket? Storage RLS? key rotated?) instead of
// silently producing empty arrays.
//
// Why mirror at all (instead of redirecting through an edge function):
// Google's photo-media SKU is billed per fetch ($0.007/load). At any
// non-trivial DAU the per-render cost dominates, so we pay Google once per
// (place_id, photo) and serve from Storage on every subsequent view.
// Storage egress is included in the plan; over-quota is ~$0.09/GB which is
// orders of magnitude cheaper than re-billing Google on each render.
//
// Storage layout: place-photos/{placeIdHash}/{photoNameHash}.jpg
//   - placeIdHash:   sha256(placeId).slice(0, 32) — place ids occasionally
//                    contain characters unsafe in storage paths and the
//                    hash also keeps raw place_ids out of object listings.
//   - photoNameHash: sha256(photoName).slice(0, 32) — photoName is itself
//                    a slash-delimited Google id ("places/X/photos/Y"); a
//                    hash flattens it to a single segment.
// Path is deterministic, so upsert + same inputs = same object (idempotent
// on retries / regenerations of the same trip).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PLACE_PHOTOS_BUCKET = "place-photos";

// Default photo width for grid heroes. Matches what the previous
// buildPhotoUrls / get-place-details code requested. Bump per-call if a
// caller wants higher resolution (the destination cover, for example,
// uses 1600).
const DEFAULT_MAX_WIDTH_PX = 800;

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildStoragePath(placeIdHash: string, photoNameHash: string): string {
  return `${placeIdHash}/${photoNameHash}.jpg`;
}

export interface MirrorOptions {
  maxWidthPx?: number;
}

// Per-batch failure tally. Returned to the caller alongside the place→urls
// map so an "all photos empty" regression logs the exact reason. Counters
// are mutated in place by mirrorPlacePhoto on each invocation.
export interface MirrorStats {
  attempted: number;        // photo-level fetches kicked off
  succeeded: number;        // ended in a public URL written to Storage
  no_photo_name: number;    // Google response missing photo.name (rare)
  google_fetch_not_ok: number;
  google_fetch_threw: number;
  empty_body: number;
  storage_upload_failed: number;
  no_public_url: number;
  // Captures a representative error string per category. Useful when every
  // photo fails the same way ("Bucket not found" / "401 invalid api key").
  // Truncated to keep log lines bounded.
  first_google_err: string | null;
  first_storage_err: string | null;
}

function newMirrorStats(): MirrorStats {
  return {
    attempted: 0,
    succeeded: 0,
    no_photo_name: 0,
    google_fetch_not_ok: 0,
    google_fetch_threw: 0,
    empty_body: 0,
    storage_upload_failed: 0,
    no_public_url: 0,
    first_google_err: null,
    first_storage_err: null,
  };
}

function captureErr(slot: string | null, msg: string): string {
  return slot ?? msg.slice(0, 200);
}

/**
 * Mirror a single Google Place photo to Storage. Returns the public URL of
 * the mirrored object on success, or null on any failure (caller decides
 * whether to drop the photo or fall back). Never throws — failure to mirror
 * one photo must not block the surrounding flow (trip generation, place
 * details lookup, concierge suggestion).
 *
 * Idempotent: same (placeId, photoName) hashes to the same path, and we
 * upload with upsert: true so a second invocation replaces in place. That
 * also means a successful mirror doesn't need a "does this object already
 * exist" check — the upload is cheap, and re-mirroring is the natural
 * refresh path when Google rotates a photo name.
 *
 * Optional `stats` is mutated to record the failure category (or success)
 * for batch-level diagnostics. Pass null to disable counting (kept so
 * single-photo callers like get-place-details don't have to allocate).
 */
export async function mirrorPlacePhoto(
  db: SupabaseClient,
  apiKey: string,
  placeId: string,
  photoName: string,
  opts: MirrorOptions = {},
  stats: MirrorStats | null = null,
): Promise<string | null> {
  if (!placeId || !photoName) {
    if (stats) stats.no_photo_name++;
    return null;
  }
  if (stats) stats.attempted++;
  const maxWidthPx = opts.maxWidthPx ?? DEFAULT_MAX_WIDTH_PX;

  try {
    const sourceUrl =
      `https://places.googleapis.com/v1/${photoName}/media` +
      `?maxWidthPx=${maxWidthPx}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(sourceUrl, { redirect: "follow" });
    if (!res.ok) {
      // Capture a body excerpt — Places returns JSON like
      // {error:{code:403,message:"PERMISSION_DENIED",...}} which tells us
      // exactly whether it's quota, billing, or wrong scope on the API key.
      let bodyExcerpt = "";
      try {
        bodyExcerpt = (await res.text()).slice(0, 200);
      } catch { /* swallow */ }
      const msg = `status=${res.status} body=${bodyExcerpt}`;
      console.warn(
        `[photoMirror] Google fetch failed ${msg} ` +
          `place=${placeId.slice(0, 24)} photo=${photoName.slice(0, 60)}`,
      );
      if (stats) {
        stats.google_fetch_not_ok++;
        stats.first_google_err = captureErr(stats.first_google_err, msg);
      }
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) {
      console.warn(
        `[photoMirror] empty body place=${placeId.slice(0, 24)} ` +
          `photo=${photoName.slice(0, 60)}`,
      );
      if (stats) stats.empty_body++;
      return null;
    }

    const [placeIdHash, photoNameHash] = await Promise.all([
      sha256Hex(placeId).then((h) => h.slice(0, 32)),
      sha256Hex(photoName).then((h) => h.slice(0, 32)),
    ]);
    const path = buildStoragePath(placeIdHash, photoNameHash);

    const { error: upErr } = await db.storage
      .from(PLACE_PHOTOS_BUCKET)
      .upload(path, bytes, { upsert: true, contentType });
    if (upErr) {
      console.warn(
        `[photoMirror] storage upload failed path=${path}: ${upErr.message}`,
      );
      if (stats) {
        stats.storage_upload_failed++;
        stats.first_storage_err = captureErr(stats.first_storage_err, upErr.message);
      }
      return null;
    }
    const { data } = db.storage.from(PLACE_PHOTOS_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      console.warn(`[photoMirror] getPublicUrl returned empty for ${path}`);
      if (stats) stats.no_public_url++;
      return null;
    }
    if (stats) stats.succeeded++;
    return data.publicUrl;
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(
      `[photoMirror] threw place=${placeId.slice(0, 24)} ` +
        `photo=${photoName.slice(0, 60)}: ${msg}`,
    );
    if (stats) {
      stats.google_fetch_threw++;
      stats.first_google_err = captureErr(stats.first_google_err, msg);
    }
    return null;
  }
}

/**
 * Mirror up to `max` photos for a single place in parallel. Returns only
 * the successfully-mirrored Storage URLs, in the same order as input.
 * Failures are dropped silently (already logged inside mirrorPlacePhoto).
 */
export async function mirrorPlacePhotos(
  db: SupabaseClient,
  apiKey: string,
  placeId: string,
  photos: Array<{ name?: string | null }>,
  opts: MirrorOptions & { max?: number } = {},
  stats: MirrorStats | null = null,
): Promise<string[]> {
  if (!placeId || !photos?.length) return [];
  const max = opts.max ?? 1;
  const slice = photos.slice(0, max);
  const results = await Promise.all(
    slice.map((p) =>
      p?.name
        ? mirrorPlacePhoto(db, apiKey, placeId, p.name, opts, stats)
        : Promise.resolve(null),
    ),
  );
  return results.filter((u): u is string => typeof u === "string" && u.length > 0);
}

/**
 * Mirror photos for a batch of places concurrently. Returns
 * Map<placeId, string[]> of mirrored Storage URLs. Used by
 * generate-trip-itinerary after hydrateFinalists so all candidate places
 * have their hero photo ready before the ranker emits activities.
 *
 * Concurrency is unbounded by Promise.all — in practice the batch size is
 * ~15-30 places, well within Deno's fetch ceiling. If we ever scale past
 * that, gate via a small p-limit.
 */
export interface MirrorBatchResult {
  urlsByPlaceId: Map<string, string[]>;
  // How many input places had any candidate photo at all. If this is 0
  // the upstream Place Details fetch isn't returning photos — usually a
  // field-mask, cache-staleness, or quota issue.
  places_with_input_photos: number;
  // Same as urlsByPlaceId.size — convenience.
  places_with_output_photos: number;
  stats: MirrorStats;
}

export async function mirrorPhotosForPlaces(
  db: SupabaseClient,
  apiKey: string,
  places: Array<{ id?: string | null; photos?: Array<{ name?: string | null }> | null }>,
  opts: MirrorOptions & { max?: number } = {},
): Promise<MirrorBatchResult> {
  const out = new Map<string, string[]>();
  const stats = newMirrorStats();
  let places_with_input_photos = 0;
  if (!places?.length) {
    return { urlsByPlaceId: out, places_with_input_photos: 0, places_with_output_photos: 0, stats };
  }
  await Promise.all(
    places.map(async (p) => {
      const id = p?.id ?? "";
      const photos = p?.photos ?? [];
      if (!id || !photos.length) return;
      places_with_input_photos++;
      const urls = await mirrorPlacePhotos(db, apiKey, id, photos, opts, stats);
      if (urls.length) out.set(id, urls);
    }),
  );
  return {
    urlsByPlaceId: out,
    places_with_input_photos,
    places_with_output_photos: out.size,
    stats,
  };
}

/**
 * Verify the place-photos bucket is reachable. Returns null on success or
 * a short reason string on failure (logged + surfaces in
 * mirrorPhotosForPlaces summary). Used as a one-shot preflight at trip-gen
 * start so a missing migration / bucket / RLS misconfig surfaces ONCE per
 * generation instead of N times across silent per-photo failures.
 *
 * Implementation note: `storage.listBuckets()` requires service-role; both
 * call sites in trip-itinerary already use a service-role client so this
 * is safe. Falls back to a 1-byte upload probe if listBuckets isn't
 * available — the upload uses upsert and a deterministic probe path so
 * repeated preflights are idempotent.
 */
export async function verifyPlacePhotosBucket(
  db: SupabaseClient,
): Promise<string | null> {
  try {
    const { data, error } = await db.storage.listBuckets();
    if (error) {
      // listBuckets failure usually means the service-role key is wrong
      // (or the storage API is down). Fall through to the probe upload —
      // if that succeeds, the bucket exists and is writable; if not, the
      // probe error tells us why.
    } else if (Array.isArray(data)) {
      const exists = data.some((b) => b?.id === PLACE_PHOTOS_BUCKET || b?.name === PLACE_PHOTOS_BUCKET);
      if (!exists) {
        return `bucket "${PLACE_PHOTOS_BUCKET}" missing from storage.listBuckets() — migration 20260506120000_place_photos_storage_bucket.sql likely not applied to this project`;
      }
      return null;
    }
    // Probe upload as a fallback — confirms WRITE access too, not just SELECT.
    const probeBytes = new Uint8Array([0]);
    const { error: upErr } = await db.storage
      .from(PLACE_PHOTOS_BUCKET)
      .upload("__preflight/probe.bin", probeBytes, { upsert: true, contentType: "application/octet-stream" });
    if (upErr) {
      return `bucket probe upload failed: ${upErr.message}`;
    }
    return null;
  } catch (err) {
    return `bucket preflight threw: ${(err as Error).message}`;
  }
}

// Shared helper that mirrors Google Place photos into the public
// `place-photos` Supabase Storage bucket and returns the resulting public
// URL. Used by generate-trip-itinerary, get-place-details, and
// concierge-suggest so none of those functions leak GOOGLE_PLACES_API_KEY
// to the client.
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
 */
export async function mirrorPlacePhoto(
  db: SupabaseClient,
  apiKey: string,
  placeId: string,
  photoName: string,
  opts: MirrorOptions = {},
): Promise<string | null> {
  if (!placeId || !photoName) return null;
  const maxWidthPx = opts.maxWidthPx ?? DEFAULT_MAX_WIDTH_PX;

  try {
    const sourceUrl =
      `https://places.googleapis.com/v1/${photoName}/media` +
      `?maxWidthPx=${maxWidthPx}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(sourceUrl, { redirect: "follow" });
    if (!res.ok) {
      console.warn(
        `[photoMirror] Google fetch failed status=${res.status} ` +
          `place=${placeId.slice(0, 24)} photo=${photoName.slice(0, 60)}`,
      );
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) {
      console.warn(
        `[photoMirror] empty body place=${placeId.slice(0, 24)} ` +
          `photo=${photoName.slice(0, 60)}`,
      );
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
      return null;
    }
    const { data } = db.storage.from(PLACE_PHOTOS_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      console.warn(`[photoMirror] getPublicUrl returned empty for ${path}`);
      return null;
    }
    return data.publicUrl;
  } catch (err) {
    console.warn(
      `[photoMirror] threw place=${placeId.slice(0, 24)} ` +
        `photo=${photoName.slice(0, 60)}: ${(err as Error).message}`,
    );
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
): Promise<string[]> {
  if (!placeId || !photos?.length) return [];
  const max = opts.max ?? 1;
  const slice = photos.slice(0, max);
  const results = await Promise.all(
    slice.map((p) =>
      p?.name ? mirrorPlacePhoto(db, apiKey, placeId, p.name, opts) : Promise.resolve(null),
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
export async function mirrorPhotosForPlaces(
  db: SupabaseClient,
  apiKey: string,
  places: Array<{ id?: string | null; photos?: Array<{ name?: string | null }> | null }>,
  opts: MirrorOptions & { max?: number } = {},
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!places?.length) return out;
  await Promise.all(
    places.map(async (p) => {
      const id = p?.id ?? "";
      const photos = p?.photos ?? [];
      if (!id || !photos.length) return;
      const urls = await mirrorPlacePhotos(db, apiKey, id, photos, opts);
      if (urls.length) out.set(id, urls);
    }),
  );
  return out;
}

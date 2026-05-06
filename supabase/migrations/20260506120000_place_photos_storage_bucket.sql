-- =============================================================================
-- Storage bucket: place-photos
--
-- Holds Google Place photos mirrored at trip-generation time and on-demand
-- in get-place-details / concierge-suggest. Previously these functions
-- returned Google Places media URLs with the API key embedded as a query
-- parameter (?key=AIza…) — that key was reachable from devtools and from
-- any persisted itinerary or place_details_cache row, and every <img> render
-- billed Google's photo-media SKU at $0.007/load.
--
-- With this bucket the photo bytes are downloaded once per (place_id, photo)
-- by the edge function (using the API key server-side only), then served
-- from Supabase Storage on every render. Frontend never sees the Google key.
--
-- Path convention: {placeIdHash}/{photoNameHash}.jpg
--   - placeIdHash:   sha256(placeId).slice(0, 32)  (place ids may contain
--                    slashes that break storage paths; hashing also avoids
--                    leaking the raw place_id in logs)
--   - photoNameHash: sha256(photoName).slice(0, 32)
-- Deterministic so a re-mirror upserts the same object instead of creating
-- duplicates. Uses .jpg extension regardless of source content-type — the
-- HTTP Content-Type header (set on upload) is what the browser honors.
--
-- Public read so <img src> works without signed URLs (bucket holds no PII).
-- Writes are authenticated-only — in practice the edge functions write with
-- the service-role key, which bypasses RLS; the policies below exist so the
-- admin user can replace photos manually if needed.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('place-photos', 'place-photos', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Place photos public read'
  ) THEN
    CREATE POLICY "Place photos public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'place-photos');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Place photos authenticated insert'
  ) THEN
    CREATE POLICY "Place photos authenticated insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'place-photos');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Place photos authenticated update'
  ) THEN
    CREATE POLICY "Place photos authenticated update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'place-photos');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Place photos authenticated delete'
  ) THEN
    CREATE POLICY "Place photos authenticated delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'place-photos');
  END IF;
END
$$;

-- =============================================================================
-- One-shot cleanup: drop place_details_cache rows whose response embeds the
-- Google API key in the photo URLs. Those rows were written by the previous
-- get-place-details and would keep returning leaked URLs to clients until
-- they aged past the 30-day TTL. Deleting is preferred over rewriting because
-- the URL without the key is unusable (Google requires the key for media
-- requests), so the only correct fix is to re-cache through the new
-- mirror-to-storage flow on next request.
--
-- The daily cleanup_place_details_cache cron continues to handle natural TTL
-- pruning. This DELETE is idempotent — re-running the migration after the
-- new edge function is deployed is a no-op (no rows match).
-- =============================================================================
DELETE FROM public.place_details_cache
WHERE response::text LIKE '%places.googleapis.com/v1/%/media?%key=%';

-- =============================================================================
-- Storage bucket: template-highlights
--
-- Holds photos for trip_templates.curated_highlights. The previous version
-- of the backfill stored raw Google Places media URLs in the column, which
-- (a) leaked GOOGLE_PLACES_API_KEY into every public template page and
-- (b) drifted as Google rotated photo names. This bucket lets the backfill
-- mirror the photo bytes once and store a stable public URL.
--
-- Path convention: {template_slug}/{place_id}.jpg — deterministic so
-- re-running the backfill upserts the same object instead of accumulating
-- copies.
--
-- Public read so the bucket can back the public /templates/{slug} pages
-- without signed URLs. Writes are authenticated-only — in practice the
-- backfill Edge Function uploads with the service-role key, but we also
-- want to allow the admin user to manually replace a photo from the
-- dashboard if needed.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('template-highlights', 'template-highlights', true)
ON CONFLICT (id) DO NOTHING;

-- Public read — anyone (including anon) can fetch a photo by URL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Template highlights public read'
  ) THEN
    CREATE POLICY "Template highlights public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'template-highlights');
  END IF;
END
$$;

-- Authenticated-only writes. The service-role key bypasses RLS so the
-- Edge Function backfill works regardless; this policy exists for the
-- admin-as-user manual override case.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Template highlights authenticated insert'
  ) THEN
    CREATE POLICY "Template highlights authenticated insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'template-highlights');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Template highlights authenticated update'
  ) THEN
    CREATE POLICY "Template highlights authenticated update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'template-highlights');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Template highlights authenticated delete'
  ) THEN
    CREATE POLICY "Template highlights authenticated delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'template-highlights');
  END IF;
END
$$;

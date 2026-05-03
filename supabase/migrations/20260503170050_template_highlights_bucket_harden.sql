-- =============================================================================
-- Harden template-highlights storage bucket.
--
-- Two changes, both following from the same realization: the previous
-- migration (20260503165422_template_highlights_storage_bucket.sql) was
-- looser than it needed to be.
--
-- 1) Add bucket-level guardrails: a 5 MiB per-object size limit and an
--    image/* MIME allowlist. The backfill mirrors ~800px JPEGs from Google
--    Places, which are well under 1 MiB; 5 MiB leaves headroom for an
--    occasional WebP/PNG without letting a misconfigured upload land a
--    100 MB blob in a public bucket.
--
-- 2) Drop the authenticated-write RLS policies. The backfill Edge Function
--    uploads with the service-role key, which bypasses RLS, so these
--    policies didn't gate the actual writer. What they DID do is allow
--    every signed-in user to write into a public bucket — any account
--    could overwrite Wat Pho's photo with their own image. The public
--    SELECT policy stays in place; that's how the /templates/{slug}
--    pages fetch the JPEGs without signed URLs.
-- =============================================================================

-- Idempotent: re-running this migration just re-asserts the limits.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'template-highlights',
  'template-highlights',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/webp', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop the unnecessary authenticated-write policies. Service role bypasses
-- RLS so the backfill is unaffected; admins manually replacing photos can
-- use the Supabase dashboard (which also runs as service role).
DROP POLICY IF EXISTS "Template highlights authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "Template highlights authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Template highlights authenticated delete" ON storage.objects;

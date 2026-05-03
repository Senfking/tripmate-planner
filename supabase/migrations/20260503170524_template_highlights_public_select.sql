-- =============================================================================
-- Re-assert public SELECT policy on storage.objects for the
-- template-highlights bucket.
--
-- Context: an earlier migration
-- (20260503165422_template_highlights_storage_bucket.sql) created
-- "Template highlights public read" via a DO / IF NOT EXISTS block, but
-- a pg_policies query in production
--   SELECT * FROM pg_policies WHERE qual ILIKE '%template-highlights%'
-- returns zero rows, so the policy is missing on at least one environment
-- and the public photo URLs 403. Setting a bucket to public=true does NOT
-- bypass storage.objects RLS — an explicit SELECT policy is still required.
--
-- Belt-and-braces: DROP IF EXISTS then CREATE. The idempotent IF NOT EXISTS
-- guard from the earlier migration was insufficient (the policy never made
-- it into pg_policies), so this migration unconditionally re-creates the
-- policy. Re-running drops the recreated policy and recreates it — safe.
-- =============================================================================

DROP POLICY IF EXISTS "Template highlights public read" ON storage.objects;

CREATE POLICY "Template highlights public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'template-highlights');

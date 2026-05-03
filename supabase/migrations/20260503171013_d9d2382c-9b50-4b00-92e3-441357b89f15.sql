-- Re-apply the public SELECT policy for the template-highlights bucket.
-- The original migration (20260503170524) didn't land in this environment;
-- bucket exists with hardened limits but no SELECT policy on storage.objects,
-- so mirrored photos 404 from the public web.
DROP POLICY IF EXISTS "Public can read template-highlights" ON storage.objects;

CREATE POLICY "Public can read template-highlights"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'template-highlights');
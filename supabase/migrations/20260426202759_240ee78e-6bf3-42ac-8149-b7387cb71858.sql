CREATE POLICY "trip_attachments_ai_covers_public_read"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (
  bucket_id = 'trip-attachments'
  AND (storage.foldername(name))[1] = 'covers'
  AND (storage.foldername(name))[2] = '_ai'
);
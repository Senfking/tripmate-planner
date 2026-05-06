CREATE POLICY "Trip members can update receipt images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipt-images'
  AND public.is_trip_member(((storage.foldername(name))[1])::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'receipt-images'
  AND public.is_trip_member(((storage.foldername(name))[1])::uuid, auth.uid())
);
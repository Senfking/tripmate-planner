-- Create private bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('trip-attachments', 'trip-attachments', false);

-- SELECT: trip members can download
CREATE POLICY "trip_attachments_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'trip-attachments'
  AND public.is_trip_member(
    (storage.foldername(name))[2]::uuid,
    auth.uid()
  )
);

-- INSERT: trip members can upload
CREATE POLICY "trip_attachments_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'trip-attachments'
  AND public.is_trip_member(
    (storage.foldername(name))[2]::uuid,
    auth.uid()
  )
);

-- UPDATE: trip members can update their own files
CREATE POLICY "trip_attachments_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'trip-attachments'
  AND owner = auth.uid()
  AND public.is_trip_member(
    (storage.foldername(name))[2]::uuid,
    auth.uid()
  )
);

-- DELETE: owners/admins can delete any file; members only their own
CREATE POLICY "trip_attachments_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'trip-attachments'
  AND (
    public.is_trip_admin_or_owner(
      (storage.foldername(name))[2]::uuid,
      auth.uid()
    )
    OR (
      owner = auth.uid()
      AND public.is_trip_member(
        (storage.foldername(name))[2]::uuid,
        auth.uid()
      )
    )
  )
);
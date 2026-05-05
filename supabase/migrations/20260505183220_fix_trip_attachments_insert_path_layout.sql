-- Migration 20260505181538 replaced trip_attachments_insert with a policy that
-- assumed paths were `{tripId}/<...>` and tried `(foldername(name))[1]::uuid`.
-- All real uploaders use a 2-segment prefix (`trips/`, `covers/`, `imports/`),
-- so segment[1] is a literal string and the cast raises
-- `invalid input syntax for type uuid: "covers"` (or `"trips"`) before the
-- OR can short-circuit, blocking cover and attachment uploads.
--
-- Restore the original layout: tripId at segment[2], matching the unchanged
-- SELECT/UPDATE/DELETE policies in 20260329124238.

DROP POLICY IF EXISTS "trip_attachments_insert" ON storage.objects;

CREATE POLICY "trip_attachments_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trip-attachments'
  AND public.is_trip_member(
    (storage.foldername(name))[2]::uuid,
    auth.uid()
  )
);

-- Cover photos in `trip-attachments` are a shared trip resource (path
-- layout: `covers/{tripId}/cover.{ext}`, `upsert: true`), but the
-- `trip_attachments_update` policy required `owner = auth.uid()` —
-- effectively pinning the cover to whoever uploaded it first. Once
-- migration 20260505183220 fixed the [2]::uuid cast and INSERTs were
-- evaluated again, upserts from a second member began surfacing
-- "new row violates row-level security policy" because PG took the
-- ON CONFLICT DO UPDATE branch and the existing row's `owner` no
-- longer matched `auth.uid()`. Verified against live DB: trip
-- c8dc3f2a-... had cover files at multiple extensions owned by
-- different members.
--
-- Path-scoped relaxation: only `covers/*` paths get the loosened
-- "any trip member" rule. `trips/*` and `imports/*` (personal
-- attachments / import scratch files) keep the per-uploader
-- ownership semantics. The DELETE policy's existing admin/owner
-- branch and own-attachment branch are preserved verbatim; the
-- covers-path branch is added as a new OR alternative.

DROP POLICY IF EXISTS "trip_attachments_update" ON storage.objects;
CREATE POLICY "trip_attachments_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'trip-attachments'
  AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] = 'covers'
      AND public.is_trip_member(
        (storage.foldername(name))[2]::uuid,
        auth.uid()
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'trip-attachments'
  AND (
    owner = auth.uid()
    OR (
      (storage.foldername(name))[1] = 'covers'
      AND public.is_trip_member(
        (storage.foldername(name))[2]::uuid,
        auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "trip_attachments_delete" ON storage.objects;
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
    OR (
      (storage.foldername(name))[1] = 'covers'
      AND public.is_trip_member(
        (storage.foldername(name))[2]::uuid,
        auth.uid()
      )
    )
  )
);

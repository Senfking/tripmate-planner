
-- 1) Lock down place_details_cache: cache is server-side only (edge function uses service role).
DROP POLICY IF EXISTS place_details_cache_select ON public.place_details_cache;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.place_details_cache FROM authenticated, anon;
GRANT ALL ON public.place_details_cache TO service_role;

-- 2) Harden trip_attachments storage SELECT: enforce per-row privacy by joining to attachments.
DROP POLICY IF EXISTS trip_attachments_select ON storage.objects;
CREATE POLICY trip_attachments_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'trip-attachments'
  AND public.is_trip_member(((storage.foldername(name))[2])::uuid, auth.uid())
  AND (
    -- Covers folder is shared trip-wide (non-private by design).
    (storage.foldername(name))[1] = 'covers'
    -- Otherwise require a matching attachments row the user is allowed to read.
    OR EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.file_path = storage.objects.name
        AND (NOT a.is_private OR a.created_by = auth.uid())
    )
  )
);

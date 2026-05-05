-- 1. Remove overly broad co-member profile SELECT policy
DROP POLICY IF EXISTS "profiles_select_trip_members" ON public.profiles;

-- 2. Drop broken/redundant import upload storage policy.
-- Path is 'imports/{tripId}/<file>' so foldername[1]='imports' (literal),
-- which made `is_trip_member('imports'::uuid, ...)` always false. The
-- existing `trip_attachments_insert` policy already authorizes these
-- uploads correctly using foldername[2] = tripId.
DROP POLICY IF EXISTS "trip_attachments_imports_insert" ON storage.objects;

-- Replace trip_attachments_insert to also accept the imports/{tripId}/... layout
DROP POLICY IF EXISTS "trip_attachments_insert" ON storage.objects;
CREATE POLICY "trip_attachments_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trip-attachments'
  AND (
    -- Standard layout: {tripId}/<...>
    public.is_trip_member(((storage.foldername(name))[1])::uuid, auth.uid())
    -- Imports layout: imports/{tripId}/<...>
    OR (
      (storage.foldername(name))[1] = 'imports'
      AND public.is_trip_member(((storage.foldername(name))[2])::uuid, auth.uid())
    )
  )
);
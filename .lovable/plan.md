

## Set up private storage bucket with RLS policies

### What will be created

**1. Database migration** with the following SQL:

- **Create bucket**: `trip-attachments` (private, no public access)
- **4 RLS policies on `storage.objects`** using the existing `is_trip_member` and `is_trip_admin_or_owner` helper functions, extracting `trip_id` from the file path (`storage.foldername(name)`)

### Migration SQL

```sql
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
```

**Path convention**: `trips/{trip_id}/{attachment_id}/{filename}` — `storage.foldername(name)[2]` extracts the `trip_id` segment.

### Files changed
- **1 new migration file** (SQL above)
- No application code changes — this is infrastructure only

### What stays the same
- All existing tables, RLS policies, and functions untouched
- No public access, no anonymous access


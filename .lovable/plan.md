

## Fix: Attachments query failing due to missing FK

### Root cause

The query `.select("*, profiles(display_name)")` returns HTTP 400 because there is no foreign key from `attachments.created_by` to `profiles.id`. PostgREST cannot resolve the join. This means the attachments query **always fails** — it's not just a cache invalidation issue.

### Fix (2 changes)

**1. Database migration** — Add a foreign key from `attachments.created_by` to `profiles.id`:

```sql
ALTER TABLE public.attachments
ADD CONSTRAINT attachments_created_by_fkey
FOREIGN KEY (created_by) REFERENCES public.profiles(id);
```

**2. `src/hooks/useAttachments.ts`** — No code changes needed. Once the FK exists, the existing `select("*, profiles(display_name)")` query and `invalidateQueries({ queryKey: key })` will work correctly. The query key and invalidation are already consistent.

### Files changed
- 1 new migration file (FK addition)
- No application code changes


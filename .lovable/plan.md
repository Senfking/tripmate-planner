

## Bookings & Docs — Premium Cards, AI Extraction, Microlink Fallback (Revised)

### Files to change/create

**Edge Functions:**
- `supabase/functions/fetch-link-preview/index.ts` — add Microlink fallback
- `supabase/functions/extract-booking-info/index.ts` — NEW: AI extraction from uploaded files

**Migration:**
- New migration: add `booking_data jsonb` column to `attachments`

**Frontend:**
- `src/hooks/useAttachments.ts` — remove debug logs, update AttachmentRow type (add og_title/og_description/og_image_url/booking_data), fire extract-booking-info after upload, return file metadata from uploadFile
- `src/components/bookings/AttachmentCard.tsx` — premium card redesign with banner, structured booking data, filename cleanup, AlertDialog delete
- `src/components/bookings/BookingsTab.tsx` — pass getSignedUrl to cards

No changes to: storage, RLS, grouping logic, other tabs.

---

### 1. Migration

```sql
ALTER TABLE public.attachments ADD COLUMN booking_data jsonb DEFAULT NULL;
```

### 2. fetch-link-preview — Microlink fallback

After existing direct fetch, if `og_title` is still null, call `https://api.microlink.io/?url=...` and map `data.title`, `data.description`, `data.image?.url`. No API key needed.

### 3. extract-booking-info — NEW edge function

- Input: `{ attachment_id, file_path, file_type }`
- Downloads file from storage, converts to base64, calls Anthropic Claude with structured extraction prompt
- Parses JSON response
- Updates attachment row:
  - `og_title` = extracted title
  - `og_description` = compact summary
  - **`type` = detected booking_type ONLY IF current type is "other"** — reads current row first, skips type update if user already set a specific type
  - `booking_data` = full extracted JSON
- Graceful error handling — logs and returns `{}` on failure
- Uses `ANTHROPIC_API_KEY` from `Deno.env.get()`

### 4. useAttachments.ts

- Remove debug `console.log`/`console.error` lines
- Add `og_title`, `og_description`, `og_image_url`, `booking_data` to AttachmentRow type
- `uploadFile` returns `{ id, filePath, fileType }` so onSuccess can fire extract-booking-info
- Fire-and-forget invoke of extract-booking-info; invalidate query on completion

### 5. AttachmentCard.tsx — Premium card

**Banner (160px, rounded-t-lg):**
- Priority: og_image_url > signed URL for image files > gradient placeholder
- Gradient by type: flight=blue, hotel=amber, activity=green, link=teal, other=slate
- Gradient fallback: centered type icon (32px, white)

**Body:**
- Title: og_title or cleaned filename (strip UUID prefix `/^[a-f0-9-]{36,}-/`)
- og_description (13px, muted, line-clamp-2)
- Structured booking_data display with Lucide icons (flights: route/times/ref, hotels: provider/dates/ref, activities: date/time/ref)
- "Added by [name] · [timeAgo]" with "You" badge

**Footer:** Icon-only buttons right-aligned — external link + trash. Delete uses AlertDialog.

### 6. BookingsTab.tsx

Pass `getSignedUrl` callback to each AttachmentCard.


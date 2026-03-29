

## Revised: Bookings & Docs tab

Same plan as previously approved, with one addition:

### Empty state (in `BookingsTab.tsx`)

When `attachments.length === 0`, render centered empty state instead of filter/search/list:

- 📄 icon or emoji
- **"No docs saved yet 📄"** heading
- "Upload a file or save a link to get started" subtext
- Two buttons side by side: **"Upload file"** and **"Save a link"**
- Each button switches to the corresponding add mode (same as the toggle buttons in the non-empty view)

### Full file list (unchanged from approved plan)

1. **Migration** — `ALTER TABLE attachments ADD COLUMN created_by uuid DEFAULT auth.uid()`
2. **`src/hooks/useAttachments.ts`** — CRUD + file upload + signed URL downloads
3. **`src/components/bookings/BookingsTab.tsx`** — Main tab with empty state, filters, search, add modes
4. **`src/components/bookings/AttachmentCard.tsx`** — Card with type icon, title, notes, added-by, Open/Delete
5. **`src/components/bookings/FileUploadZone.tsx`** — Drag-and-drop, PDF/JPG/PNG, progress bar
6. **`src/components/bookings/LinkForm.tsx`** — URL + title + type + notes form
7. **`src/pages/TripHome.tsx`** — Replace bookings placeholder with `<BookingsTab>`




## Plan: Three Edge Functions + Export Buttons

### Files to create

1. **`supabase/functions/public-trip-share-view/index.ts`** — Public POST endpoint, looks up share token, returns sanitized trip data
2. **`supabase/functions/export-trip-ics/index.ts`** — Auth GET endpoint, generates iCalendar file
3. **`supabase/functions/export-expenses-csv/index.ts`** — Auth GET endpoint, generates CSV file

### Files to modify

4. **`src/components/itinerary/ItineraryTab.tsx`** — Add "Export to Calendar (.ics)" button
5. **`src/components/expenses/ExpensesTab.tsx`** — Add "Export CSV" button

### Technical details

**Function 1: `public-trip-share-view`**
- POST with `{ token }`, no JWT required
- Service role client to query `trip_share_tokens`, validate expiry/revocation
- Join trips, itinerary_items, attachments, count trip_members
- Return sanitized payload: trip name/dates, items (no notes/user IDs), attachments (title/type/url only), member_count
- CORS headers

**Function 2: `export-trip-ics`**
- GET `?trip_id=xxx`, JWT required via `getClaims()`
- Verify membership via `is_trip_member` RPC or query
- Fetch itinerary_items, generate RFC 5545 iCalendar text
- DTSTART as DATE if no start_time, DATETIME (with TZID or Z) if start_time set
- Return `text/calendar` with `Content-Disposition: attachment`

**Function 3: `export-expenses-csv`**
- GET `?trip_id=xxx`, JWT required via `getClaims()`
- Verify membership, fetch expenses + splits + profiles for display names
- CSV columns: Date, Title, Amount, Currency, Paid By, Participants, Notes
- Proper CSV escaping (quotes, commas, newlines)
- Return `text/csv` with `Content-Disposition: attachment`

**Frontend buttons**
- Itinerary tab: Button with `Download` icon next to "Add day", calls edge function via full URL constructed from `VITE_SUPABASE_PROJECT_ID`, triggers blob download
- Expenses tab: Button with `Download` icon in the top bar next to "Add Expense", same pattern

**Secrets**: All required secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) are already configured. No new secrets needed.


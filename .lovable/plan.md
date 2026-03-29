

## Revised Plan: Rich Share Page — Two Additions

These are incremental changes to the previously approved plan. No new files needed.

### 1. Fallback "Member" name for null display_name

**Edge Function (`public-trip-share-view/index.ts`)**
- When building member first names from profiles, use `"Member"` if `display_name` is null/empty
- In expense summary calculation, same fallback: any profile lookup that returns null → `"Member"`
- Never expose user_id or email in any response field

**Implementation**: After fetching profiles, build a `nameMap: Record<string, string>` where:
```typescript
const firstName = (profile.display_name || "Member").split(" ")[0];
nameMap[profile.id] = firstName;
```
Use this map for both `members` array and expense `balances`/`settle_up` names.

### 2. Return route_stops so ShareView can show destination in day headers

**Edge Function** — Add `trip_route_stops` fetch to the parallel queries:
```typescript
supabase
  .from("trip_route_stops")
  .select("destination, start_date, end_date")
  .eq("trip_id", tripId)
  .order("start_date")
```
Return as `route_stops` in the response.

**ShareView (`src/pages/ShareView.tsx`)** — Add route_stops to the `ShareData` interface and use them to compute day headers:
- For each `day_date`, find the route stop where `start_date <= day_date <= end_date`
- Day header format: `"Day N — Thu 26 Mar · Rio"` (with destination appended when matched)
- Day number calculated from the earliest itinerary date or trip start date

### Files to modify

1. **`supabase/functions/public-trip-share-view/index.ts`**
   - Add route_stops query
   - Add members query (join trip_members → profiles, extract first name with "Member" fallback)
   - In expense summary: use same "Member" fallback for all name lookups
   - Add `end_time` to itinerary_items select
   - Add OG fields to attachments select (`og_title, og_description, og_image_url`)
   - Filter attachments to `type = 'link'` only

2. **`src/pages/ShareView.tsx`**
   - Add `route_stops` and `members` to ShareData interface
   - Map day_date → destination from route_stops for day headers
   - Show "Day N — [weekday date] · [destination]" format

3. **`src/components/ShareModal.tsx`**
   - Add `includeExpenses` toggle state
   - Append `?expenses=1` to share URL when toggled on
   - Add WhatsApp share button

4. **`src/components/InviteModal.tsx`**
   - Add WhatsApp share button below copy link

### Technical detail: day-to-destination mapping

```typescript
function getDestinationForDate(dayDate: string, stops: RouteStop[]): string | null {
  for (const stop of stops) {
    if (dayDate >= stop.start_date && dayDate <= stop.end_date) {
      return stop.destination;
    }
  }
  return null;
}
```


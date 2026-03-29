

# Itinerary Item Cards: Attendance, Sort, Permissions

## Files to create/modify

| Target | Change |
|--------|--------|
| **Migration** (new) | Create `itinerary_attendance` table with RLS |
| `src/hooks/useItineraryAttendance.ts` (new) | Hook for attendance CRUD + trip members query |
| `src/components/itinerary/AttendanceRow.tsx` (new) | Avatar row with status dots + cycle logic |
| `src/components/itinerary/AttendanceSheet.tsx` (new) | Bottom drawer showing all members with status |
| `src/components/itinerary/ItineraryItemCard.tsx` | Add AttendanceRow between title/location and comments |
| `src/components/itinerary/ItineraryTab.tsx` | Sort items: start_time ASC, nulls last by sort_order |

No RLS or delete button changes needed — existing policies and `canDelete` logic already match requirements.

---

## 1. Database Migration

```sql
CREATE TABLE public.itinerary_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  itinerary_item_id uuid NOT NULL REFERENCES public.itinerary_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('maybe', 'out')),
  UNIQUE (itinerary_item_id, user_id)
);
ALTER TABLE public.itinerary_attendance ENABLE ROW LEVEL SECURITY;

-- Members can see all attendance for their trips
CREATE POLICY "attendance_select" ON public.itinerary_attendance
  FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "attendance_insert" ON public.itinerary_attendance
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "attendance_update" ON public.itinerary_attendance
  FOR UPDATE TO authenticated USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "attendance_delete" ON public.itinerary_attendance
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));
```

## 2. Hook: `useItineraryAttendance`

- Query all `itinerary_attendance` rows for the trip (single query)
- Query `trip_members` + `profiles` for member list (user_id, display_name)
- `cycleStatus(itemId)`: no row → INSERT 'maybe' → UPDATE 'out' → DELETE
- Invalidate queries on success

## 3. AttendanceRow

Placed between title/location block and comments in `ItineraryItemCard`.

**Avatar display rules:**
- 1 member: show 1 avatar, no pill
- 2–3 members: show all avatars, no pill
- 4+ members: show first 3 avatars + `+N` muted pill (N = remaining count)

**Status dots** (small circle bottom-right of avatar):
- No row (attending): teal dot, `Check` icon
- `maybe`: amber dot, `HelpCircle` icon
- `out`: red dot, `X` icon, avatar opacity-50

**Interaction:**
- Tap own avatar → cycle: in → maybe → out → in
- Other avatars not tappable
- Tap `+N` pill or row background → open AttendanceSheet

Code comment: `// TODO Phase 2: use attendance to generate personal itinerary view in global tab`

## 4. AttendanceSheet

Bottom drawer (existing `Drawer` component):
- Each row: avatar + display name + status icon
- "You" label next to current user
- Sorted: attending first, maybe, out last

## 5. Sort Logic

In `ItineraryTab.tsx` where items are grouped by day, sort each day's items:
1. Items with `start_time` — ascending
2. Items without `start_time` — at bottom, by `sort_order`

```ts
items.sort((a, b) => {
  if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
  if (a.start_time) return -1;
  if (b.start_time) return 1;
  return (a.sort_order || 0) - (b.sort_order || 0);
});
```


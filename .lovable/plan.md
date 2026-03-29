

# Itinerary Tab — Plan Update (2 corrections)

These two changes apply to the previously approved Itinerary V1 plan. No other changes.

## 1. Delete permission: creator can delete own items

**Database migration** — update the `itinerary_delete` RLS policy:

```sql
DROP POLICY "itinerary_delete" ON public.itinerary_items;
CREATE POLICY "itinerary_delete" ON public.itinerary_items
  FOR DELETE TO authenticated
  USING (
    (created_by = auth.uid() AND is_trip_member(trip_id, auth.uid()))
    OR is_trip_admin_or_owner(trip_id, auth.uid())
  );
```

This requires adding a `created_by` column to `itinerary_items`:

```sql
ALTER TABLE public.itinerary_items
  ADD COLUMN created_by uuid NOT NULL DEFAULT auth.uid();
```

**UI (ItineraryItemCard)** — show Delete button if `item.created_by === user.id` OR `myRole` is owner/admin. Edit remains visible to all members.

**Hook (useItinerary)** — include `created_by` in select; set `created_by: user.id` on insert.

### Files affected
| File | Change |
|------|--------|
| Migration SQL | Add `created_by` column + replace delete RLS policy |
| `src/hooks/useItinerary.ts` (new) | Include `created_by` in queries and inserts |
| `src/components/itinerary/ItineraryItemCard.tsx` (new) | Delete button visible when `item.created_by === userId \|\| isOwnerOrAdmin` |

## 2. Empty day state with CTA

**DaySection component** — when a day section has zero items, render:

```
Nothing planned for this day yet — add the first activity ＋
```

Tapping the text opens the ItemFormModal pre-filled with `day_date` for that section.

Day sections are pre-populated from confirmed route stops (each stop date in the range generates a day header). This logic lives in `ItineraryTab.tsx` — merge unique dates from `itinerary_items` day_dates and route stop date ranges, then for each day render `DaySection` which shows the empty CTA or the item list.

### Files affected
| File | Change |
|------|--------|
| `src/components/itinerary/DaySection.tsx` (new) | Empty state CTA that triggers add-item modal with pre-filled date |
| `src/components/itinerary/ItineraryTab.tsx` (new) | Compute day list from route stops + existing items; pass to DaySections |

## No other changes
All other aspects of the Itinerary V1 plan remain as previously approved.


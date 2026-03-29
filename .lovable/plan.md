
Files I will change:
- `src/components/itinerary/ItineraryItemCard.tsx`
- `src/components/itinerary/DaySection.tsx`

Plan:
1. Fix the drop target wiring in `ItineraryItemCard.tsx`
   - Keep timed items non-draggable.
   - Keep the drag handle visible only on untimed items.
   - But always allow cards to receive `onDragOver` and `onDrop`, including timed items, so an untimed item can be dropped relative to them.

2. Tighten the hybrid reorder behavior in `DaySection.tsx`
   - Preserve the current hybrid value logic:
     - timed items use virtual position from `start_time`
     - untimed items use `sort_order`
   - Keep drag start blocked for timed items.
   - Ensure the drop handler computes midpoint `sort_order` against whichever neighbors are around the target and resets drag state cleanly.

3. Do not touch unrelated itinerary behavior
   - No attendance changes.
   - No comments changes.
   - No delete-flow changes.
   - No database schema changes.

4. Debug conclusion I’ll implement from
   - `draggable` is already passed correctly from `DaySection` to `ItineraryItemCard`.
   - The real bug is that timed cards currently do not attach `onDrop`, so dropping between timed anchors never fires.
   - Reorder persistence is already working: the untimed item’s `sort_order` in the database is changing.
   - Query invalidation is already present in `useItinerary`, so no hook changes are needed.

Technical details:
- Current blocker:
```text
DaySection -> ItineraryItemCard(draggable=false for timed)
ItineraryItemCard disables onDrop when draggable=false
=> timed items cannot act as drop targets
=> untimed item cannot be placed between timed items
```

- Intended post-fix behavior:
```text
Timed item:
- draggable = false
- no visible drag handle
- can receive drop

Untimed item:
- draggable = true
- visible drag handle
- can receive drop
```

- Why only these two files:
  - `ItineraryItemCard.tsx` controls whether drop events are attached.
  - `DaySection.tsx` owns drag start/drop midpoint logic.
  - `useItinerary.ts` already invalidates on reorder, and DB writes are already happening.



## Replace drag-and-drop with @dnd-kit

### Files to change
1. **`package.json`** — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
2. **`src/components/itinerary/DaySection.tsx`** — full rewrite of drag logic using dnd-kit's `DndContext`, `SortableContext`, sensors
3. **`src/components/itinerary/ItineraryItemCard.tsx`** — remove all native drag props, add dnd-kit `useSortable` hook integration
4. **`src/hooks/useItinerary.ts`** — no changes needed (optimistic update already works)

### Approach

**DaySection.tsx** becomes the drag orchestrator:
- Wrap items list in `<DndContext>` with `<SortableContext>` using `verticalListSortingStrategy`
- Configure sensors: `PointerSensor` (with 8px activation distance to avoid interfering with buttons) + `TouchSensor` (with 250ms delay so scrolling still works on mobile)
- `onDragStart`: store active item id in state (for opacity styling)
- `onDragEnd`: compute new `sort_order` from neighbors, call `onReorder`
- Timed items get `disabled: true` in their `useSortable` config — they cannot be picked up but remain valid drop targets
- dnd-kit handles placeholder gaps, drop-at-end, and self-drop no-ops natively

**ItineraryItemCard.tsx** changes:
- Remove all native drag event props (`onDragStart`, `onDragEnd`, `onDragOver`, `onDrop`, `draggable`)
- Add `useSortable` hook with the item's id
- Apply `transform` and `transition` styles from `useSortable` to the card div
- Show `GripVertical` handle only when `!item.start_time` — bind it as the drag handle via `listeners` and `attributes` from the hook
- When `isDragging` (from `useSortable`), apply `opacity-50`
- Pass `disabled: true` to `useSortable` for timed items

**Sort order calculation on drop** (in DaySection):
```text
onDragEnd({ active, over }):
  if no over or active === over → return
  if active item has start_time → return (safety check)
  
  oldIndex = items.findIndex(id === active.id)
  newIndex = items.findIndex(id === over.id)
  
  reordered = arrayMove(items, oldIndex, newIndex)  // from @dnd-kit/sortable
  
  // Compute sort_order for the moved item based on neighbors
  prev = reordered[newIndex - 1]
  next = reordered[newIndex + 1]
  prevVal = prev ? getSortValue(prev) : 0
  nextVal = next ? getSortValue(next) : (prevVal + 2000)
  newSortOrder = Math.round((prevVal + nextVal) / 2)
  
  onReorder([{ id: active.id, sort_order: newSortOrder }])
```

**What stays the same:**
- All attendance, comments, edit/delete, form modal logic untouched
- `useItinerary.ts` optimistic update and rollback unchanged
- `ItineraryTab.tsx` hybrid sort logic unchanged
- Card visual layout (badge, location, time display) unchanged


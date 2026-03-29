

## Fix three drag-and-drop issues

### Files to change
1. **`src/components/itinerary/DaySection.tsx`** — all three fixes live here

`useItinerary.ts` does NOT need changes — the optimistic update and DB persistence logic is already correct. The issues are in the drop handler and rendering logic in DaySection.

---

### Issue 1: Drop doesn't save the new position

**Root cause**: The `handleDrop` computes `newSortOrder` as the midpoint between `prevVal` and `targetVal`. But when the dragged item is already in the list, its old position affects the index lookup. After the item is conceptually "removed" from its old spot, the target index shifts — but the code doesn't account for this.

**Fix**: When computing the midpoint, skip the dragged item from the neighbor calculation. Find the target index in the list excluding the dragged item, then compute the midpoint from the correct neighbors:

```text
filtered = items.filter(i => i.id !== draggedId)
targetIdx in filtered = index of targetId
prevItem = filtered[targetIdx - 1]
targetItem = filtered[targetIdx]
newSortOrder = midpoint(prevItem value, targetItem value)
```

This ensures the sort_order value actually places the item in the intended gap.

### Issue 2: Self-drop placeholder bug

**Fix**: In the render loop, suppress the placeholder when the drop target is the item immediately after the dragged item in the current list. Add this check:

```typescript
const draggedIndex = items.findIndex(i => i.id === dragItemRef.current);
const targetIndex = items.findIndex(i => i.id === dragOverTargetId);
const isSamePosition = targetIndex === draggedIndex + 1;
// Only show placeholder if !isSamePosition
```

Also suppress the placeholder via `handleDragOver` — don't set `dragOverTargetId` if the target is the immediate next sibling.

### Issue 3: Cannot drop after last card

**Fix**: Add a trailing drop zone `div` after the last card:

```tsx
{/* Trailing drop zone for "move to end" */}
{dragItemRef.current && (
  <div
    onDragOver={(e) => { e.preventDefault(); setDragOverTargetId("__end__"); }}
    onDrop={handleDropEnd}
    className={cn(
      "min-h-[48px] rounded-lg border-2 border-dashed transition-all duration-150",
      dragOverTargetId === "__end__" 
        ? "border-primary/40 bg-primary/5" 
        : "border-transparent"
    )}
  />
)}
```

`handleDropEnd` sets `sort_order` to the last item's sort value + 100.

---

### Summary of changes in DaySection.tsx

- Rewrite `handleDrop` to exclude the dragged item from neighbor computation
- Add `handleDropEnd` for trailing drop zone
- Add self-drop suppression in `handleDragOver` and placeholder rendering
- Add trailing drop zone div after the items list
- Use `useState` for tracking drag item ID (instead of ref) so placeholder renders reactively — or keep ref but force re-render via `dragOverTargetId` state updates (current approach works since `dragOverTargetId` already triggers re-render)


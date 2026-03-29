

## Drag UX improvements: live preview, optimistic updates, smooth transitions

### Files to change
1. **`src/components/itinerary/DaySection.tsx`** — major rewrite of drag logic: track hover target for live placeholder, compute optimistic reorder on drop, add placeholder rendering
2. **`src/components/itinerary/ItineraryItemCard.tsx`** — add opacity styling when dragged, accept `isDragging` and `isDropTarget` props
3. **`src/hooks/useItinerary.ts`** — add optimistic update to `reorderItems` mutation with rollback on error

### What changes

**1. Live drop preview while dragging (DaySection + ItineraryItemCard)**
- Add `dragOverTargetId` state in `DaySection` — updated on every `onDragOver` to the id of the card being hovered
- Render a dashed placeholder element (subtle border, ~48px height) just above the hovered card to show where the item will land
- Pass `isDragging` prop to the card being dragged — it renders with `opacity-50` and a ring/outline
- Pass `isDropTarget` prop to the hovered card — used to conditionally render the placeholder gap above it
- Clear `dragOverTargetId` on `onDragEnd` and `onDrop`

**2. Optimistic update on drop (DaySection + useItinerary)**
- On drop, immediately compute the new sort order and reorder the local items array via `queryClient.setQueryData` before the mutation fires
- `reorderItems` mutation gets an `onMutate` that snapshots current data, writes the optimistic update, and returns the snapshot
- `onError` reverts to the snapshot and shows an error toast
- `onSettled` invalidates the query to sync with the DB

**3. Smooth CSS transition (ItineraryItemCard)**
- Add `transition-all duration-150` to the card's outer div so position/opacity changes animate smoothly

### Technical detail

Optimistic update in `useItinerary.ts`:
```typescript
reorderItems = useMutation({
  mutationFn: async (reordered) => { /* existing DB writes */ },
  onMutate: async (reordered) => {
    await qc.cancelQueries({ queryKey: key });
    const previous = qc.getQueryData(key);
    qc.setQueryData(key, (old) => {
      const updated = [...old];
      for (const r of reordered) {
        const item = updated.find(i => i.id === r.id);
        if (item) item.sort_order = r.sort_order;
      }
      return updated;
    });
    return { previous };
  },
  onError: (err, _, context) => {
    qc.setQueryData(key, context.previous);
    toast.error(err.message);
  },
  onSettled: () => qc.invalidateQueries({ queryKey: key }),
});
```

Placeholder in DaySection — rendered conditionally before the hovered card:
```tsx
{items.map(item => (
  <Fragment key={item.id}>
    {dragOverTargetId === item.id && dragItemRef.current && dragItemRef.current !== item.id && (
      <div className="h-12 rounded-lg border-2 border-dashed border-primary/40 transition-all duration-150" />
    )}
    <ItineraryItemCard
      isDragging={dragItemRef.current === item.id}
      isDropTarget={dragOverTargetId === item.id}
      ...
    />
  </Fragment>
))}
```


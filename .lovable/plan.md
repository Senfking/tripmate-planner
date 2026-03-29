

## Add overlap detection to itinerary item cards

### No migration needed
The `end_time` column (time, nullable) already exists on `itinerary_items` and is already in the form modal with start/end time selects.

### Files to change
1. **`src/components/itinerary/DaySection.tsx`** — compute overlaps per day, pass overlap info to each card
2. **`src/components/itinerary/ItineraryItemCard.tsx`** — render amber left border + warning icon with tooltip when overlapping

### Overlap detection logic (DaySection.tsx)

Compute a `Map<string, string[]>` mapping each item ID to the titles of items it overlaps with:

```typescript
function computeOverlaps(items: ItineraryItem[]): Map<string, string[]> {
  const timed = items.filter(i => i.start_time && i.end_time);
  const map = new Map<string, string[]>();
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j];
      const aStart = timeToMinutes(a.start_time!);
      const aEnd = timeToMinutes(a.end_time!);
      const bStart = timeToMinutes(b.start_time!);
      const bEnd = timeToMinutes(b.end_time!);
      if (aStart < bEnd && bStart < aEnd) {
        map.set(a.id, [...(map.get(a.id) || []), b.title]);
        map.set(b.id, [...(map.get(b.id) || []), a.title]);
      }
    }
  }
  return map;
}
```

Pass `overlapTitles?: string[]` prop to each `ItineraryItemCard`.

### Visual treatment (ItineraryItemCard.tsx)

- Accept `overlapTitles?: string[]` prop
- When non-empty: add `border-l-[3px] border-l-amber-400` to the card
- Show a small `AlertTriangle` icon (amber) next to the status badge
- Wrap the icon in a `Tooltip` (from existing `@/components/ui/tooltip`): "Overlaps with [title1], [title2] — different people can join different activities"
- On mobile (touch): tooltip triggers on tap via Radix's built-in touch handling

### What stays the same
- Drag logic, attendance, comments, edit/delete — untouched
- Overlaps are purely informational — no blocking


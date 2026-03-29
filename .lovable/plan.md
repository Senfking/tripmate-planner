

## Grouped Bookings Tab

### Files to change
- `src/components/bookings/BookingsTab.tsx` — add grouped view logic, sorting, "You" badge
- `src/components/bookings/AttachmentCard.tsx` — accept optional `isMine` prop, show "You" badge

No new files, no database or storage changes.

### Approach

**BookingsTab.tsx:**

1. Define section config array with type key, label, and icon (reuse Lucide icons from AttachmentCard):
   ```
   SECTIONS = [
     { type: "flight", label: "Flights", icon: Plane },
     { type: "hotel", label: "Hotels", icon: Hotel },
     { type: "activity", label: "Activities", icon: Activity },
     { type: "link", label: "Links", icon: Link2 },
     { type: "other", label: "Other / Files", icon: File },
   ]
   ```

2. Add a `sortByOwnership` helper: items where `created_by === user.id` come first, then by `created_at` descending.

3. In the list rendering area, branch on view mode:
   - **Grouped view** (filter === "all" AND no search): render collapsible sections using Radix `Collapsible` (already installed). For each section, filter attachments by type, skip if empty, apply ownership sort. Section header = clickable row with icon + label + count badge + chevron. Content = list of `AttachmentCard`s. Default expanded (local state initialized to `true` for non-empty sections).
   - **Filtered view** (specific filter selected, no search): flat list with ownership sort.
   - **Search view** (search active): flat list across all types with ownership sort. Type icon already shows on each card.

4. Use `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from existing `@/components/ui/collapsible`. Add CSS transition for smooth animation via `data-[state=open]` / `data-[state=closed]` classes with `grid-rows` trick or simple `overflow-hidden` with `animate-accordion-down/up`.

**AttachmentCard.tsx:**

5. Add optional `isMine?: boolean` prop. When true, show a small "You" badge (muted, text-xs) next to the "Added by" line.

### Section header design

```text
┌─────────────────────────────────────┐
│ ✈  Flights                    (2) ▾ │
├─────────────────────────────────────┤
│ [AttachmentCard]                    │
│ [AttachmentCard]                    │
└─────────────────────────────────────┘
```

- Icon + label left-aligned, count in muted badge, chevron rotates on collapse
- Tap anywhere on header to toggle


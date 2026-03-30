

## Add Status Badges to Trip Dashboard Section Cards (Revised)

### Files to change

1. **`src/components/trip/SectionCard.tsx`** — Add `badge` prop, render frosted pill top-right
2. **`src/components/trip/TripDashboard.tsx`** — Compute badge state per card; add vibe_responses query
3. **`src/pages/TripHome.tsx`** — Pass `startDate`/`endDate` to TripDashboard

No new files. No database schema changes.

---

### SectionCard.tsx

Replace `badgeCount` prop with:
```ts
badge?: { label: string; color: 'green' | 'amber' | 'red' | 'teal' | 'grey'; pulse?: boolean }
```

Render absolutely positioned pill (top: 12px, right: 12px):
- `background: rgba(0,0,0,0.45)`, `backdrop-filter: blur(4px)`, `border: 1px solid rgba(255,255,255,0.15)`, `border-radius: 20px`, `padding: 3px 8px`, `font-size: 11px`, `font-weight: 500`, white text
- 6px colored dot on left (color map: green `#10B981`, amber `#F59E0B`, red `#EF4444`, teal `#0D9488`, grey `#94A3B8`)
- `pulse: true` → `animate-pulse` on dot only
- **All cards use identical rendering — no special cases**

### TripDashboard.tsx

Add `startDate`/`endDate` props. Compute `tripEnded` flag.

**Global override**: if `tripEnded`, all badges → `{ label: "Trip ended", color: "grey" }`.

**Per-card badge logic** (using existing queries + one new vibe_responses count query):

| Card | Priority | Label | Color |
|------|----------|-------|-------|
| Decisions | 1. No vibe responses | "Vibe pending" | amber |
| | 2. Pending votes > 0 | "[N] pending" | amber |
| | 3. Route locked | "Route confirmed" | teal |
| | 4. Default | "Not started" | grey |
| Itinerary | 1. Today in date range | "In progress" (pulse) | green |
| | 2. Starts within 60d | "[N] days to go" | teal |
| | 3. Starts > 60d | "Upcoming" | teal |
| | 4. No items | "Nothing planned" | grey |
| | 5. Items, no dates | "[N] activities" | green |
| Bookings | 1. Has attachments | "[N] docs saved" | green |
| | 2. Empty | "No docs yet" | grey |
| Expenses | 1. User owes | "You owe €[X]" | red |
| | 2. User owed | "Owed €[X]" | green |
| | 3. Settled | "Settled up" | green |
| | 4. None | "No expenses" | grey |
| Admin | Always | "[N] members" | grey |

**Admin badge**: grey dot + label, same rendering as every other card.

### TripHome.tsx

Pass `startDate={trip.tentative_start_date}` and `endDate={trip.tentative_end_date}` to `TripDashboard`.


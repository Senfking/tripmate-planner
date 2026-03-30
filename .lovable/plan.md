

## Fix Trip Dashboard Issues

### Files to change

1. **`src/components/trip/TripOverviewHero.tsx`** — Remove 🗺️ emoji, drop year from date format
2. **`src/components/trip/SectionCard.tsx`** — Teal badge, support colored summary text, fix padding
3. **`src/components/trip/TripDashboard.tsx`** — Pass `summaryColor` for expenses card, add bottom margin

---

### 1. Hero card (TripOverviewHero.tsx)

Line 70 — change the statusLine format:
- Remove `🗺️` emoji prefix
- Change `format(new Date(last.end_date), "MMM d, yyyy")` → `format(new Date(last.end_date), "MMM d")`
- Result: `"3 stops · May 22 – May 31"` with `"9 days"` as subtitle (already working)

### 2. Badge colour (SectionCard.tsx)

Line 55 — change badge from white bg/dark text to teal bg/white text:
- `bg-white text-slate-900` → inline style `background: #0D9488; color: white`

### 3. Expenses summary colour (SectionCard.tsx + TripDashboard.tsx)

Add optional `summaryColor` prop to `SectionCard`. When set, apply it as `color` style on the summary `<p>`.

In `TripDashboard.tsx`, compute the color alongside the summary string:
- Owed money → `#10B981` (green)
- Owes money → `#F59E0B` (amber)  
- Settled / no expenses → undefined (default white)

### 4. Admin card padding / bottom margin (SectionCard.tsx + TripDashboard.tsx)

- `SectionCard`: change from `px-4` to `px-4 py-[18px]` and remove the fixed `height: 110` in favor of `minHeight: 110` so padding is respected equally top and bottom.
- `TripDashboard`: change `pb-8` to `pb-12` for breathing room after the last card.


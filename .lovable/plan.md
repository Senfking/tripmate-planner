

## Desktop Polish — 4 Fixes

### Files to change
1. **src/components/ui/TabHeroHeader.tsx** — Remove border-radius on desktop
2. **src/components/AppLayout.tsx** — Remove horizontal padding from content area on desktop so hero touches edges
3. **src/components/AppSidebar.tsx** — Add Map icon next to wordmark; strengthen active nav state
4. **src/pages/TripList.tsx** — Last odd trip card spans both columns

---

### Change 1 — Hero header full width

**TabHeroHeader.tsx line 50:** Change `md:rounded-xl` to `md:rounded-none`

**AppLayout.tsx line 110:** Change `md:px-6` to `md:px-0` on `<main>`, then add `md:px-6` to the inner max-width container instead. Actually simpler: remove `md:px-6` from main entirely, and let individual page content handle padding. But the hero needs to be edge-to-edge while card content below needs padding.

Better approach: Remove `md:px-6` from `<main>` (line 110). Add `md:px-6` to the inner `max-w-[860px]` div — but then the hero inside pages won't be edge-to-edge either since it's inside that div.

Cleanest solution: Keep `md:px-6` on main. The hero header already spans the full content width — the gap comes from the `md:px-6` on main. Instead, on TabHeroHeader, use negative margins on desktop: `md:-mx-6` and compensate with `md:px-6` inside. Or simply remove main padding and add it per-page below the hero.

**Final approach:** Remove `md:px-6` from `<main>` tag. Move padding to the max-width container: add `md:px-6` there. Then in TabHeroHeader, break out of the container padding with `md:-mx-6` so it goes edge-to-edge. Combined with `md:rounded-none`, this achieves the flush look.

### Change 2 — JUNTO wordmark icon

**AppSidebar.tsx line 34-38:** Add `<Map className="h-[18px] w-[18px] text-primary mr-2" />` inline before the "JUNTO" text. Wrap in a flex row.

### Change 3 — Active nav item

**AppSidebar.tsx line 60:** Change active classes:
- `border-l-2` → `border-l-[3px]`
- `bg-sidebar-accent` → `bg-[rgba(13,148,136,0.08)]`
- Add `font-semibold` (600)
- Keep `text-primary` for icon+text

Inactive: change `border-l-2` → `border-l-[3px]` (transparent) to match spacing.

### Change 4 — Last orphaned card

**TripList.tsx:** After mapping `otherTrips`, detect if the count is odd. Apply `md:col-span-2` to the last `RegularCard` when the total visible card count (excluding hero) is odd. Add `md:max-h-[200px]` or similar to prevent it from stretching vertically — or better, just let it span without height change since grid items don't stretch by default in auto rows.


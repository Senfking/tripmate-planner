
## Desktop Top Header Redesign

### Files to change
1. **src/components/AppLayout.tsx** — Add desktop top header (brand row + nav tabs), hide sidebar on desktop, restructure content area
2. **src/components/AppSidebar.tsx** — Add `md:hidden` to hide entire sidebar on desktop
3. **src/components/ui/TabHeroHeader.tsx** — Add `md:hidden` to hide the teal hero banner on desktop (header replaces it)
4. **src/components/BottomNav.tsx** — Confirm it's already `md:hidden` (no change expected)
5. **src/pages/TripList.tsx** — Add compact desktop greeting row (replaces hero), hide TabHeroHeader on desktop

### New component
6. **src/components/DesktopHeader.tsx** — New component for the sticky top header bar with:
   - Row 1: JUNTO wordmark centered, user avatar right
   - Row 2: Nav tabs (Trips | Decisions | Itinerary | Expenses) centered, action pills right-aligned
   - Decisions pending badge as white pill
   - Teal gradient background matching existing brand
   - Only visible on `md:` and above (`hidden md:block`)

### Architecture
- `DesktopHeader` is a new sibling to `AppSidebar` in AppLayout
- It reads `useGlobalDecisions` for badge count (same as sidebar does now)
- Uses `useLocation` for active tab highlighting
- Avatar uses same `HeaderAvatar` pattern from existing code
- Action pills (+ New trip, # Join) rendered on the right side of the tab row — these are contextual to the Trips page, so they'll be passed as children/props or rendered conditionally

### Content area changes
- Remove `md:bg-[#F8FAFC]` from content wrapper (header handles branding)
- Set `max-w-[960px] mx-auto md:px-6` on content container
- Remove extra vertical padding designed for sidebar layout

### What stays the same
- All mobile styles untouched
- No logic, routing, or data changes
- BottomNav still handles mobile navigation
- TabHeroHeader still renders on mobile

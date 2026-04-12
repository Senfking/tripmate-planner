

# Trip Dashboard Redesign + Concierge Button Scoping

## Summary
Complete redesign of `TripDashboard.tsx` and `TripHome.tsx` hero section as previously planned, plus ensuring the "What to do?" concierge button is properly positioned and scoped.

## Changes

### 1. TripHome.tsx — Hero Restructure
- Cover photo: full width, 200px, `rounded-b-2xl`, NO text/avatar overlay
- Move trip name, dates, member avatars, attendance pill to white area below photo
- Keep only: back arrow (top-left), Live indicator (top-right), Camera button (top-right)
- Remove `HeroAvatar` from the hero image area

### 2. TripDashboard.tsx — Full Redesign
- **Quick Actions Row**: 4 circular buttons (Share, Invite, Discover, Settings) — 48px, `bg-gray-100`, `text-[11px]` labels
- **AI Plan Card**: White card with thumbnail + stats if plan exists, or Sparkles + CTA if not
- **Section Cards**: Unified white cards (`rounded-2xl shadow-sm border border-gray-100`) with tinted icon squares — Decisions (amber), Bookings (blue), Expenses (emerald), Itinerary (purple, only if no plan)
- Remove Admin card (moved to Settings quick action)
- Remove `SectionCard` usage, replace with inline card components
- **ArrivalsCard** + **SharedItemsSection** get matching wrapper styling
- Layout: `px-4`, `gap-3`, desktop `max-w-[700px] mx-auto`

### 3. Concierge Button Positioning & Scoping
- **Already correct**: Button only renders in `TripDashboard.tsx` and `TripResultsView.tsx` (plan view) — no changes needed for scoping
- **Position fix**: Update `ConciergeButton.tsx` to `bottom-[calc(5rem+env(safe-area-inset-bottom))]` so it sits above the bottom nav with safe area respect, preventing overlap with dashboard cards
- Keep `fixed bottom-right z-30` positioning

### Files Modified
1. `src/pages/TripHome.tsx` — Hero restructure
2. `src/components/trip/TripDashboard.tsx` — Full redesign
3. `src/components/concierge/ConciergeButton.tsx` — Bottom position adjustment for safe area
4. `src/components/trip/DashboardSkeleton.tsx` — Update to match new card layout


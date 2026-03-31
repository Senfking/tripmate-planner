

# Fix: Make My Account (More) page accessible

## Problem
The profile avatar in the top-right links to `/app/more`, but it's not consistently accessible:
- On **TripHome** (`/app/trips/:tripId`): rendered outside `AppLayout`, so no avatar icon exists at all
- On **global tabs**: the `TabHeroHeader` has an avatar, but the parent `div` has `overflow-hidden` which could clip it depending on safe-area insets
- The **BottomNav** has no "More" tab — there's no persistent navigation to the account page

## Solution
Add a persistent way to access My Account from anywhere:

### 1. Add avatar to TripHome hero (consistency)
In `src/pages/TripHome.tsx`, add a profile avatar button in the top-right of the hero section (next to the LiveIndicator), linking to `/app/more`. Same style as `TabHeroHeader`'s avatar — frosted circle with initials or photo.

### 2. Verify TabHeroHeader avatar isn't clipped
In `src/components/ui/TabHeroHeader.tsx`, ensure the avatar's absolute position stays within the `overflow-hidden` container bounds. The current positioning looks correct but I'll verify the avatar renders properly by ensuring `z-10` is sufficient relative to the gradient overlays.

### Files changed
- `src/pages/TripHome.tsx` — add avatar link to `/app/more` in hero top-right area (alongside LiveIndicator)
- `src/components/ui/TabHeroHeader.tsx` — minor adjustment if clipping is confirmed


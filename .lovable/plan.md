## Problem

1. Tapping the "Entry & visa" card on the trip dashboard (or any link to `/app/trips/:id/bookings#visa-entry-section`) lands on the Bookings & Docs **empty state**, which returns early before rendering `EntryRequirementsBlock` or the `#visa-entry-section` anchor. So the hash target doesn't exist and the user just sees the generic "Snap or upload" hero with no visa info — feels broken.
2. The dashboard card is labeled just "Bookings", but the section is actually "Bookings & Docs".

## Fix

### 1. Always render the entry/visa block in `BookingsTab`
File: `src/components/bookings/BookingsTab.tsx`

In the `attachments.length === 0` empty-state branch (around lines 424–534), render the `EntryRequirementsBlock` **above** the hero card, wrapped in a `<div id="visa-entry-section">` so the hash anchor resolves and the user immediately sees personalized entry/visa guidance for their destination.

- Reuses the existing `EntryRequirementsBlock` component (already imported) and the same `openManualFormForRequirement` handler used in the populated view.
- The block already handles its own internal states (loading, no nationality set, generated requirements, etc.), so it's safe to mount unconditionally.
- Also add a small scroll-on-mount effect: if `location.hash === "#visa-entry-section"`, smooth-scroll to it after first paint (mirrors the existing `scrollToVisa` helper but auto-fires from the URL).

### 2. Rename the dashboard card
File: `src/components/trip/TripDashboard.tsx` (line 850)

Change `Bookings` → `Bookings & Docs` so it matches the section title used in `TripSection.tsx` (`SECTION_TITLES.bookings = "Bookings & Docs"`).

## Out of scope

- No changes to `TravellersSection` — its CTA target is correct, the destination just wasn't rendering the anchor.
- No restructuring of the empty-state hero; just prepending the entry/visa block.

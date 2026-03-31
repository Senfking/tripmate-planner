

# Deferred Polish Fixes

## Files to change

| File | Fix |
|------|-----|
| `src/pages/TripSection.tsx` | #1 — Trip name truncation |
| `src/hooks/useTripRealtime.ts` | #2 — Add `["global-decisions"]` to realtime invalidation |
| `src/components/expenses/CurrencyPicker.tsx` | #3 — Portal the Popover to avoid Drawer clipping |
| `src/components/itinerary/ItineraryItemCard.tsx` | #4 — Make overlap tooltip work on mobile tap |
| `src/pages/Decisions.tsx` | #5 — Already implemented, no change needed |
| `src/pages/Expenses.tsx` | #6 — Already implemented, no change needed |
| `src/pages/Itinerary.tsx` | #7 — Already implemented, no change needed |
| `src/components/ShareInviteModal.tsx` | #8 — Already implemented, no change needed |

## Details

### Fix 1 — Trip name overflow (`TripSection.tsx`)
Add `truncate max-w-[160px]` to the trip name `<span>` inside the back button in the header.

### Fix 2 — Global decisions realtime (`useTripRealtime.ts`)
Add `["global-decisions"]` to the query key arrays for `votes`, `proposal_reactions`, and `date_option_votes` in `TABLE_QUERY_KEYS`. This ensures voting activity triggers a re-fetch of the global decisions feed.

### Fix 3 — CurrencyPicker clipping (`CurrencyPicker.tsx`)
The `PopoverContent` currently renders inside the Radix portal by default (via the `Popover` primitive), but it can still clip inside a Drawer due to `overflow: hidden` on the drawer container. Fix by adding explicit portal container targeting: wrap `PopoverContent` to ensure it portals to `document.body`. Since shadcn's Popover already uses `PopoverPrimitive.Portal`, verify it works. If not, add `container={document.body}` to the Portal or set `PopoverContent` with a high `z-index` and `position: fixed`. The simplest fix: on the `PopoverContent`, add `style={{ zIndex: 9999 }}` and ensure the Portal is rendering to body (it already does via Radix). The real fix is likely just bumping z-index since Drawer's overlay is z-50.

### Fix 4 — Overlap tooltip on mobile (`ItineraryItemCard.tsx`)
Replace the hover-only `Tooltip` with a tap-friendly approach:
- Set `delayDuration={0}` on `TooltipProvider`
- Wrap the `TooltipTrigger` element with an `onClick` handler that programmatically toggles tooltip state, or simpler: switch to a `Popover` for mobile. 

Simplest approach: wrap `AlertTriangle` in a `button` with `onClick` that shows a small `Popover` instead of `Tooltip` on mobile, keeping the Tooltip for desktop. Or use `TooltipProvider delayDuration={0}` and add `onTouchStart` to trigger focus, making Radix show it.

### Fixes 5, 6, 7, 8 — Already done
Verified by reading the source:
- **Decisions empty state** (fix 5): Already has CheckCircle + "You're all caught up!" + subline.
- **Expenses empty state** (fix 6): Already has Wallet + "No expenses yet" + subline.
- **Itinerary empty state** (fix 7): Already has CalendarDays + "Nothing planned yet" + subline.
- **Share modal restriction** (fix 8): `shareRestricted` check at line 67 blocks sharing UI for non-admins when `share_permission === 'admin'`. The `createShare` mutation is only triggered from buttons inside the non-restricted branch.

## Summary
4 files need changes. 4 items are already correctly implemented.


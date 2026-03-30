

# Global Nav Redesign — Updated Plan

## Overview

Replace the three placeholder tab screens (Decisions, Itinerary, Expenses) with cross-trip dashboard views. Update bottom nav with badge. No changes to TripHome or trip-level screens.

## Addition 1: Exclude confirmed proposals from pending decisions

In `useGlobalDecisions`, after fetching `trip_proposals` and `proposal_date_options`, also fetch `trip_route_stops` for each trip. Filter out any proposal where `trip_route_stops` has a row with a matching `proposal_id`. This removes confirmed destinations from pending vote counts and the badge number.

## Addition 2: Visual style spec for all three pages

- Page background: `bg-[#F1F5F9]` (applied to the outer wrapper div)
- Cards: `bg-white rounded-[14px] border border-[#F1F5F9] shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
- Teal `#0D9488` for badges, active toggle states, positive balances ("you are owed")
- Red `#EF4444` for negative balances ("you owe")
- Empty states use Lucide icons (CircleCheck for Decisions, CalendarDays for Itinerary, Wallet for Expenses) — no emoji
- All modals/drawers use `ResponsiveModal` (Drawer on mobile, Dialog on desktop)

---

## Files to create

1. **`src/hooks/useGlobalDecisions.ts`** — Fetches user's trips via `trip_members`, then checks:
   - Vibe Board: trip has `vibe_board_active=true`, `vibe_board_locked=false`, user has no `vibe_responses`
   - Destination votes: `trip_proposals` where user has no `proposal_reactions` AND proposal has no matching `trip_route_stops.proposal_id`
   - Date votes: `proposal_date_options` where user has no `date_option_votes` AND parent proposal has no matching `trip_route_stops.proposal_id`
   - Preference polls: open `polls` with `poll_options` where user has no `votes`
   - Returns flat list sorted by trip `tentative_start_date` ASC (nulls last) + `pendingCount`
   - Uses `refetchOnWindowFocus: true`

2. **`src/hooks/useGlobalItinerary.ts`** — Fetches all trips, then `itinerary_items` where `day_date >= today`, plus `itinerary_attendance` for user, plus `trip_route_stops` for placeholder cards. Groups by trip then date.

3. **`src/hooks/useGlobalExpenses.ts`** — Fetches all trips, then `expenses` and `expense_splits` across those trips. Calculates per-trip net balance (paid - splits) and overall net.

## Files to modify

4. **`src/pages/Decisions.tsx`** — Replace placeholder with pending-decisions feed. Cards show trip emoji+name, description, type badge (teal pill). Tap navigates to `/app/trips/:tripId/decisions`. Empty state: CircleCheck icon + "You're all caught up!" + subtitle.

5. **`src/pages/Itinerary.tsx`** — Replace placeholder with cross-trip upcoming items. Toggle filter "All activities" / "My Plan". Grouped by trip (header: emoji+name+date range), then by date. Item cards: date, title, location, status, attendance dot. Route stop placeholders with "Plan this" link. Two empty states with CalendarDays icon.

6. **`src/pages/Expenses.tsx`** — Replace placeholder with balance summary. Top card: overall net (green/red/teal). Per-trip cards below with emoji+name+balance+"View" button. Empty state with Wallet icon.

7. **`src/pages/More.tsx`** — Add user display name + email at top, "Join a trip" link, logout button.

8. **`src/components/BottomNav.tsx`** — Accept/fetch `pendingCount` from `useGlobalDecisions`. Render teal badge circle with count on Decisions tab when > 0.

9. **`src/components/AppSidebar.tsx`** — Same badge on desktop sidebar Decisions item.

## No database changes required

All data already exists. Read-only queries against existing RLS-protected tables.

## Query strategy

All three hooks use `refetchOnWindowFocus: true`. Queries keyed by user ID. Each hook fetches trips first (via `trip_members` join), then related data in parallel where possible.


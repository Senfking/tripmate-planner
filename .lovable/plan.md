## Problem

The `DateRangePicker` (used in the trip builder, decisions, route planner, etc.) requires the user to scroll down past the calendar and tap **Apply** to commit a range. The button is below the fold on small viewports, so people don't realise the selection isn't saved. Single-date pickers elsewhere in the app (expenses, itinerary, trip dates) commit instantly on tap — the inconsistency is jarring.

## Proposed UX (one rule for all date pickers)

**Tap commits. The popover/sheet closes itself.**

- **Single-date pickers** (already work this way): one tap → value set → popover closes.
- **Range pickers** (new behaviour):
  1. First tap sets `from` and clears `to`. Popover stays open. Helper text under the month: "Pick an end date (or tap the same day for a one-day trip)."
  2. Second tap (any day on or after `from`) sets `to`, fires `onChange` with the full range, and closes the popover.
  3. Tapping a day **before** the current `from` resets `from` to that day (current behaviour, kept).
  4. Tapping the **same day** as `from` commits a one-day trip and closes (matches what Apply did).
  5. Exceeding the 30-day max keeps the existing inline warning, doesn't commit, doesn't close.

No Apply button. **Clear** stays as a small ghost link at the bottom-left — a single tap clears the value, fires `onChange(undefined)`, and closes.

Closing the popover any other way (tap outside, Esc, X on mobile sheet) without a complete range = discard the partial selection (revert to previous `value`). This matches how single-date pickers behave when dismissed without choosing.

## Why this is better

- No hidden CTA. Selection feels direct, like every other tap target in the app.
- Removes a whole interaction step for the common case (pick start, pick end, done).
- Same mental model across single-date and range pickers: "tap = commit."
- The `Clear` affordance stays for the "I want to wipe an existing range" case, which a single tap can't express.

## Scope of changes

**Primary file:** `src/components/decisions/DateRangePicker.tsx`
- Remove the Apply button and the footer row that holds it.
- Move auto-commit logic into `handleSelect`: when a valid `to` is picked (or `from === to`), call `onChange(finalRange)` and `setOpen(false)`.
- Add a one-line helper under the month grid while `from` is set but `to` is not: *"Pick an end date — or tap the same day for a one-day trip."*
- Make `Clear` commit immediately: `onChange(undefined); setOpen(false)`.
- On `handleOpen(false)` without a complete range, do nothing (drop the partial draft) — `value` is unchanged so reopening starts fresh from the last committed value.
- Mobile inline-expanded variant: same logic; the section collapses on commit.

**No changes** to:
- `src/components/ui/calendar.tsx` (shadcn single-date) — already commits on tap.
- Single-date consumers (`ExpenseFormModal`, `InlineExpenseHeader`, `SettleConfirmDrawer`, `TripDateEditor`, `ItineraryTab`, `ProposalCard`, etc.) — they already follow the "tap commits" pattern.
- The trigger button styling — placeholder size fix from the previous turn stays.

## Edge cases handled

- Reopening after a committed range: `handleOpen(true)` already seeds `draft` from `value`, so the calendar shows the existing selection and the user can tap-tap to overwrite.
- Tapping `from` again as a one-day trip: covered (span = 1, commits).
- Picking a day before `from`: resets `from`, stays open waiting for end date (existing behaviour).
- 30-day cap exceeded: shows existing warning, does not commit, does not close.

## Out of scope

- Single-date pickers — already consistent.
- Visual restyle of the calendar grid (colors, fonts) — keeping the current look.
- Adding range support to other pickers — none of the current single-date consumers need it.

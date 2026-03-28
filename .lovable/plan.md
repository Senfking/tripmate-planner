

# Where & When Section — 5 Fixes

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `src/components/decisions/DateRangePicker.tsx` | **Create** | Reusable date range picker (Popover desktop, Drawer mobile) |
| `src/components/decisions/ProposalCard.tsx` | **Edit** | Replace "Add to route" drawer with inline confirm panel; date option radio list with pre-selection & validation; replace date inputs with DateRangePicker |
| `src/components/decisions/AddToRouteDrawer.tsx` | **Edit** | Replace two date inputs with DateRangePicker; add same overlap/gap validation display |
| `src/components/decisions/WhereWhenSection.tsx` | **Edit** | Remove `canManage` gate from ProposalForm (all members can suggest) |
| `src/components/decisions/DecisionsFlow.tsx` | **Edit** | Remove `canManage` gate from "Ask the group something" button |
| `src/components/decisions/StructuredPoll.tsx` | **Edit** | Allow any member to add options; keep lock as `canManage` only |

No other files change. No database changes needed (server-side trigger `validate_route_stop_dates` already handles overlap + end-before-start validation).

---

## 1. Permission Changes (Democratic)

**Any trip member can now:**
- `WhereWhenSection` — show `ProposalForm` always (remove condition that hides it; line 75 guard stays for `isRouteLocked` only)
- `StructuredPoll` — line 132: change `canManage && !isLocked` to just `!isLocked` for the "Add option" form
- `DecisionsFlow` `PreferencesContent` — line 241: change `canManage &&` to always show "Ask the group something"

**Stay owner/admin only (`canManage`):**
- "Add to route 🗺️" button on ProposalCard
- TripRoute: add/edit/remove/reorder stops, lock/unlock
- StructuredPoll lock button (line 173 — unchanged)

---

## 2. Clarified "Add to Route" Confirm Flow

Replace the current `AddToRouteDrawer` usage on `ProposalCard` with an **inline confirmation panel** that expands below the button:

- Destination name displayed read-only
- **If date options exist:** radio list showing each option with vote tallies:
  ```
  ◉ Mar 27–29  (✅ Yes 1 · 🤔 Maybe 0)  🏆 Top pick
  ○ Mar 23–31  (✅ Yes 0 · 🤔 Maybe 1)
  ```
- **If no date options:** show `DateRangePicker` for manual entry
- "Confirm and add to route" button — disabled until date selected and no hard errors
- "Cancel" link to collapse
- Once in route, date options remain visible but voting disabled

The `AddToRouteDrawer` continues to be used only for TripRoute's "+ Add stop" button.

---

## 3. Modern Date Range Picker

**New `DateRangePicker.tsx` component:**
- Single trigger button: "Mar 27 – Mar 29" or "Pick dates"
- **Mobile:** bottom Drawer with full-width Calendar, `numberOfMonths={1}`
- **Desktop:** Popover with `numberOfMonths={2}` side-by-side
- Uses shadcn `Calendar` with `mode="range"` and `pointer-events-auto`
- Clear + Apply buttons
- Props: `value: { from?: Date; to?: Date } | undefined`, `onChange`, `className?`

**Applied to:**
- ProposalCard "Suggest dates" inline form (replaces two `<Input type="date">`)
- AddToRouteDrawer (replaces two date input fields)
- Inline confirm panel manual date entry

---

## 4. Pre-Populate with Highest Voted Dates

When the inline confirm panel opens:
- Sort date options by Yes votes descending; tiebreak by fewer No votes; fallback to earliest
- Auto-select the top option and label it "🏆 Top pick" in soft teal
- Owner can override by clicking a different radio

When no date options exist and DateRangePicker shows:
- Pre-fill start date = last route stop's `end_date` (if exists)
- Leave end date empty

---

## 5. Date Validation in Confirm Panel

**Real-time validation** — runs on every selection change, not just on submit:

**Hard errors (block confirmation):**
- Overlap: red text below selection — "⚠️ These dates overlap with Stop N: Destination. Please select different dates." — button disabled
- End before start (manual picker only): "End date must be after start date" — button disabled

**Soft warnings (allow with changed button text):**
- Gap: amber text — "💬 N-day gap before/after Adjacent stop. Intentional? (e.g. a travel or rest day)"
- Button text changes to "Confirm anyway"

**Same validation applied to:**
- `AddToRouteDrawer` (already has overlap + gap logic — enhance with same styled error/warning display)
- Edit stop dates (already validated server-side; no edit UI exists yet so no client change needed)

Validation logic is a shared helper function used by both the inline panel and AddToRouteDrawer.


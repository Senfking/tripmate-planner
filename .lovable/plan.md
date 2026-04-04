

## Unified Destination List — UI Restructure

### Summary
Merge the separate TripRoute stops list and "Vote on destinations" proposal cards into one unified list in `WhereWhenSection.tsx`. Route stops render as compact confirmed cards; unconfirmed proposals render as interactive voting cards. TripRoute becomes the admin controls footer only.

### Files to change

1. **`src/components/decisions/WhereWhenSection.tsx`** — Major rewrite: build unified list, remove separate voting section
2. **`src/components/decisions/TripRoute.tsx`** — Strip out the stops list rendering; keep only admin controls (lock/unlock, manage route collapsible, add stop drawer, confirm dialogs)
3. **`src/components/decisions/ProposalCard.tsx`** — No changes needed (already has all voting/add-to-route UI)

### Detailed changes

**WhereWhenSection.tsx — Unified list**

- Remove the two-section layout (TripRoute + voting section below)
- Build a single unified list with two groups:

  **Group 1: IN ROUTE** — `sortedStops` (from `useRouteStops`), ordered by `start_date`
  - Each card: route position number (1, 2, 3…), destination name, date range
  - If stop has `proposal_id` and matching entry in `proposalReactions` map, show read-only `👍 n 👎 n`
  - Admin sees trash icon to remove stop (calls `removeStop`)
  - Compact card style similar to current TripRoute stop cards

  **Divider: "Still deciding"** — subtle muted text divider, only rendered when there are unconfirmed proposals

  **Group 2: VOTING** — proposals filtered to exclude those already in route (`!isProposalInRoute(p.id)`)
  - Render existing `ProposalCard` for each (already has thumbs voting, date voting, add-to-route)

- **Header area**: section title + "Suggest a destination" `ProposalForm` button at top right (keep conditional: only show voting group if proposals exist or user taps suggest)
- **Footer**: render `TripRoute` component but only for admin controls (lock button, manage route collapsible, dialogs)
- Keep `LeadingComboBanner` between route stops and voting proposals
- Route summary line (total days, date range) stays at top

**TripRoute.tsx — Admin controls only**

- Remove the stops list rendering (lines 234–324 — the `sortedStops.map` block)
- Remove the route summary line and empty state (those move to WhereWhenSection)
- Keep: admin actions row (lock/unlock buttons, manage route collapsible with add stop + edit stops), AddToRouteDrawer, all confirm dialogs (remove, lock, unlock)
- The component becomes a footer-only admin toolbar

**No changes to ProposalCard.tsx** — it already handles both voting and add-to-route flows perfectly.

### Component layout (top to bottom)

```text
┌─────────────────────────────────┐
│ Route summary (n days · dates)  │  ← from sortedStops
│ [Suggest a destination]  (top R)│
├─────────────────────────────────┤
│ ① Barcelona  May 3–May 7       │  ← IN ROUTE card
│   👍 4 👎 1          [🗑]      │
│ ② Lisbon    May 8–May 12       │
│   👍 3 👎 0          [🗑]      │
├╌╌╌╌╌ Still deciding ╌╌╌╌╌╌╌╌╌╌┤  ← divider
│ [ProposalCard: Porto]           │  ← VOTING state
│   👍👎 voting + dates + add    │
│ [ProposalCard: Seville]         │
├─────────────────────────────────┤
│ [Lock route] ℹ  ⚙ Manage route │  ← TripRoute (admin only)
└─────────────────────────────────┘
```


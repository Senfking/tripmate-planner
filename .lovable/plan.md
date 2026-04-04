

## Redesign "Where & When" Section — Amended Plan

### Files to change

1. **`src/components/decisions/TripRoute.tsx`** — Add reaction counts on stops, move "Add stop" into collapsible admin section, add lock helper text
2. **`src/components/decisions/WhereWhenSection.tsx`** — Rename header, add subtitle, pass destVotes to TripRoute, make voting section conditional (only show if proposals exist or user taps "Suggest a destination")
3. **`src/components/decisions/ProposalCard.tsx`** — Change date options toggle label to "📅 When does this work?"

---

### Detailed changes

**1. TripRoute.tsx**

- Accept new prop `proposalReactions: Record<string, { up: number; down: number }>` mapping proposal_id to vote counts.
- On each stop card that has a `proposal_id`, render small read-only `👍 n  👎 n` labels next to the destination name.
- Move the "Add stop" button out of the main actions row. Instead, below the lock button area, add a collapsible section (using Collapsible from Radix) labeled "⚙ Manage route directly", visible only when `canManage && !isRouteLocked`. Collapsed by default. Contains the "Add stop" button and keeps the existing `AddToRouteDrawer`. The `AddToRouteDrawer` import and state stay.
- Below the "Lock route" button, add muted helper text: "Prevents new destination suggestions. You can unlock anytime."

**2. WhereWhenSection.tsx**

- Rename section header from "Destinations" to "Vote on destinations".
- Add subtitle below: "Suggest a place — the group votes, the admin adds it to the route."
- Pass `destVotes` to `TripRoute` as `proposalReactions` — build a map from each proposal's `proposal_id` to its vote counts so TripRoute can look them up per stop.
- Make the voting section conditional: add local state `showVoting` (default `false`). Render the full "Vote on destinations" section + proposal cards only if `proposals.length > 0` OR `showVoting` is true. Otherwise render just a subtle ghost button: "Suggest a destination" that sets `showVoting = true`.

**3. ProposalCard.tsx**

- Change the date options toggle text from the current label to "📅 When does this work?" (keep the count in parentheses). No logic changes; section stays collapsed by default.


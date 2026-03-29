

## Updated Plan: Trip Home Card Dashboard

Two additions to the previously approved plan:

### 1. Decisions Card — Pending Vote Badge

**TripDashboard.tsx** will compute `pendingVoteCount` by running three checks against existing query data:

- **Unvoted date options**: Count `proposal_date_options` where the user has no row in `date_option_votes`
- **Unreacted proposals**: Count `trip_proposals` where the user has no row in `proposal_reactions`
- **Unanswered polls**: Count open `polls` where the user has no `votes` row for any of the poll's options

These queries already exist in `useProposals` and `useDecisionPolls` — we'll extract the "my votes" data from those hooks or run lightweight count queries directly in TripDashboard.

**SectionCard** gets an optional `badgeCount?: number` prop. When > 0, render a small red dot (8px circle, `bg-red-500`) positioned at the top-right of the card icon area.

### 2. Decisions Card — Summary States

The summary line logic in TripDashboard for the Decisions card:

```text
if route_locked && stops.length > 0:
  "✅ {N}-stop route confirmed · {startDate} – {endDate}"
  (dates from first stop start to last stop end)

else if (totalReactions + totalDateVotes + totalPollVotes) > 0:
  "⏳ {pendingVoteCount} votes pending · Route not confirmed"

else:
  "Share your vibe to get started"
```

### Files affected (same list as before, no new files)

The pending vote logic and summary states are implemented inside **`src/components/trip/TripDashboard.tsx`** (already being created). The **`SectionCard.tsx`** component gains the `badgeCount` prop.

No other files change beyond the original plan.


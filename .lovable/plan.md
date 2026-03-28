

# Where & When — Revised Plan

Updated the aggregate function to batch all proposal reactions per trip in one call.

## Database (single migration)

### New tables

**`trip_proposals`** — id, trip_id, created_by, destination (text), start_date (date), end_date (date), note (text nullable), adopted (boolean default false), created_at (timestamptz default now()). RLS: trip members SELECT/INSERT; admin/owner UPDATE.

**`proposal_reactions`** — id, proposal_id (FK trip_proposals), user_id, value (text: 'in'/'maybe'/'no'). UNIQUE (proposal_id, user_id). RLS: SELECT/INSERT/UPDATE/DELETE via join to trip_proposals → trip members, own rows only for writes.

### New aggregate functions (security definer)

**`get_trip_proposal_reaction_counts(_trip_id uuid)`** — single batched call returning `(proposal_id uuid, value text, count bigint)`. Joins `proposal_reactions` → `trip_proposals` where `trip_id = _trip_id`, groups by `(proposal_id, value)`. Checks `is_trip_member` once. This replaces per-proposal RPC calls.

**`get_poll_vote_counts(_poll_id uuid)`** — returns `(poll_option_id uuid, value text, count bigint)`. Checks trip membership via polls join.

### Existing tables used as-is
- `polls` (type: 'destination'/'date'/'preference', status: 'open'/'locked')
- `poll_options` (label, start_date, end_date, sort_order)
- `votes` (poll_option_id, user_id, value) — already has unique-ish structure; we add a unique index on `(poll_option_id, user_id)` if not present, for upsert support

## New files

| File | Purpose |
|------|---------|
| `src/components/decisions/WhereWhenSection.tsx` | Container: proposals list + structured polls |
| `src/components/decisions/ProposalCard.tsx` | Single proposal card with reaction buttons and tallies |
| `src/components/decisions/ProposalForm.tsx` | Dialog: destination, dates, note inputs |
| `src/components/decisions/StructuredPoll.tsx` | Generic poll card: options, vote buttons, tally bars, lock |
| `src/components/decisions/DestinationPollForm.tsx` | Add destination option (text) |
| `src/components/decisions/DatePollForm.tsx` | Add date range option |
| `src/components/decisions/PreferencePollForm.tsx` | Custom question + options |
| `src/hooks/useProposals.ts` | CRUD proposals, reactions (batched counts via single RPC), adopt mutation |
| `src/hooks/useDecisionPolls.ts` | Poll CRUD, options, votes, vote counts |

## Modified files

| File | Change |
|------|--------|
| `src/pages/TripHome.tsx` | Add `<WhereWhenSection>` below `<VibeBoard>` in Decisions tab |

## Key behaviors

- **Batched reaction counts**: `useProposals` calls `get_trip_proposal_reaction_counts(tripId)` once, returns all `(proposal_id, value, count)` rows. The hook indexes these into a map `{ [proposalId]: { in: N, maybe: N, no: N } }` and passes per-card. User's own reaction fetched via a single query on `proposal_reactions` filtered by `user_id`.
- **Adopt flow**: Organiser clicks "Adopt" → sets `adopted = true` on proposal, auto-creates locked destination + date polls with the proposal's values, toast confirmation.
- **Step gating**: Date poll greyed out until destination poll status = 'locked'. Step labels only visible when no proposal adopted.
- **Vote upsert**: `ON CONFLICT (poll_option_id, user_id) DO UPDATE SET value = EXCLUDED.value`
- **Locked polls**: all inputs disabled, read-only tallies
- **Poll vote privacy**: tallies via `get_poll_vote_counts` RPC, no raw vote data exposed

## Technical details

### Batched reaction count function SQL

```sql
CREATE FUNCTION get_trip_proposal_reaction_counts(_trip_id uuid)
RETURNS TABLE(proposal_id uuid, value text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.proposal_id, pr.value, count(*)
  FROM proposal_reactions pr
  JOIN trip_proposals tp ON tp.id = pr.proposal_id
  WHERE tp.trip_id = _trip_id
    AND is_trip_member(_trip_id, auth.uid())
  GROUP BY pr.proposal_id, pr.value;
$$;
```

### Hook usage pattern

```typescript
// useProposals.ts — single RPC for all reaction counts
const { data: reactionCounts } = useQuery({
  queryKey: ["proposal-reactions", tripId],
  queryFn: async () => {
    const { data } = await supabase.rpc("get_trip_proposal_reaction_counts", { _trip_id: tripId });
    // Index into { [proposalId]: { in: 0, maybe: 0, no: 0 } }
    return indexByProposal(data);
  },
});
```




## Database Schema & RLS for Junto

### Overview
Create 12 tables with indexes, a security-definer helper function, and RLS policies — all via migration tool calls.

### Migration 1: Helper function + Tables

**Security-definer function** `is_trip_member(uuid, uuid)` — checks if a user belongs to a trip. Used in all RLS policies to avoid repetition.

**Security-definer function** `is_trip_admin_or_owner(uuid, uuid)` — checks if a user has `owner` or `admin` role on a trip.

**12 tables** (exact columns as specified):
1. `trips` — core trip record
2. `trip_members` — user ↔ trip membership with role (owner/admin/member)
3. `invites` — invite tokens for joining trips
4. `polls` — date/destination polls per trip
5. `poll_options` — options within a poll
6. `votes` — user votes on poll options
7. `itinerary_items` — day-by-day itinerary entries
8. `attachments` — files/links attached to trips or itinerary items
9. `comments` — threaded comments on items/attachments
10. `expenses` — trip expenses with payer
11. `expense_splits` — per-user share of each expense
12. `trip_share_tokens` — shareable trip links

**Indexes**: On `trip_members(trip_id)`, `trip_members(user_id)`, `itinerary_items(trip_id, day_date)`, `expenses(trip_id)`, `comments(trip_id)`, `comments(itinerary_item_id)`, `votes(poll_option_id, user_id)`.

### Migration 2: RLS Policies

Enable RLS on all 12 tables. Policies:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| trips | member | authenticated (auto-add as owner via trigger) | member | owner/admin |
| trip_members | member | member OR valid invite token | member (own row) | owner/admin |
| invites | member | owner/admin | owner/admin | owner/admin |
| polls | member | member | owner/admin | owner/admin |
| poll_options | member | member | member | member |
| votes | member | member (own) | member (own) | member (own) |
| itinerary_items | member | member | member | member |
| attachments | member | member | member | member |
| comments | member | member (own) | member (own) | member (own) |
| expenses | member | member | member | member |
| expense_splits | member | member | member | member |
| trip_share_tokens | member | owner/admin | owner/admin | owner/admin |

**Trigger**: After INSERT on `trips`, auto-insert the creator into `trip_members` with role `owner`.

### Files changed (code)
None — this is purely database migrations. The `types.ts` file will auto-regenerate after migration.

### Execution
Two migration tool calls (split for size). After confirming creation, I'll list all tables, RLS status, and policies.


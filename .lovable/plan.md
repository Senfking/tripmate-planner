

# Fix: Old long-token invite still showing

## Problem
The code is correct — new invites use short 10-char tokens. But the existing invite for this trip was created **before** the fix, so it still has the old UUID-format token. The query fetches the most recent active invite, which is the old one.

## Solution

Two changes:

1. **Revoke the old invite and let auto-create generate a new one** — tap "Revoke" in the modal, then reopen it. This will auto-create a fresh invite with a short token.

   However, to prevent this from happening to other trips too:

2. **Add a migration to revoke all old UUID-format invites** — a simple UPDATE statement that sets `revoked_at = now()` on any invite where `length(token) > 12`. This forces all trips to get fresh short-token invites on next modal open.

### Files changed
| File | Change |
|------|--------|
| `supabase/migrations/...` | `UPDATE invites SET revoked_at = now() WHERE length(token) > 12 AND revoked_at IS NULL;` |

That's it — one migration, one SQL statement. Next time any invite modal opens, the old long invite won't be found and a new short one will be auto-created.


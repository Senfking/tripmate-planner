

# Invite System V2 — Reusable Links, Join Codes, Redesigned Modal

## Summary

Upgrade the invite system to support reusable invite links (multiple people join via the same link), a short human-readable trip code for easy verbal sharing, and a redesigned invite modal showing both options. Add a public `/join` page for code entry.

---

## Database Migrations

**Migration 1: invite_redemptions table + invites cleanup**
- Create `invite_redemptions` table: `id (uuid PK)`, `invite_id (uuid, NOT NULL)`, `user_id (uuid, NOT NULL)`, `redeemed_at (timestamptz, default now())`, `UNIQUE(invite_id, user_id)`
- Enable RLS on `invite_redemptions` with select/insert policies scoped to trip membership (via join to invites → trips)
- Drop `redeemed_at` and `redeemed_by` columns from `invites` table
- Add `revoked_at (timestamptz, nullable)` column to `invites` table for link revocation

**Migration 2: trip_code on trips**
- Add `trip_code (text, UNIQUE, nullable)` column to `trips` table
- Create a `generate_trip_code()` PL/pgSQL function that generates a random 6-char code from the safe alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O, 1/I/L), retrying on collision
- Create a trigger `auto_generate_trip_code` on `trips` BEFORE INSERT to auto-populate `trip_code`
- Backfill existing trips with unique codes

**Migration 3: update redeem_invite function**
- Replace `redeem_invite(_token text)` to:
  - Check `revoked_at IS NULL` (new error: `revoked`)
  - Remove single-use check (`redeemed_at` no longer exists)
  - Insert into `invite_redemptions` instead of updating `invites`
  - Handle `already_member` by returning trip_id for redirect

**Migration 4: join_by_code function**
- New `join_by_code(_code text)` RPC:
  - Look up trip by `trip_code`
  - Return error if not found
  - Check if already a member → return `already_member` + trip_id
  - Insert into `trip_members` with role `member`
  - Return `success` + trip_id + trip_name

---

## Files Changed

| File | Action | What |
|------|--------|------|
| `supabase/migrations/...` | Create | 4 migration files (schema, function updates) |
| `src/components/InviteModal.tsx` | Rewrite | Redesigned modal with link section, code section, redemption count, revoke/regenerate |
| `src/pages/InviteRedeem.tsx` | Update | Updated error messages for `revoked` state |
| `src/pages/JoinByCode.tsx` | Create | Public `/join` page with code input |
| `src/pages/TripList.tsx` | Update | Add "Join with code" button in empty state |
| `src/pages/More.tsx` | Update | Add "Join a trip" button |
| `src/App.tsx` | Update | Add `/join` route |
| `supabase/functions/get-invite-info/index.ts` | Update | Handle removed `redeemed_at` column |

---

## Detailed Changes

### 1. InviteModal Redesign (`src/components/InviteModal.tsx`)

On open, fetch the trip's existing active (non-expired, non-revoked) invite and the trip_code. If no active invite exists, auto-generate one.

Layout:
- **Share Link section**: Show invite URL, copy button, expiry info ("Expires in X days"), redemption count ("N people joined with this link"), and a "Regenerate" button
- **Trip Code section**: Large styled code display (e.g. `TK4R9X`), tap-to-copy, helper text "People can enter this at [origin]/join"
- **Actions**: "Revoke link" (owner/admin) — sets `revoked_at`, "Generate new code" (owner/admin) — calls an RPC to regenerate

Query `invite_redemptions` count for the active invite to show "X people joined."

### 2. Join By Code Page (`src/pages/JoinByCode.tsx`)

Public route `/join`:
- Centered card with a single 6-character input field styled for code entry
- If not logged in: store code in `sessionStorage` as `join_code`, redirect to `/signup?redirect=/join`
- If logged in: call `join_by_code` RPC, handle success/already_member/not_found
- After auth redirect back, read `join_code` from sessionStorage and auto-submit

### 3. Signup/Login Context

Extend `useInviteInfo` hook to also check for `join_code` in sessionStorage and fetch trip info via a new edge function or by extending `get-invite-info` to accept a code parameter. Show the same contextual "You've been invited" messaging.

### 4. TripList Empty State & More Page

- TripList: Add secondary "Join with code" button below "Create your first trip"
- More page: Add "Join a trip" link/button

### 5. Edge Function Update

Update `get-invite-info` to also accept `{ code: "..." }` as an alternative to `{ token: "..." }`, looking up the trip directly by `trip_code`.

### 6. Error Messages

Updated error map in `InviteRedeem.tsx`:
- `revoked`: "This invite link has been disabled. Ask the organiser for the trip code instead."
- `expired`: "This invite link has expired. Ask the organiser for a new one or request the trip code."

---

## Security Notes

- `join_by_code` is a SECURITY DEFINER function so it can insert into `trip_members`
- `invite_redemptions` RLS allows SELECT for trip members, INSERT for authenticated users joining via valid invite
- Trip codes never expire — only invite links can expire/be revoked
- Only owners/admins can revoke links or regenerate codes (checked in RPC)


-- =============================================================================
-- Account-deletion FK cleanup: remaining auth.users / profiles refs
-- =============================================================================
-- Follow-up to 20260506210100 (expenses.payer_id). For auth.admin.deleteUser
-- to actually succeed end-to-end, every public-schema FK pointing at
-- auth.users(id) — and every FK pointing at public.profiles(id), since
-- profiles.id cascades from auth.users — must have a non-NO-ACTION
-- disposition.
--
-- Remaining blockers identified from a sweep of all migrations to date:
--
--   FK                                     | Target         | Decision
--   ----------------------------------------|---------------|-----------
--   public.invites.created_by              | auth.users    | SET NULL
--   public.trip_share_tokens.created_by    | auth.users    | SET NULL
--   public.ai_trip_plans.created_by        | auth.users    | SET NULL
--   public.attachments.created_by          | profiles      | SET NULL
--   public.profiles.referred_by            | profiles      | SET NULL
--
-- Rationale:
--
-- * invites / trip_share_tokens: SET NULL preserves the audit trail (token,
--   trip_id, expires_at, revoked_at) so admins can still see "an invite
--   existed" — useful for incident response — without preserving the
--   deleted user's identity. Neither table has free-text PII; no scrub
--   needed.
--
-- * ai_trip_plans: per RLS (migration 20260412063404), a plan tied to a trip
--   is readable, updatable, and deletable by every trip member, i.e. the
--   plan is shared content of the trip. SET NULL on created_by lets the
--   trip retain the plan after the original creator deletes their account.
--   The free-text fields (prompt, result jsonb) were already shared with
--   the same co-members, so they need no further scrub here. Plans with
--   trip_id IS NULL are personal drafts and become unreachable after
--   created_by is nullified — delete-account/index.ts pre-deletes the
--   user's drafts so we don't leak orphan rows.
--
-- * attachments: also shared at the trip level. SET NULL preserves file
--   paths, URLs, og/booking metadata, titles, and notes that the user
--   deliberately shared with co-members. created_by goes NULL.
--
-- * profiles.referred_by: when a referrer deletes their account, the
--   referee's row stays, but the attribution is lost. Acceptable trade-off
--   (and the only path that lets the referrer be deletable at all).
-- =============================================================================

-- 1. invites.created_by
ALTER TABLE public.invites
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.invites
  DROP CONSTRAINT IF EXISTS invites_created_by_fkey;
ALTER TABLE public.invites
  ADD CONSTRAINT invites_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. trip_share_tokens.created_by
ALTER TABLE public.trip_share_tokens
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.trip_share_tokens
  DROP CONSTRAINT IF EXISTS trip_share_tokens_created_by_fkey;
ALTER TABLE public.trip_share_tokens
  ADD CONSTRAINT trip_share_tokens_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. ai_trip_plans.created_by
ALTER TABLE public.ai_trip_plans
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.ai_trip_plans
  DROP CONSTRAINT IF EXISTS ai_trip_plans_created_by_fkey;
ALTER TABLE public.ai_trip_plans
  ADD CONSTRAINT ai_trip_plans_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. attachments.created_by (FK targets public.profiles, which itself
--    cascades from auth.users, so this also blocks deletion).
ALTER TABLE public.attachments
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.attachments
  DROP CONSTRAINT IF EXISTS attachments_created_by_fkey;
ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 5. profiles.referred_by (self-FK; same cascade chain).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_referred_by_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_referred_by_fkey
    FOREIGN KEY (referred_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

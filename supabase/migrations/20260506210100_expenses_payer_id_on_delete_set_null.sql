-- =============================================================================
-- expenses.payer_id ON DELETE SET NULL
-- =============================================================================
-- The expenses table was created (migration 20260328191909) with
--   payer_id uuid NOT NULL REFERENCES auth.users(id)
-- i.e. NO ACTION on delete. When a user invokes the delete-account edge
-- function and they have ever paid for any expense on a trip they share with
-- others, auth.admin.deleteUser fails with a foreign-key violation, blocking
-- their GDPR Article 17 right to erasure.
--
-- We can't ON DELETE CASCADE the row away (that would corrupt the shared
-- trip's expense history for other members). Instead, drop NOT NULL on
-- payer_id and switch the FK to ON DELETE SET NULL. Free-text PII fields
-- (title, notes) are scrubbed by the delete-account edge function before the
-- auth user is removed; see supabase/functions/delete-account/index.ts.
--
-- NOTE (out of scope, follow-up needed): the same NO-ACTION FK problem still
-- blocks deletion for users who created/redeemed invites or share tokens, or
-- generated AI trip plans:
--   - public.invites.created_by, public.invites.redeemed_by
--   - public.trip_share_tokens.created_by
--   - public.ai_trip_plans.created_by
-- These need their own ON DELETE policy in a separate migration.
-- =============================================================================

ALTER TABLE public.expenses
  ALTER COLUMN payer_id DROP NOT NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_payer_id_fkey;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_payer_id_fkey
    FOREIGN KEY (payer_id) REFERENCES auth.users(id) ON DELETE SET NULL;

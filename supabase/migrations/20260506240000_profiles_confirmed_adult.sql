-- =============================================================================
-- profiles.confirmed_adult: capture explicit 18+ confirmation at signup
-- =============================================================================
-- The Terms of Service (src/pages/Terms.tsx, section 3) require users to be
-- 18+ but signup never asked. This adds a boolean column the new signup
-- flows write to true after the user clicks an "I confirm I am 18+"
-- checkbox.
--
-- Existing profiles (pre-launch user set is small and known-adult) are
-- backfilled to true. New rows default to false until the client sets it.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS confirmed_adult boolean NOT NULL DEFAULT false;

-- Backfill: every profile that exists at the time this migration runs is
-- treated as a known-adult pre-launch account. New signups (created after
-- this migration) will land with false until the client confirms.
UPDATE public.profiles
SET confirmed_adult = true
WHERE confirmed_adult = false;

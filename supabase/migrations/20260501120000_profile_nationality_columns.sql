-- =============================================================================
-- Profile-level nationality (refactor away from per-trip passports for accounts)
--
-- Background: trip_traveller_passports stored a row per (trip × traveller ×
-- ISO). For account-holding members that meant re-entering nationality on
-- every trip — redundant, since a person's passport doesn't change between
-- trips. Free-text travellers (group trips with non-account guests) still
-- need per-trip rows because they have no profile to anchor to.
--
-- This migration:
--   1. Adds two scalar columns on profiles: nationality_iso and
--      secondary_nationality_iso (for dual citizens). Two columns, not an
--      array, because there's only one or two and the LLM lookup is per-ISO
--      anyway — array indexing buys nothing here.
--   2. Backfills from existing data, preferring the existing
--      profiles.nationalities[] array (already populated by the More page),
--      then falling back to the most-recently-set primary trip passport, then
--      to any non-primary trip passport.
--   3. Leaves trip_traveller_passports in place — still the source of truth
--      for free-text travellers and for old trips that pre-date this change.
--   4. Note: profiles.default_currency already exists (added 20260330) and is
--      what the frontend will use for "preferred currency" — no new column
--      needed for the budget refactor (Issue B). Frontend converts at display
--      time using exchange_rate_cache.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nationality_iso text,
  ADD COLUMN IF NOT EXISTS secondary_nationality_iso text;

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_nationality_iso_length
    CHECK (nationality_iso IS NULL OR length(nationality_iso) = 2);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_secondary_nationality_iso_length
    CHECK (secondary_nationality_iso IS NULL OR length(secondary_nationality_iso) = 2);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

-- Two distinct passports — disallow the same ISO in both slots.
DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_nationality_iso_distinct
    CHECK (
      secondary_nationality_iso IS NULL
      OR nationality_iso IS NULL
      OR secondary_nationality_iso <> nationality_iso
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

-- Normalize to uppercase on write — same pattern as
-- trip_traveller_passports.normalize_passport_nationality_iso. Cache keys in
-- entry_requirements_cache are uppercase ISO; we don't want fragmentation if
-- the client sends "us" vs "US".
CREATE OR REPLACE FUNCTION public.normalize_profile_nationality_iso()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.nationality_iso IS NOT NULL THEN
    NEW.nationality_iso := upper(NEW.nationality_iso);
  END IF;
  IF NEW.secondary_nationality_iso IS NOT NULL THEN
    NEW.secondary_nationality_iso := upper(NEW.secondary_nationality_iso);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'normalize_profile_nationality_iso failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_nationality_iso_normalize ON public.profiles;
CREATE TRIGGER trg_profiles_nationality_iso_normalize
  BEFORE INSERT OR UPDATE OF nationality_iso, secondary_nationality_iso ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_nationality_iso();

-- -----------------------------------------------------------------------------
-- Backfill
--
-- Source priority per profile:
--   1. profiles.nationalities[] (existing array column, set via the More page).
--      Array index 0 → nationality_iso, index 1 → secondary_nationality_iso.
--   2. trip_traveller_passports rows for this user_id, ordered by:
--        is_primary DESC, created_at DESC
--      First row → nationality_iso, second distinct ISO → secondary.
--
-- Only fills rows where the target column is currently NULL — re-running the
-- migration is idempotent and won't clobber values entered after deploy.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  prof RECORD;
  primary_iso text;
  secondary_iso text;
BEGIN
  FOR prof IN
    SELECT id, nationalities, nationality_iso, secondary_nationality_iso
    FROM public.profiles
    WHERE nationality_iso IS NULL
  LOOP
    primary_iso := NULL;
    secondary_iso := NULL;

    -- Source 1: existing nationalities[] array.
    IF prof.nationalities IS NOT NULL AND array_length(prof.nationalities, 1) >= 1 THEN
      primary_iso := upper(btrim(prof.nationalities[1]));
      IF length(coalesce(primary_iso, '')) <> 2 THEN
        primary_iso := NULL;
      END IF;
      IF array_length(prof.nationalities, 1) >= 2 THEN
        secondary_iso := upper(btrim(prof.nationalities[2]));
        IF length(coalesce(secondary_iso, '')) <> 2
           OR secondary_iso = primary_iso THEN
          secondary_iso := NULL;
        END IF;
      END IF;
    END IF;

    -- Source 2: trip_traveller_passports — most-recent primary first.
    IF primary_iso IS NULL THEN
      SELECT upper(nationality_iso) INTO primary_iso
      FROM public.trip_traveller_passports
      WHERE user_id = prof.id
      ORDER BY is_primary DESC, created_at DESC
      LIMIT 1;
    END IF;

    -- Secondary from passports: distinct from primary, most-recent.
    IF primary_iso IS NOT NULL AND secondary_iso IS NULL THEN
      SELECT upper(nationality_iso) INTO secondary_iso
      FROM public.trip_traveller_passports
      WHERE user_id = prof.id
        AND upper(nationality_iso) <> primary_iso
      ORDER BY is_primary DESC, created_at DESC
      LIMIT 1;
    END IF;

    IF primary_iso IS NOT NULL THEN
      UPDATE public.profiles
      SET nationality_iso = primary_iso,
          secondary_nationality_iso = secondary_iso
      WHERE id = prof.id;
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'profile nationality backfill failed: %', SQLERRM;
END
$$;

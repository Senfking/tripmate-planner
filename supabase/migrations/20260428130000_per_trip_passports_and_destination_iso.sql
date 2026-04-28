-- =============================================================================
-- Per-trip traveller passports + destination ISO storage
--
-- Two related changes:
--
--   1. trips.destination_country_iso — ISO-3166-1 alpha-2 country code,
--      resolved from the Google Places result during trip generation. The
--      get-entry-requirements Edge Function consumes this when called with a
--      trip_id so the client doesn't need to convert "Tokyo, Japan" → "JP".
--
--   2. trip_traveller_passports — per-trip × traveller × passport rows.
--      Travellers may be account holders (user_id set) or free-text members
--      of a group trip (traveller_name set). Multiple passports per traveller
--      are supported (dual nationality), with one optionally flagged
--      is_primary so the UI can default sensibly.
--
-- Both columns are normalized to UPPERCASE ISO via BEFORE INSERT/UPDATE
-- triggers — keeps cache keys colliding cleanly regardless of how the client
-- supplies the input.
--
-- RLS: trip members manage their own account passports; trip owner/admin
-- manage all rows on the trip (incl. non-account travellers). Service role
-- bypasses for Edge Functions.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. trips.destination_country_iso
-- -----------------------------------------------------------------------------

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS destination_country_iso text;

DO $$
BEGIN
  ALTER TABLE public.trips
    ADD CONSTRAINT trips_destination_country_iso_length
    CHECK (destination_country_iso IS NULL OR length(destination_country_iso) = 2);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

CREATE INDEX IF NOT EXISTS idx_trips_destination_country_iso
  ON public.trips(destination_country_iso)
  WHERE destination_country_iso IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_trips_destination_country_iso()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.destination_country_iso IS NOT NULL THEN
    NEW.destination_country_iso := upper(NEW.destination_country_iso);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'normalize_trips_destination_country_iso failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trips_destination_country_iso_normalize ON public.trips;
CREATE TRIGGER trg_trips_destination_country_iso_normalize
  BEFORE INSERT OR UPDATE OF destination_country_iso ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.normalize_trips_destination_country_iso();

-- -----------------------------------------------------------------------------
-- 2. trip_traveller_passports
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trip_traveller_passports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  traveller_name text,
  nationality_iso text NOT NULL CHECK (length(nationality_iso) = 2),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Either user_id (account traveller) or traveller_name (free-text traveller)
  -- must be present. Both being null leaves the row unattributable.
  CONSTRAINT trip_traveller_passports_subject_check
    CHECK (
      user_id IS NOT NULL
      OR (traveller_name IS NOT NULL AND length(btrim(traveller_name)) > 0)
    )
);

-- One passport per (trip, account-traveller, ISO). NULLS NOT DISTINCT means
-- the constraint also collapses two account-less rows that happen to share
-- (trip_id, NULL, ISO) — but free-text travellers are further disambiguated
-- by traveller_name via the partial unique index below.
DO $$
BEGIN
  ALTER TABLE public.trip_traveller_passports
    ADD CONSTRAINT trip_traveller_passports_unique_account
    UNIQUE NULLS NOT DISTINCT (trip_id, user_id, nationality_iso);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

-- Free-text travellers: uniqueness keyed on the name so two distinct
-- non-account travellers can each hold the same passport on the same trip
-- without the unique-account constraint collapsing them.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_traveller_passports_freetext_unique
  ON public.trip_traveller_passports (trip_id, traveller_name, nationality_iso)
  WHERE user_id IS NULL;

-- At most one primary passport per traveller. Two partial indexes — Postgres
-- doesn't allow OR / CASE in the index expression cleanly, and we want
-- account vs free-text travellers handled symmetrically.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_traveller_passports_primary_account
  ON public.trip_traveller_passports (trip_id, user_id)
  WHERE is_primary AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_traveller_passports_primary_freetext
  ON public.trip_traveller_passports (trip_id, traveller_name)
  WHERE is_primary AND user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_trip_traveller_passports_trip
  ON public.trip_traveller_passports(trip_id);

ALTER TABLE public.trip_traveller_passports ENABLE ROW LEVEL SECURITY;

-- Service role bypass (Edge Functions use the service-role key for the
-- trip_id resolution path in get-entry-requirements).
CREATE POLICY "service_role_all" ON public.trip_traveller_passports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trip owner / admin can manage every row on the trip — including non-account
-- traveller rows, which only they can manage.
CREATE POLICY "trip_owner_admin_all" ON public.trip_traveller_passports
  FOR ALL TO authenticated
  USING (public.is_trip_admin_or_owner(trip_id, auth.uid()))
  WITH CHECK (public.is_trip_admin_or_owner(trip_id, auth.uid()));

-- Trip members can read / write their OWN account passports only.
CREATE POLICY "member_own_select" ON public.trip_traveller_passports
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "member_own_insert" ON public.trip_traveller_passports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "member_own_update" ON public.trip_traveller_passports
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "member_own_delete" ON public.trip_traveller_passports
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

-- Normalize nationality_iso to uppercase before insert/update so cache keys
-- don't fragment on case differences.
CREATE OR REPLACE FUNCTION public.normalize_passport_nationality_iso()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.nationality_iso IS NOT NULL THEN
    NEW.nationality_iso := upper(NEW.nationality_iso);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'normalize_passport_nationality_iso failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_traveller_passports_normalize ON public.trip_traveller_passports;
CREATE TRIGGER trg_trip_traveller_passports_normalize
  BEFORE INSERT OR UPDATE ON public.trip_traveller_passports
  FOR EACH ROW EXECUTE FUNCTION public.normalize_passport_nationality_iso();

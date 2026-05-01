-- =============================================================================
-- PR #231: split trips.name into trip_name + itinerary_title
-- =============================================================================

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS trip_name text,
  ADD COLUMN IF NOT EXISTS itinerary_title text;

UPDATE public.trips
SET trip_name = COALESCE(trip_name, name, 'Untitled trip'),
    itinerary_title = COALESCE(itinerary_title, name);

ALTER TABLE public.trips
  ALTER COLUMN trip_name SET NOT NULL;

CREATE OR REPLACE FUNCTION public.trips_backfill_name_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trip_name IS NULL THEN
    NEW.trip_name := NEW.name;
  END IF;
  IF NEW.itinerary_title IS NULL THEN
    NEW.itinerary_title := NEW.name;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'trips_backfill_name_columns failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_backfill_name_columns ON public.trips;
CREATE TRIGGER trips_backfill_name_columns
  BEFORE INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_backfill_name_columns();

COMMENT ON COLUMN public.trips.trip_name IS
  'User-given trip name. Shown in trip lists, navigation, sharing, and delete confirmations. Captured at "Create trip" time.';
COMMENT ON COLUMN public.trips.itinerary_title IS
  'AI-generated creative title (e.g. "Reykjavik''s Food & Lava: June Midnight Sun"). Used as the draft/preview title in the trip builder and as a descriptive subtitle on the trip dashboard.';

-- =============================================================================
-- PR #233: profile-level scalar nationality columns
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

    IF primary_iso IS NULL THEN
      SELECT upper(nationality_iso) INTO primary_iso
      FROM public.trip_traveller_passports
      WHERE user_id = prof.id
      ORDER BY is_primary DESC, created_at DESC
      LIMIT 1;
    END IF;

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
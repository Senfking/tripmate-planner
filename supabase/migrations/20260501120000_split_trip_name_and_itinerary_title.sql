-- Split trips.name into two distinct fields:
--   trip_name:        the user-given name shown in trip lists, navigation,
--                     sharing, and delete confirmations. Required.
--   itinerary_title:  the AI-generated creative title used as the draft/preview
--                     in the trip builder and as a descriptive subtitle on the
--                     trip dashboard. Optional.
--
-- Until now, the AI-generated creative title was written directly into
-- trips.name, which forced users to manually rename every trip if they wanted a
-- sensible identifier. With this split, the "Create trip" flow prompts users
-- for a real trip_name (defaulting to the AI title) while preserving the
-- evocative itinerary_title for the builder UI.
--
-- The legacy `name` column is retained for now so the existing frontend keeps
-- working until Lovable ships the UI-side migration to read trip_name. A
-- follow-up migration will drop `name` after the frontend cuts over.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS trip_name text,
  ADD COLUMN IF NOT EXISTS itinerary_title text;

-- Backfill: existing trips have only the AI-generated title in `name`. Treat
-- it as both the user-facing trip_name and the itinerary_title until the user
-- renames. NULL `name` rows (shouldn't exist — original schema marks NOT NULL)
-- get a safe placeholder so the NOT NULL constraint below holds.
UPDATE public.trips
SET trip_name = COALESCE(trip_name, name, 'Untitled trip'),
    itinerary_title = COALESCE(itinerary_title, name);

ALTER TABLE public.trips
  ALTER COLUMN trip_name SET NOT NULL;

-- Transition trigger: the existing frontend (BlankTripModal,
-- StandaloneTripBuilder) inserts only `name`, not `trip_name`. Until Lovable
-- ships the UI-side migration that supplies trip_name explicitly, copy `name`
-- into trip_name and itinerary_title on insert when they are not provided.
-- This keeps the new NOT NULL constraint from breaking trip creation in the
-- gap between this migration deploying and the frontend cutover.
--
-- Per CLAUDE.md hard rule: triggers must use BEGIN...EXCEPTION WHEN OTHERS
-- THEN RAISE LOG to prevent cascading failures.
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

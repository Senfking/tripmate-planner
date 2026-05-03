-- =============================================================================
-- Add curated_highlights to trip_templates.
--
-- Each highlight is a Google-Places-sourced object — we never let an LLM
-- invent venue names or place_ids. The shape of each entry is:
--   {
--     "name":        text,   -- exact Google Places displayName
--     "area":        text,   -- neighborhood / district / "Old Town" / etc.
--     "description": text,   -- ~10-14 word LLM-generated blurb
--     "place_id":    text,   -- Google Places resource id (e.g. "ChIJ...")
--     "photo_url":   text    -- pre-built places media URL with API key
--   }
--
-- Stored as jsonb (array of these objects). NULL = "not yet backfilled" so
-- the UI can keep showing the legacy fallback ("Day N · vibe day → Junto AI
-- will pick…") for any template the backfill hasn't reached.
--
-- The backfill is run via the curate-template-highlights Edge Function.
-- See the function source for ranking, filtering, and idempotency rules.
--
-- RLS: trip_templates is public-read (matching its existing policy). No
-- RLS change is needed — the new column inherits the table's policies.
-- A CHECK guard is added at the DB level so a malformed payload (non-array
-- top-level value) cannot land in the column even if a future writer
-- skips validation.
-- =============================================================================

ALTER TABLE public.trip_templates
  ADD COLUMN IF NOT EXISTS curated_highlights jsonb DEFAULT NULL;

-- Belt-and-braces: when the column is set, it must be a JSON array. NULL is
-- always allowed (the "not yet backfilled" state).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trip_templates_curated_highlights_is_array'
  ) THEN
    ALTER TABLE public.trip_templates
      ADD CONSTRAINT trip_templates_curated_highlights_is_array
      CHECK (curated_highlights IS NULL OR jsonb_typeof(curated_highlights) = 'array');
  END IF;
END
$$;

COMMENT ON COLUMN public.trip_templates.curated_highlights IS
  'Curated 6-8 Google-Places-backed experience highlights for the destination. Array of {name, area, description, place_id, photo_url}. NULL means the curate-template-highlights backfill has not run for this template yet.';

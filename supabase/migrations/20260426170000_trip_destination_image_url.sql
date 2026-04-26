-- Add destination_image_url to trips for AI-resolved per-destination cover images.
--
-- Populated by the generate-trip-itinerary Edge Function from Google Place Photos,
-- with Wikimedia Commons as a no-key fallback. This is distinct from
-- cover_image_path (the user-uploaded cover). Display priority used by the
-- frontend (src/lib/tripPhoto.ts):
--   cover_image_path > destination_image_url > legacy keyword fallback > default
--
-- Existing trips are NOT backfilled by this migration. Only newly generated
-- trips populate the column. TODO(admin-backfill): one-shot script that walks
-- existing trips lacking both cover_image_path and destination_image_url and
-- resolves a Place Photo for each.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS destination_image_url text;

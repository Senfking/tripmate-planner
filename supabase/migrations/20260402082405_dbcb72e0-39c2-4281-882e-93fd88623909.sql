ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS destination text;

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb
  NOT NULL DEFAULT '{"decisions": true, "itinerary": true, "expenses": true, "bookings": true}'::jsonb;
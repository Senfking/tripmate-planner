ALTER TABLE public.trip_templates
  ADD COLUMN IF NOT EXISTS curated_highlights jsonb;
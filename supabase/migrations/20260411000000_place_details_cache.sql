-- Cache table for Google Places API (New) responses used by the
-- get-place-details Edge Function. Entries are keyed by query_text and
-- refreshed after 30 days (enforced in the Edge Function).
CREATE TABLE public.place_details_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL UNIQUE,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_place_details_cache_query_text ON public.place_details_cache(query_text);
CREATE INDEX idx_place_details_cache_created_at ON public.place_details_cache(created_at);

ALTER TABLE public.place_details_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_details_cache_select" ON public.place_details_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "place_details_cache_insert" ON public.place_details_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

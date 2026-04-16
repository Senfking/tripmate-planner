-- Junto Ideas Board: shared "ideas bucket" per trip
-- Tables: trip_ideas, trip_idea_votes

-- ============================================================
-- 1. trip_ideas
-- ============================================================
CREATE TABLE public.trip_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  google_place_id text,
  photo_url text,
  rating numeric,
  user_ratings_total integer,
  address text,
  coordinates jsonb,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'concierge', 'ai_builder', 'social')),
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'planned', 'dismissed')),
  itinerary_item_id uuid REFERENCES public.itinerary_items(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_ideas_trip_status ON public.trip_ideas (trip_id, status);
CREATE INDEX idx_trip_ideas_trip_category ON public.trip_ideas (trip_id, category);
CREATE INDEX idx_trip_ideas_added_by ON public.trip_ideas (added_by);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.handle_trip_ideas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_trip_ideas_updated_at failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_trip_ideas_updated_at
  BEFORE UPDATE ON public.trip_ideas
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_trip_ideas_updated_at();

-- ============================================================
-- 2. trip_idea_votes
-- ============================================================
CREATE TABLE public.trip_idea_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES public.trip_ideas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idea_id, user_id)
);

CREATE INDEX idx_trip_idea_votes_idea ON public.trip_idea_votes (idea_id);

-- ============================================================
-- 3. RLS — trip_ideas
-- ============================================================
ALTER TABLE public.trip_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_ideas_select" ON public.trip_ideas
  FOR SELECT TO authenticated
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "trip_ideas_insert" ON public.trip_ideas
  FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND is_trip_member(trip_id, auth.uid())
  );

CREATE POLICY "trip_ideas_update" ON public.trip_ideas
  FOR UPDATE TO authenticated
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "trip_ideas_delete" ON public.trip_ideas
  FOR DELETE TO authenticated
  USING (
    added_by = auth.uid()
    OR is_trip_admin_or_owner(trip_id, auth.uid())
  );

-- ============================================================
-- 4. RLS — trip_idea_votes
-- ============================================================
ALTER TABLE public.trip_idea_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_idea_votes_select" ON public.trip_idea_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_ideas ti
      WHERE ti.id = idea_id
        AND is_trip_member(ti.trip_id, auth.uid())
    )
  );

CREATE POLICY "trip_idea_votes_insert" ON public.trip_idea_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trip_ideas ti
      WHERE ti.id = idea_id
        AND is_trip_member(ti.trip_id, auth.uid())
    )
  );

CREATE POLICY "trip_idea_votes_delete" ON public.trip_idea_votes
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trip_ideas ti
      WHERE ti.id = idea_id
        AND is_trip_member(ti.trip_id, auth.uid())
    )
  );

-- ============================================================
-- 5. Realtime
-- ============================================================
-- REPLICA IDENTITY FULL required for realtime DELETE events
ALTER TABLE public.trip_ideas REPLICA IDENTITY FULL;
ALTER TABLE public.trip_idea_votes REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.trip_ideas,
  public.trip_idea_votes;

CREATE OR REPLACE FUNCTION public.set_trip_ideas_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.trip_ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  category TEXT,
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trip_ideas_trip ON public.trip_ideas(trip_id, created_at DESC);
ALTER TABLE public.trip_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip_ideas_select" ON public.trip_ideas FOR SELECT TO authenticated
  USING (is_trip_member(trip_id, auth.uid()));
CREATE POLICY "trip_ideas_insert" ON public.trip_ideas FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND is_trip_member(trip_id, auth.uid()));
CREATE POLICY "trip_ideas_update" ON public.trip_ideas FOR UPDATE TO authenticated
  USING (is_trip_member(trip_id, auth.uid()));
CREATE POLICY "trip_ideas_delete" ON public.trip_ideas FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR is_trip_admin_or_owner(trip_id, auth.uid()));
CREATE TRIGGER update_trip_ideas_updated_at BEFORE UPDATE ON public.trip_ideas
  FOR EACH ROW EXECUTE FUNCTION public.set_trip_ideas_updated_at();

CREATE TABLE public.trip_idea_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  idea_id UUID NOT NULL REFERENCES public.trip_ideas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idea_id, user_id)
);
CREATE INDEX idx_trip_idea_votes_idea ON public.trip_idea_votes(idea_id);
ALTER TABLE public.trip_idea_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip_idea_votes_select" ON public.trip_idea_votes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.trip_ideas i WHERE i.id = idea_id AND is_trip_member(i.trip_id, auth.uid())));
CREATE POLICY "trip_idea_votes_insert" ON public.trip_idea_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.trip_ideas i WHERE i.id = idea_id AND is_trip_member(i.trip_id, auth.uid())));
CREATE POLICY "trip_idea_votes_delete" ON public.trip_idea_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.trip_ideas REPLICA IDENTITY FULL;
ALTER TABLE public.trip_idea_votes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_ideas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_idea_votes;
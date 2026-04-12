-- Junto Concierge: conversational activity finder for trips
-- Tables: concierge_messages, concierge_reactions

-- ============================================================
-- 1. concierge_messages
-- ============================================================
CREATE TABLE public.concierge_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  suggestions jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_concierge_messages_trip_created
  ON public.concierge_messages (trip_id, created_at);

ALTER TABLE public.concierge_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concierge_messages_select" ON public.concierge_messages
  FOR SELECT TO authenticated
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "concierge_messages_insert" ON public.concierge_messages
  FOR INSERT TO authenticated
  WITH CHECK (is_trip_member(trip_id, auth.uid()));

-- ============================================================
-- 2. concierge_reactions
-- ============================================================
CREATE TABLE public.concierge_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.concierge_messages(id) ON DELETE CASCADE,
  suggestion_index integer NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, suggestion_index, user_id)
);

ALTER TABLE public.concierge_reactions ENABLE ROW LEVEL SECURITY;

-- Trip membership via join to concierge_messages
CREATE POLICY "concierge_reactions_select" ON public.concierge_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.concierge_messages cm
      WHERE cm.id = message_id
        AND is_trip_member(cm.trip_id, auth.uid())
    )
  );

CREATE POLICY "concierge_reactions_insert" ON public.concierge_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.concierge_messages cm
      WHERE cm.id = message_id
        AND is_trip_member(cm.trip_id, auth.uid())
    )
  );

CREATE POLICY "concierge_reactions_delete" ON public.concierge_reactions
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.concierge_messages cm
      WHERE cm.id = message_id
        AND is_trip_member(cm.trip_id, auth.uid())
    )
  );

-- ============================================================
-- 3. Enable Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.concierge_messages,
  public.concierge_reactions;


-- Concierge messages table
CREATE TABLE public.concierge_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid,
  role text NOT NULL DEFAULT 'user',
  content text,
  suggestions jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.concierge_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concierge_messages_select" ON public.concierge_messages
  FOR SELECT TO authenticated
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "concierge_messages_insert" ON public.concierge_messages
  FOR INSERT TO authenticated
  WITH CHECK (is_trip_member(trip_id, auth.uid()));

CREATE INDEX idx_concierge_messages_trip ON public.concierge_messages(trip_id, created_at DESC);

-- Concierge reactions table
CREATE TABLE public.concierge_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.concierge_messages(id) ON DELETE CASCADE,
  suggestion_index integer NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, suggestion_index, user_id)
);

ALTER TABLE public.concierge_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concierge_reactions_select" ON public.concierge_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM concierge_messages cm
    WHERE cm.id = concierge_reactions.message_id
    AND is_trip_member(cm.trip_id, auth.uid())
  ));

CREATE POLICY "concierge_reactions_insert" ON public.concierge_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM concierge_messages cm
      WHERE cm.id = concierge_reactions.message_id
      AND is_trip_member(cm.trip_id, auth.uid())
    )
  );

CREATE POLICY "concierge_reactions_delete" ON public.concierge_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.concierge_reactions;

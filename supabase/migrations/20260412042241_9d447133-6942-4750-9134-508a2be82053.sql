-- Plan activity reactions (emoji responses to individual activities within an AI trip plan)
CREATE TABLE public.plan_activity_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.ai_trip_plans(id) ON DELETE CASCADE,
  activity_key text NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL CHECK (emoji IN ('👍', '👎', '🔥', '🤔')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, activity_key, user_id, emoji)
);

CREATE INDEX idx_plan_activity_reactions_plan_activity
  ON public.plan_activity_reactions (plan_id, activity_key);

ALTER TABLE public.plan_activity_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_activity_reactions_select"
  ON public.plan_activity_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_trip_plans
    WHERE ai_trip_plans.id = plan_activity_reactions.plan_id
      AND public.is_trip_member(ai_trip_plans.trip_id, auth.uid())
  ));

CREATE POLICY "plan_activity_reactions_insert"
  ON public.plan_activity_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ai_trip_plans
      WHERE ai_trip_plans.id = plan_activity_reactions.plan_id
        AND public.is_trip_member(ai_trip_plans.trip_id, auth.uid())
    )
  );

CREATE POLICY "plan_activity_reactions_delete"
  ON public.plan_activity_reactions
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ai_trip_plans
      WHERE ai_trip_plans.id = plan_activity_reactions.plan_id
        AND public.is_trip_member(ai_trip_plans.trip_id, auth.uid())
    )
  );

-- Plan activity comments (text comments on individual activities within an AI trip plan)
CREATE TABLE public.plan_activity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.ai_trip_plans(id) ON DELETE CASCADE,
  activity_key text NOT NULL,
  user_id uuid NOT NULL,
  text text NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_activity_comments_plan_activity
  ON public.plan_activity_comments (plan_id, activity_key);

ALTER TABLE public.plan_activity_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_activity_comments_select"
  ON public.plan_activity_comments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_trip_plans
    WHERE ai_trip_plans.id = plan_activity_comments.plan_id
      AND public.is_trip_member(ai_trip_plans.trip_id, auth.uid())
  ));

CREATE POLICY "plan_activity_comments_insert"
  ON public.plan_activity_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.ai_trip_plans
      WHERE ai_trip_plans.id = plan_activity_comments.plan_id
        AND public.is_trip_member(ai_trip_plans.trip_id, auth.uid())
    )
  );

CREATE POLICY "plan_activity_comments_delete"
  ON public.plan_activity_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
  );

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_activity_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_activity_comments;
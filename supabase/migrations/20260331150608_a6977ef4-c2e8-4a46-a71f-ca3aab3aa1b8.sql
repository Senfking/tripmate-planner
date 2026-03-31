CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  body text,
  rating smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_insert_own" ON public.feedback
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "feedback_select_own" ON public.feedback
  FOR SELECT TO authenticated USING (user_id = auth.uid());
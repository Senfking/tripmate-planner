-- Create ai_trip_plans table to persist AI-generated trip plans produced
-- by the generate-trip-itinerary Edge Function. The prompt column stores
-- the questionnaire answers (destination, dates, budget, vibes, etc.)
-- and the result column stores the full normalized AI response.

CREATE TABLE public.ai_trip_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  prompt jsonb NOT NULL,
  result jsonb NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_trip_plans_trip_id ON public.ai_trip_plans(trip_id);

ALTER TABLE public.ai_trip_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_trip_plans_select" ON public.ai_trip_plans
  FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()) OR is_public = true);

CREATE POLICY "ai_trip_plans_insert" ON public.ai_trip_plans
  FOR INSERT TO authenticated
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY "ai_trip_plans_update" ON public.ai_trip_plans
  FOR UPDATE TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "ai_trip_plans_delete" ON public.ai_trip_plans
  FOR DELETE TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

-- Allow ai_trip_plans to exist without a trip (drafts)
ALTER TABLE public.ai_trip_plans ALTER COLUMN trip_id DROP NOT NULL;

-- Update RLS to allow users to manage their own drafts (no trip_id)
DROP POLICY IF EXISTS "ai_trip_plans_select" ON public.ai_trip_plans;
CREATE POLICY "ai_trip_plans_select" ON public.ai_trip_plans
  FOR SELECT TO authenticated
  USING (
    (trip_id IS NOT NULL AND is_trip_member(trip_id, auth.uid()))
    OR (trip_id IS NULL AND created_by = auth.uid())
    OR (is_public = true)
  );

DROP POLICY IF EXISTS "ai_trip_plans_insert" ON public.ai_trip_plans;
CREATE POLICY "ai_trip_plans_insert" ON public.ai_trip_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      trip_id IS NULL
      OR is_trip_member(trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "ai_trip_plans_update" ON public.ai_trip_plans;
CREATE POLICY "ai_trip_plans_update" ON public.ai_trip_plans
  FOR UPDATE TO authenticated
  USING (
    (trip_id IS NOT NULL AND is_trip_member(trip_id, auth.uid()))
    OR (trip_id IS NULL AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "ai_trip_plans_delete" ON public.ai_trip_plans;
CREATE POLICY "ai_trip_plans_delete" ON public.ai_trip_plans
  FOR DELETE TO authenticated
  USING (
    (trip_id IS NOT NULL AND is_trip_member(trip_id, auth.uid()))
    OR (trip_id IS NULL AND created_by = auth.uid())
  );

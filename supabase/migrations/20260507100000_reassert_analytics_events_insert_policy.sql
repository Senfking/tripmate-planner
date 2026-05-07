-- Re-assert the analytics_events INSERT policy.
--
-- Production was returning "new row violates row-level security policy"
-- (Postgres 42501) on inserts from the trackEvent() helper for fully
-- authenticated users. The repo migration 20260403130000_fix_analytics_anon_insert.sql
-- defines a correct policy that permits both:
--   - authenticated role inserting their own user_id (or NULL)
--   - anon role inserting NULL user_id
-- but the deployed schema appears to have drifted. We DROP IF EXISTS and
-- recreate so this migration is safe to re-run against any prior state.

DROP POLICY IF EXISTS "Users can insert own events" ON public.analytics_events;

CREATE POLICY "Users can insert own events"
  ON public.analytics_events FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    (auth.role() = 'authenticated' AND (user_id = auth.uid() OR user_id IS NULL))
    OR
    (auth.role() = 'anon' AND user_id IS NULL)
  );

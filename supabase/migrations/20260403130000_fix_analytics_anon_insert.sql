-- Fix: Allow anonymous (unauthenticated) visitors to insert analytics events
-- with user_id = NULL. Previously the INSERT policy only applied to the
-- "authenticated" role, so landing-page tracking silently failed.

DROP POLICY IF EXISTS "Users can insert own events" ON public.analytics_events;

CREATE POLICY "Users can insert own events"
  ON public.analytics_events FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    (auth.role() = 'authenticated' AND (user_id = auth.uid() OR user_id IS NULL))
    OR
    (auth.role() = 'anon' AND user_id IS NULL)
  );

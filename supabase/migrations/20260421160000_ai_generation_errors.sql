-- =============================================================================
-- ai_generation_errors
--
-- Captures every failed AI trip generation so we can debug without relying on
-- client-side DevTools. Only the service-role (Edge Functions) writes, and
-- only the admin user reads. No RLS policy for end-users is needed — in fact
-- we want to make sure no authenticated user can select these rows because
-- error_raw may contain parsed intent / notes that include free-text input.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_generation_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  destination text,
  step text,
  error_message text,
  error_raw jsonb,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_errors_created_at
  ON public.ai_generation_errors(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_generation_errors_step
  ON public.ai_generation_errors(step);

ALTER TABLE public.ai_generation_errors ENABLE ROW LEVEL SECURITY;

-- Service role (Edge Functions) — full access.
CREATE POLICY "service_role_all" ON public.ai_generation_errors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admin selects these rows through the existing admin-query Edge Function,
-- which runs with the service-role key, so no authenticated-user policy is
-- required. Omitting one keeps the table invisible to regular users.

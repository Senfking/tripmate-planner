-- Replay of 20260502120000_trip_status_drafts.sql

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('draft', 'active', 'archived'));

CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);

DROP POLICY IF EXISTS "trips_select_member" ON public.trips;
CREATE POLICY "trips_select_member" ON public.trips
  FOR SELECT
  TO authenticated
  USING (
    public.is_trip_member(id, auth.uid())
    AND (
      status <> 'draft'
      OR public.is_trip_admin_or_owner(id, auth.uid())
    )
  );

COMMENT ON COLUMN public.trips.status IS
  'Lifecycle status. draft = AI builder result not yet promoted (visible only to creator); active = user-confirmed trip (default for all existing rows and for legacy code paths that omit status); archived = reserved for future archive UX.';

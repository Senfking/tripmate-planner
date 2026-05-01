-- Add a lifecycle `status` column to trips so AI-builder results can be
-- persisted at a real URL (/app/trips/[id]) before the user has confirmed
-- they want to keep them.
--
--   draft    — AI-generated trip plan, not yet promoted by the user.
--              Visible only to the creator. The trip dashboard renders the
--              builder result UI for this row (Lovable PR) instead of the
--              regular dashboard. Promotion = UPDATE status = 'active'.
--   active   — User-confirmed trip. Default for every existing row, and the
--              default for new rows so legacy code paths that omit `status`
--              continue to land here.
--   archived — Reserved for a future archive UX. Not yet user-reachable.
--
-- Drafts are intentionally not auto-deleted — see the trip-builder spec.
-- Storage is cheap and drafts represent real user work; users delete them
-- manually from the trip list.

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('draft', 'active', 'archived'));

CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);

-- Defense in depth on RLS: drafts must only be visible to their creator
-- (owner/admin). Membership-based RLS already accomplishes this implicitly
-- because drafts have no other members until promoted, but an explicit
-- clause means a future bug that grants membership on a draft (e.g. an
-- accidental invite acceptance, or a share token leaking through a partial
-- promotion) cannot leak the private draft. Once status flips to 'active'
-- or 'archived', sharing/invite logic resumes its normal path.

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

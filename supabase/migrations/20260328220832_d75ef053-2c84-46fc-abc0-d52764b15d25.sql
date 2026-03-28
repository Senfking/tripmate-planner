-- 1. Alter trip_proposals: drop NOT NULL on dates, add confirmed_date_option_id
ALTER TABLE public.trip_proposals
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL,
  ALTER COLUMN start_date SET DEFAULT NULL,
  ALTER COLUMN end_date SET DEFAULT NULL,
  ADD COLUMN confirmed_date_option_id uuid;

-- 2. Create proposal_date_options table
CREATE TABLE public.proposal_date_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.trip_proposals(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_proposals
  ADD CONSTRAINT trip_proposals_confirmed_date_option_fkey
  FOREIGN KEY (confirmed_date_option_id) REFERENCES public.proposal_date_options(id);

-- 3. Create date_option_votes table
CREATE TABLE public.date_option_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_option_id uuid NOT NULL REFERENCES public.proposal_date_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  value text NOT NULL,
  UNIQUE(date_option_id, user_id)
);

-- 4. Add DELETE policy on trip_proposals
CREATE POLICY "proposals_delete" ON public.trip_proposals
  FOR DELETE
  USING (
    (created_by = auth.uid() AND NOT EXISTS (
      SELECT 1 FROM public.proposal_reactions pr WHERE pr.proposal_id = trip_proposals.id
    ))
    OR is_trip_admin_or_owner(trip_id, auth.uid())
  );

-- 5. RLS for proposal_date_options
ALTER TABLE public.proposal_date_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "date_options_select" ON public.proposal_date_options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.trip_proposals tp
      WHERE tp.id = proposal_date_options.proposal_id
        AND is_trip_member(tp.trip_id, auth.uid())
    )
  );

CREATE POLICY "date_options_insert" ON public.proposal_date_options
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trip_proposals tp
      WHERE tp.id = proposal_date_options.proposal_id
        AND is_trip_member(tp.trip_id, auth.uid())
    )
  );

CREATE POLICY "date_options_delete" ON public.proposal_date_options
  FOR DELETE USING (
    (created_by = auth.uid() AND NOT EXISTS (
      SELECT 1 FROM public.date_option_votes dv WHERE dv.date_option_id = proposal_date_options.id
    ))
    OR EXISTS (
      SELECT 1 FROM public.trip_proposals tp
      WHERE tp.id = proposal_date_options.proposal_id
        AND is_trip_admin_or_owner(tp.trip_id, auth.uid())
    )
  );

-- 6. RLS for date_option_votes
ALTER TABLE public.date_option_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "date_votes_select" ON public.date_option_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.proposal_date_options pdo
      JOIN public.trip_proposals tp ON tp.id = pdo.proposal_id
      WHERE pdo.id = date_option_votes.date_option_id
        AND is_trip_member(tp.trip_id, auth.uid())
    )
  );

CREATE POLICY "date_votes_insert" ON public.date_option_votes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.proposal_date_options pdo
      JOIN public.trip_proposals tp ON tp.id = pdo.proposal_id
      WHERE pdo.id = date_option_votes.date_option_id
        AND is_trip_member(tp.trip_id, auth.uid())
    )
  );

CREATE POLICY "date_votes_update" ON public.date_option_votes
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "date_votes_delete" ON public.date_option_votes
  FOR DELETE USING (user_id = auth.uid());

-- 7. RPC: get date option vote counts for a trip
CREATE OR REPLACE FUNCTION public.get_date_option_vote_counts(_trip_id uuid)
RETURNS TABLE(date_option_id uuid, value text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dv.date_option_id, dv.value, count(*)::bigint
  FROM date_option_votes dv
  JOIN proposal_date_options pdo ON pdo.id = dv.date_option_id
  JOIN trip_proposals tp ON tp.id = pdo.proposal_id
  WHERE tp.trip_id = _trip_id
  GROUP BY dv.date_option_id, dv.value;
$$;

-- trip_proposals table
CREATE TABLE public.trip_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  destination text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  adopted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposals_select" ON public.trip_proposals
  FOR SELECT TO authenticated
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "proposals_insert" ON public.trip_proposals
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND is_trip_member(trip_id, auth.uid()));

CREATE POLICY "proposals_update" ON public.trip_proposals
  FOR UPDATE TO authenticated
  USING (is_trip_admin_or_owner(trip_id, auth.uid()));

-- proposal_reactions table
CREATE TABLE public.proposal_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.trip_proposals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  value text NOT NULL CHECK (value IN ('in', 'maybe', 'no')),
  UNIQUE (proposal_id, user_id)
);

ALTER TABLE public.proposal_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select" ON public.proposal_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trip_proposals tp
    WHERE tp.id = proposal_reactions.proposal_id
      AND is_trip_member(tp.trip_id, auth.uid())
  ));

CREATE POLICY "reactions_insert" ON public.proposal_reactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.trip_proposals tp
    WHERE tp.id = proposal_reactions.proposal_id
      AND is_trip_member(tp.trip_id, auth.uid())
  ));

CREATE POLICY "reactions_update" ON public.proposal_reactions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "reactions_delete" ON public.proposal_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Unique index on votes for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS votes_option_user_unique ON public.votes (poll_option_id, user_id);

-- Batched reaction counts per trip
CREATE OR REPLACE FUNCTION public.get_trip_proposal_reaction_counts(_trip_id uuid)
RETURNS TABLE(proposal_id uuid, value text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.proposal_id, pr.value, count(*)
  FROM public.proposal_reactions pr
  JOIN public.trip_proposals tp ON tp.id = pr.proposal_id
  WHERE tp.trip_id = _trip_id
    AND is_trip_member(_trip_id, auth.uid())
  GROUP BY pr.proposal_id, pr.value;
$$;

-- Poll vote counts (anonymous tallies)
CREATE OR REPLACE FUNCTION public.get_poll_vote_counts(_poll_id uuid)
RETURNS TABLE(poll_option_id uuid, value text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.poll_option_id, v.value, count(*)
  FROM public.votes v
  JOIN public.poll_options po ON po.id = v.poll_option_id
  JOIN public.polls p ON p.id = po.poll_id
  WHERE po.poll_id = _poll_id
    AND is_trip_member(p.trip_id, auth.uid())
  GROUP BY v.poll_option_id, v.value;
$$;

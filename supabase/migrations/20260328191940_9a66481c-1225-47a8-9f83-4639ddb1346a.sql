
-- Enable RLS on all 12 tables
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_share_tokens ENABLE ROW LEVEL SECURITY;

-- ======= TRIPS =======
CREATE POLICY "trips_select_member" ON public.trips FOR SELECT TO authenticated
  USING (public.is_trip_member(id, auth.uid()));

CREATE POLICY "trips_insert_authenticated" ON public.trips FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "trips_update_member" ON public.trips FOR UPDATE TO authenticated
  USING (public.is_trip_member(id, auth.uid()));

CREATE POLICY "trips_delete_admin" ON public.trips FOR DELETE TO authenticated
  USING (public.is_trip_admin_or_owner(id, auth.uid()));

-- ======= TRIP_MEMBERS =======
CREATE POLICY "trip_members_select" ON public.trip_members FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "trip_members_insert_member" ON public.trip_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.invites
      WHERE invites.trip_id = trip_members.trip_id
        AND invites.redeemed_at IS NULL
        AND invites.expires_at > now()
        AND trip_members.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_members_update_own" ON public.trip_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "trip_members_delete_admin" ON public.trip_members FOR DELETE TO authenticated
  USING (public.is_trip_admin_or_owner(trip_id, auth.uid()));

-- ======= INVITES =======
CREATE POLICY "invites_select" ON public.invites FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "invites_insert" ON public.invites FOR INSERT TO authenticated
  WITH CHECK (public.is_trip_admin_or_owner(trip_id, auth.uid()));

CREATE POLICY "invites_update" ON public.invites FOR UPDATE TO authenticated
  USING (public.is_trip_admin_or_owner(trip_id, auth.uid()));

CREATE POLICY "invites_delete" ON public.invites FOR DELETE TO authenticated
  USING (public.is_trip_admin_or_owner(trip_id, auth.uid()));

-- ======= POLLS =======
CREATE POLICY "polls_select" ON public.polls FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "polls_insert" ON public.polls FOR INSERT TO authenticated
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "polls_update" ON public.polls FOR UPDATE TO authenticated
  USING (public.is_trip_admin_or_owner(trip_id, auth.uid()));

CREATE POLICY "polls_delete" ON public.polls FOR DELETE TO authenticated
  USING (public.is_trip_admin_or_owner(trip_id, auth.uid()));

-- ======= POLL_OPTIONS =======
CREATE POLICY "poll_options_select" ON public.poll_options FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.polls WHERE polls.id = poll_options.poll_id AND public.is_trip_member(polls.trip_id, auth.uid())));

CREATE POLICY "poll_options_insert" ON public.poll_options FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.polls WHERE polls.id = poll_options.poll_id AND public.is_trip_member(polls.trip_id, auth.uid())));

CREATE POLICY "poll_options_update" ON public.poll_options FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.polls WHERE polls.id = poll_options.poll_id AND public.is_trip_member(polls.trip_id, auth.uid())));

CREATE POLICY "poll_options_delete" ON public.poll_options FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.polls WHERE polls.id = poll_options.poll_id AND public.is_trip_member(polls.trip_id, auth.uid())));

-- ======= VOTES =======
CREATE POLICY "votes_select" ON public.votes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.poll_options JOIN public.polls ON polls.id = poll_options.poll_id WHERE poll_options.id = votes.poll_option_id AND public.is_trip_member(polls.trip_id, auth.uid())));

CREATE POLICY "votes_insert" ON public.votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.poll_options JOIN public.polls ON polls.id = poll_options.poll_id WHERE poll_options.id = votes.poll_option_id AND public.is_trip_member(polls.trip_id, auth.uid())));

CREATE POLICY "votes_update" ON public.votes FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "votes_delete" ON public.votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ======= ITINERARY_ITEMS =======
CREATE POLICY "itinerary_select" ON public.itinerary_items FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "itinerary_insert" ON public.itinerary_items FOR INSERT TO authenticated
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "itinerary_update" ON public.itinerary_items FOR UPDATE TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "itinerary_delete" ON public.itinerary_items FOR DELETE TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ======= ATTACHMENTS =======
CREATE POLICY "attachments_select" ON public.attachments FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "attachments_insert" ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "attachments_update" ON public.attachments FOR UPDATE TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "attachments_delete" ON public.attachments FOR DELETE TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ======= COMMENTS =======
CREATE POLICY "comments_select" ON public.comments FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "comments_insert" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "comments_update" ON public.comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "comments_delete" ON public.comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

-- ======= EXPENSES =======
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ======= EXPENSE_SPLITS =======
CREATE POLICY "splits_select" ON public.expense_splits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses WHERE expenses.id = expense_splits.expense_id AND public.is_trip_member(expenses.trip_id, auth.uid())));

CREATE POLICY "splits_insert" ON public.expense_splits FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses WHERE expenses.id = expense_splits.expense_id AND public.is_trip_member(expenses.trip_id, auth.uid())));

CREATE POLICY "splits_update" ON public.expense_splits FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses WHERE expenses.id = expense_splits.expense_id AND public.is_trip_member(expenses.trip_id, auth.uid())));

CREATE POLICY "splits_delete" ON public.expense_splits FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses WHERE expenses.id = expense_splits.expense_id AND public.is_trip_member(expenses.trip_id, auth.uid())));

-- ======= TRIP_SHARE_TOKENS =======
CREATE POLICY "share_tokens_select" ON public.trip_share_tokens FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "share_tokens_insert" ON public.trip_share_tokens FOR INSERT TO authenticated
  WITH CHECK (public.is_trip_admin_or_owner(trip_id, auth.uid()));

CREATE POLICY "share_tokens_update" ON public.trip_share_tokens FOR UPDATE TO authenticated
  USING (public.is_trip_admin_or_owner(trip_id, auth.uid()));

CREATE POLICY "share_tokens_delete" ON public.trip_share_tokens FOR DELETE TO authenticated
  USING (public.is_trip_admin_or_owner(trip_id, auth.uid()));

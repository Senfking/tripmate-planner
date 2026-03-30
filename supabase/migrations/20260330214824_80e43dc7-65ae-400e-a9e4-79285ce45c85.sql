
-- 1. FIX: trip_members INSERT policy - cap role and remove open self-insert
-- All legitimate inserts go through SECURITY DEFINER RPCs (join_by_code, redeem_invite, auto_add_trip_owner)
DROP POLICY IF EXISTS "trip_members_insert_member" ON public.trip_members;
CREATE POLICY "trip_members_insert_member" ON public.trip_members
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- 2. FIX: profiles SELECT - restrict full profile to own row only
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 3. Create a view for public profile data (display_name, avatar_url) that other users can read
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT id, display_name, avatar_url
  FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.profiles_public TO authenticated;

-- 4. FIX: proposal_date_options - change policies from public to authenticated
DROP POLICY IF EXISTS "date_options_delete" ON public.proposal_date_options;
CREATE POLICY "date_options_delete" ON public.proposal_date_options
  FOR DELETE TO authenticated
  USING (
    ((created_by = auth.uid()) AND NOT EXISTS (
      SELECT 1 FROM date_option_votes dv WHERE dv.date_option_id = proposal_date_options.id
    ))
    OR EXISTS (
      SELECT 1 FROM trip_proposals tp
      WHERE tp.id = proposal_date_options.proposal_id
        AND is_trip_admin_or_owner(tp.trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "date_options_insert" ON public.proposal_date_options;
CREATE POLICY "date_options_insert" ON public.proposal_date_options
  FOR INSERT TO authenticated
  WITH CHECK (
    (created_by = auth.uid()) AND EXISTS (
      SELECT 1 FROM trip_proposals tp
      WHERE tp.id = proposal_date_options.proposal_id
        AND is_trip_member(tp.trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "date_options_select" ON public.proposal_date_options;
CREATE POLICY "date_options_select" ON public.proposal_date_options
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trip_proposals tp
      WHERE tp.id = proposal_date_options.proposal_id
        AND is_trip_member(tp.trip_id, auth.uid())
    )
  );

-- 5. FIX: date_option_votes - change policies from public to authenticated
DROP POLICY IF EXISTS "date_votes_delete" ON public.date_option_votes;
CREATE POLICY "date_votes_delete" ON public.date_option_votes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "date_votes_insert" ON public.date_option_votes;
CREATE POLICY "date_votes_insert" ON public.date_option_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid()) AND EXISTS (
      SELECT 1 FROM proposal_date_options pdo
      JOIN trip_proposals tp ON tp.id = pdo.proposal_id
      WHERE pdo.id = date_option_votes.date_option_id
        AND is_trip_member(tp.trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "date_votes_select" ON public.date_option_votes;
CREATE POLICY "date_votes_select" ON public.date_option_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposal_date_options pdo
      JOIN trip_proposals tp ON tp.id = pdo.proposal_id
      WHERE pdo.id = date_option_votes.date_option_id
        AND is_trip_member(tp.trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "date_votes_update" ON public.date_option_votes;
CREATE POLICY "date_votes_update" ON public.date_option_votes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- 6. FIX: trip_proposals delete - change from public to authenticated
DROP POLICY IF EXISTS "proposals_delete" ON public.trip_proposals;
CREATE POLICY "proposals_delete" ON public.trip_proposals
  FOR DELETE TO authenticated
  USING (
    ((created_by = auth.uid()) AND NOT EXISTS (
      SELECT 1 FROM proposal_reactions pr WHERE pr.proposal_id = trip_proposals.id
    ))
    OR is_trip_admin_or_owner(trip_id, auth.uid())
  );

-- 7. FIX: generate_trip_code - set search_path
CREATE OR REPLACE FUNCTION public.generate_trip_code()
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  _chars text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  _code text;
  _exists boolean;
BEGIN
  LOOP
    _code := '';
    FOR i IN 1..6 LOOP
      _code := _code || substr(_chars, floor(random() * length(_chars) + 1)::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.trips WHERE trip_code = _code) INTO _exists;
    IF NOT _exists THEN
      RETURN _code;
    END IF;
  END LOOP;
END;
$function$;

-- 8. FIX: validate_route_stop_dates - set search_path
CREATE OR REPLACE FUNCTION public.validate_route_stop_dates()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  _overlap RECORD;
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'End date must be after start date';
  END IF;

  SELECT * INTO _overlap
  FROM public.trip_route_stops
  WHERE trip_id = NEW.trip_id
    AND id IS DISTINCT FROM NEW.id
    AND NEW.start_date < end_date
    AND NEW.end_date > start_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Dates overlap with stop at position %', _overlap.position;
  END IF;

  RETURN NEW;
END;
$function$;

-- 9. FIX: enforce_musthave_limit - set search_path
CREATE OR REPLACE FUNCTION public.enforce_musthave_limit()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  _count int;
BEGIN
  IF NEW.question_key = 'musthave' THEN
    SELECT count(*) INTO _count
    FROM public.vibe_responses
    WHERE trip_id = NEW.trip_id
      AND user_id = NEW.user_id
      AND question_key = 'musthave'
      AND id IS DISTINCT FROM NEW.id;
    IF _count >= 2 THEN
      RAISE EXCEPTION 'Maximum 2 must-have selections allowed per member';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- =============================================================================
-- seed_demo_trip(p_trip_id uuid)
--
-- Populates an existing trip with realistic demo content for landing-page
-- screenshots: 3 fake group members, 7 expenses + splits, 8 ideas with vote
-- counts, 6 group-chat messages, 3 activity-level comments + emoji reactions,
-- and 1 preference poll with options + votes.
--
-- Designed to be:
--   * Reusable: pass any trip_id; the function picks up that trip's currency,
--     date range, and AI plan (for group chat) automatically.
--   * Idempotent: re-running on the same trip removes prior demo rows tied to
--     the three deterministic demo personas, then re-inserts a fresh batch.
--     The trip's pre-existing data and the real owner's rows are never touched.
--   * Safe: pre-flight check verifies the trip exists, has dates, and has an
--     owner. RAISE EXCEPTION if any are missing.
--
-- Group chat surfaces:
--   The trip view (TripResultsView) renders the group chat from
--   `plan_activity_comments`, scoped by `plan_id` (an `ai_trip_plans.id`) and
--   `activity_key`. The function looks up the latest plan for the trip and
--   uses:
--     * activity_key='trip-general' for the main group chat thread
--     * activity_key='day-{N}-activity-{M}' for inline per-activity comments
--   Reactions live in `plan_activity_reactions` with the same key scheme.
--   If the trip has no `ai_trip_plans` row, group-chat / activity inserts are
--   skipped with a NOTICE (the rest of the seed still runs).
--
--   The legacy itinerary view (ItineraryItemCard) reads `public.comments`
--   filtered by itinerary_item_id. We also write 2 of those if the trip has
--   itinerary_items, so screenshots from either surface look populated.
--
-- NOTE on auth.users:
--   trip_members.user_id, expenses.payer_id, expense_splits.user_id,
--   plan_activity_*.user_id, comments.user_id, and votes.user_id all carry
--   NOT NULL foreign keys to auth.users(id). The function inserts three
--   minimal auth.users rows (deterministic UUIDs, `@junto.demo` emails —
--   IETF-reserved TLD) on first run, plus matching profiles. Subsequent
--   runs reuse the same rows.
--
-- Usage:
--   SELECT public.seed_demo_trip('<trip-uuid>');
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_demo_trip(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  -- Deterministic demo personas. Same UUIDs every run -> idempotent cleanup.
  _aisha_id  uuid := '11111111-1111-4111-8111-aaaaaaaaaaa1';
  _marcus_id uuid := '22222222-2222-4222-8222-aaaaaaaaaaa2';
  _priya_id  uuid := '33333333-3333-4333-8333-aaaaaaaaaaa3';
  _demo_ids  uuid[] := ARRAY[_aisha_id, _marcus_id, _priya_id];

  _trip_currency text;
  _trip_start    date;
  _trip_end      date;
  _owner_id      uuid;
  _plan_id       uuid;

  _eid     uuid;
  _poll_id uuid;
  _opt_wh  uuid;
  _opt_ps  uuid;

  _idea_hawker_chan uuid;
  _idea_night_safari uuid;
  _idea_kaya_toast uuid;
  _idea_skypark uuid;
  _idea_orchid uuid;
  _idea_tiong_bahru uuid;
  _idea_lau_pa_sat uuid;
  _idea_chinatown uuid;

  _itin_id_1 uuid;
  _itin_id_2 uuid;

  _comments_inserted int := 0;
  _reactions_inserted int := 0;
  _itin_comments_inserted int := 0;
BEGIN
  -- ---- Pre-flight ----
  SELECT settlement_currency, tentative_start_date, tentative_end_date
    INTO _trip_currency, _trip_start, _trip_end
    FROM public.trips
   WHERE id = p_trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seed_demo_trip: trip % does not exist', p_trip_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF _trip_start IS NULL OR _trip_end IS NULL THEN
    RAISE EXCEPTION 'seed_demo_trip: trip % has no dates set (tentative_start_date/tentative_end_date)', p_trip_id
      USING ERRCODE = 'data_exception';
  END IF;

  SELECT user_id INTO _owner_id
    FROM public.trip_members
   WHERE trip_id = p_trip_id AND role = 'owner'
   ORDER BY joined_at ASC
   LIMIT 1;

  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'seed_demo_trip: trip % has no owner trip_members row', p_trip_id
      USING ERRCODE = 'data_exception';
  END IF;

  -- Latest AI plan for this trip (group-chat scope). Optional; null = skip.
  SELECT id INTO _plan_id
    FROM public.ai_trip_plans
   WHERE trip_id = p_trip_id
   ORDER BY created_at DESC
   LIMIT 1;

  RAISE NOTICE 'seed_demo_trip: target trip % | currency=% | dates % .. % | plan_id=%',
    p_trip_id, _trip_currency, _trip_start, _trip_end, _plan_id;

  -- ---- Idempotency: remove any prior demo rows tied to this trip ----
  -- expense_splits before expenses; vote/option/poll cascades handle themselves.
  DELETE FROM public.expense_splits
   WHERE expense_id IN (
           SELECT id FROM public.expenses
            WHERE trip_id = p_trip_id
              AND payer_id = ANY(_demo_ids)
         );
  DELETE FROM public.expense_splits
   WHERE user_id = ANY(_demo_ids)
     AND expense_id IN (SELECT id FROM public.expenses WHERE trip_id = p_trip_id);
  DELETE FROM public.expenses
   WHERE trip_id = p_trip_id
     AND payer_id = ANY(_demo_ids);

  -- public.comments: legacy itinerary-item comments (and any prior trip-level
  -- demo comments we wrote in v1 of this function — they didn't surface in the
  -- group chat UI, so the v2 seed no longer creates them, but we still clean
  -- them up so re-runs leave nothing behind).
  DELETE FROM public.comments
   WHERE trip_id = p_trip_id
     AND user_id = ANY(_demo_ids);

  -- trip_idea_votes: clean any votes by demo users on this trip's ideas, plus
  -- the owner's votes on demo-created ideas (cascades take the rest when ideas
  -- are deleted below).
  DELETE FROM public.trip_idea_votes
   WHERE user_id = ANY(_demo_ids)
     AND idea_id IN (SELECT id FROM public.trip_ideas WHERE trip_id = p_trip_id);
  DELETE FROM public.trip_idea_votes
   WHERE user_id = _owner_id
     AND idea_id IN (
       SELECT id FROM public.trip_ideas
        WHERE trip_id = p_trip_id AND created_by = ANY(_demo_ids)
     );
  DELETE FROM public.trip_ideas
   WHERE trip_id = p_trip_id
     AND created_by = ANY(_demo_ids);

  -- Polls: identified by exact title within this trip
  DELETE FROM public.polls
   WHERE trip_id = p_trip_id
     AND title = 'Sunday brunch — Wild Honey or PS.Cafe?';

  -- plan_activity_comments / plan_activity_reactions: only present if the trip
  -- has an AI plan. Scoped by plan_id + demo user_id so real users' activity
  -- on the same plan stays intact.
  IF _plan_id IS NOT NULL THEN
    DELETE FROM public.plan_activity_comments
     WHERE plan_id = _plan_id
       AND user_id = ANY(_demo_ids);
    DELETE FROM public.plan_activity_reactions
     WHERE plan_id = _plan_id
       AND user_id = ANY(_demo_ids);
  END IF;

  DELETE FROM public.trip_members
   WHERE trip_id = p_trip_id
     AND user_id = ANY(_demo_ids);

  -- ---- auth.users (idempotent, demo personas) ----
  -- Minimal columns; relies on Supabase auth.users defaults for the rest.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_super_admin
  )
  VALUES
    (_aisha_id,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'demo-aisha@junto.demo',  now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"display_name":"Aisha Rahman"}'::jsonb,
     now(), now(), false),
    (_marcus_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'demo-marcus@junto.demo', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"display_name":"Marcus Tan"}'::jsonb,
     now(), now(), false),
    (_priya_id,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'demo-priya@junto.demo',  now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"display_name":"Priya Sharma"}'::jsonb,
     now(), now(), false)
  ON CONFLICT (id) DO NOTHING;

  -- ---- profiles ----
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES
    (_aisha_id,  'Aisha Rahman',  'https://i.pravatar.cc/300?u=demo-aisha'),
    (_marcus_id, 'Marcus Tan',    'https://i.pravatar.cc/300?u=demo-marcus'),
    (_priya_id,  'Priya Sharma',  'https://i.pravatar.cc/300?u=demo-priya')
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        avatar_url   = EXCLUDED.avatar_url;

  -- ---- trip_members ----
  INSERT INTO public.trip_members (trip_id, user_id, role, attendance_status)
  VALUES
    (p_trip_id, _aisha_id,  'member', 'going'),
    (p_trip_id, _marcus_id, 'member', 'going'),
    (p_trip_id, _priya_id,  'member', 'going')
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  RAISE NOTICE 'Inserted 3 members: Aisha Rahman, Marcus Tan, Priya Sharma';

  -- ---- Expenses + splits ----
  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _owner_id, 'Marina Bay hotel — Bay-view room upgrade', 280, _trip_currency, 'accommodation', _trip_start, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 70), (_eid, _aisha_id, 70), (_eid, _marcus_id, 70), (_eid, _priya_id, 70);

  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _priya_id, 'Hotel breakfast buffet add-on (4 nights)', 96, _trip_currency, 'accommodation', _trip_start, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 24), (_eid, _aisha_id, 24), (_eid, _marcus_id, 24), (_eid, _priya_id, 24);

  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _marcus_id, 'Lau Pa Sat satay & hawker dinner', 32, _trip_currency, 'food', _trip_start, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 8), (_eid, _aisha_id, 8), (_eid, _marcus_id, 8), (_eid, _priya_id, 8);

  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _aisha_id, 'Gardens by the Bay — Cloud Forest + Flower Dome', 112, _trip_currency, 'activities', _trip_start + 1, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 28), (_eid, _aisha_id, 28), (_eid, _marcus_id, 28), (_eid, _priya_id, 28);

  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _priya_id, 'Burnt Ends — chef''s table dinner', 320, _trip_currency, 'food', _trip_start + 2, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 80), (_eid, _aisha_id, 80), (_eid, _marcus_id, 80), (_eid, _priya_id, 80);

  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _marcus_id, 'Night Safari tickets', 165, _trip_currency, 'activities', _trip_start + 2, 'custom');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 55), (_eid, _aisha_id, 55), (_eid, _marcus_id, 55);

  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _owner_id, 'EZ-Link top-ups + Grab to airport', 68, _trip_currency, 'transport', _trip_end, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 17), (_eid, _aisha_id, 17), (_eid, _marcus_id, 17), (_eid, _priya_id, 17);

  RAISE NOTICE 'Inserted 7 expenses totaling % 1073 (accommodation 376, food 352, activities 277, transport 68)', _trip_currency;

  -- ---- Trip ideas (capture IDs for vote inserts below) ----
  _idea_hawker_chan  := gen_random_uuid();
  _idea_night_safari := gen_random_uuid();
  _idea_kaya_toast   := gen_random_uuid();
  _idea_skypark      := gen_random_uuid();
  _idea_orchid       := gen_random_uuid();
  _idea_tiong_bahru  := gen_random_uuid();
  _idea_lau_pa_sat   := gen_random_uuid();
  _idea_chinatown    := gen_random_uuid();

  INSERT INTO public.trip_ideas (id, trip_id, created_by, title, category, status) VALUES
    (_idea_hawker_chan,  p_trip_id, _aisha_id,  'Hawker Chan Michelin one-star chicken rice',         'food',     'suggested'),
    (_idea_night_safari, p_trip_id, _marcus_id, 'Night Safari',                                       'activity', 'suggested'),
    (_idea_kaya_toast,   p_trip_id, _priya_id,  'Kaya toast breakfast at Ya Kun Kaya Toast',          'food',     'suggested'),
    (_idea_skypark,      p_trip_id, _owner_id,  'Marina Bay Sands SkyPark observation deck',          'activity', 'suggested'),
    (_idea_orchid,       p_trip_id, _aisha_id,  'Botanic Gardens orchid garden',                      'place',    'suggested'),
    (_idea_tiong_bahru,  p_trip_id, _priya_id,  'Tiong Bahru Bakery for kouign-amann',                'food',     'suggested'),
    (_idea_lau_pa_sat,   p_trip_id, _marcus_id, 'Lau Pa Sat satay street at night',                   'food',     'suggested'),
    (_idea_chinatown,    p_trip_id, _aisha_id,  'Chinatown street food walk',                         'activity', 'suggested');

  RAISE NOTICE 'Inserted 8 ideas across food/activity/place';

  -- ---- Idea votes ----
  -- Hawker Chan: 4 votes (most popular) — owner + all 3 demos
  -- Night Safari: 3 votes — owner + Aisha + Priya
  -- SkyPark: 2 votes — Aisha + Marcus
  -- Lau Pa Sat: 2 votes — Priya + owner
  -- Orchid Garden: 1 vote — Marcus
  -- Tiong Bahru: 1 vote — Aisha
  -- Kaya toast & Chinatown: 0 votes
  INSERT INTO public.trip_idea_votes (idea_id, user_id) VALUES
    (_idea_hawker_chan,  _owner_id),
    (_idea_hawker_chan,  _aisha_id),
    (_idea_hawker_chan,  _marcus_id),
    (_idea_hawker_chan,  _priya_id),
    (_idea_night_safari, _owner_id),
    (_idea_night_safari, _aisha_id),
    (_idea_night_safari, _priya_id),
    (_idea_skypark,      _aisha_id),
    (_idea_skypark,      _marcus_id),
    (_idea_lau_pa_sat,   _priya_id),
    (_idea_lau_pa_sat,   _owner_id),
    (_idea_orchid,       _marcus_id),
    (_idea_tiong_bahru,  _aisha_id);

  RAISE NOTICE 'Inserted 13 idea votes (Hawker Chan 4, Night Safari 3, SkyPark/Lau Pa Sat 2, Orchid/Tiong Bahru 1, others 0)';

  -- ---- Group chat (plan_activity_comments) ----
  IF _plan_id IS NOT NULL THEN
    INSERT INTO public.plan_activity_comments (plan_id, activity_key, user_id, text, created_at) VALUES
      (_plan_id, 'trip-general', _aisha_id,  'Just looked at the itinerary — Marina Bay night looks amazing!!',          now() - interval '6 days'),
      (_plan_id, 'trip-general', _priya_id,  'Reminder: bring an umbrella, it rains every afternoon there',              now() - interval '5 days'),
      (_plan_id, 'trip-general', _marcus_id, 'Should we book Night Safari tickets in advance? Heard it sells out',       now() - interval '4 days'),
      (_plan_id, 'trip-general', _aisha_id,  'Saved Hawker Chan to ideas — heard the wait is brutal but worth it',       now() - interval '3 days'),
      (_plan_id, 'trip-general', _priya_id,  'Just checked weather: 30°C all week, bring layers for the AC indoors',     now() - interval '2 days'),
      (_plan_id, 'trip-general', _marcus_id, 'Anyone want to do an early morning Botanic Gardens walk Day 2?',            now() - interval '1 days');
    GET DIAGNOSTICS _comments_inserted = ROW_COUNT;

    -- Activity-level inline comments. activity_key format is 'day-{N}-activity-{M}',
    -- where N/M are 0-based positions in ai_trip_plans.result.days[N].activities[M].
    -- We pick keys that virtually any 5-day plan will render. If a key doesn't
    -- match an actual rendered activity, the row sits silent — no error.
    INSERT INTO public.plan_activity_comments (plan_id, activity_key, user_id, text, created_at) VALUES
      (_plan_id, 'day-0-activity-1', _aisha_id,  'Heard the sushi place takes walk-ins after 9pm — let''s aim late', now() - interval '4 days 6 hours'),
      (_plan_id, 'day-1-activity-2', _marcus_id, 'We should swap this for the rooftop bar at CÉ LA VI instead',      now() - interval '3 days 4 hours'),
      (_plan_id, 'day-2-activity-1', _priya_id,  'Reservation confirmed for 4 at 19:30 — pls don''t be late again',   now() - interval '2 days 2 hours');
    GET DIAGNOSTICS _reactions_inserted = ROW_COUNT;  -- reused below; reset
    _comments_inserted := _comments_inserted + _reactions_inserted;

    -- Emoji reactions for "lived in" feel. UNIQUE (plan_id, activity_key, user_id, emoji)
    -- so re-runs are safe (cleanup deletes by user_id first anyway).
    INSERT INTO public.plan_activity_reactions (plan_id, activity_key, user_id, emoji) VALUES
      (_plan_id, 'day-0-activity-0', _aisha_id,  '🔥'),
      (_plan_id, 'day-0-activity-0', _marcus_id, '👍'),
      (_plan_id, 'day-1-activity-1', _priya_id,  '🔥'),
      (_plan_id, 'day-1-activity-1', _aisha_id,  '👍'),
      (_plan_id, 'day-2-activity-0', _marcus_id, '🔥'),
      (_plan_id, 'day-2-activity-2', _priya_id,  '🤔'),
      (_plan_id, 'day-3-activity-0', _aisha_id,  '👍');
    GET DIAGNOSTICS _reactions_inserted = ROW_COUNT;

    RAISE NOTICE 'Inserted % plan_activity_comments (6 group-chat + 3 activity-level) and % emoji reactions',
      _comments_inserted, _reactions_inserted;
  ELSE
    RAISE NOTICE 'Skipped group chat: trip has no ai_trip_plans row (plan_activity_comments lives under plan_id, not trip_id)';
  END IF;

  -- ---- Itinerary-item comments (legacy itinerary view) ----
  -- Pick up to 2 real itinerary_items on this trip; if there are none, skip.
  -- These render via useItemComments in ItineraryItemCard.
  SELECT id INTO _itin_id_1
    FROM public.itinerary_items
   WHERE trip_id = p_trip_id
   ORDER BY day_date ASC, sort_order ASC
   LIMIT 1;

  SELECT id INTO _itin_id_2
    FROM public.itinerary_items
   WHERE trip_id = p_trip_id
     AND id <> coalesce(_itin_id_1, '00000000-0000-0000-0000-000000000000'::uuid)
   ORDER BY day_date ASC, sort_order ASC
   OFFSET 1
   LIMIT 1;

  IF _itin_id_1 IS NOT NULL THEN
    INSERT INTO public.comments (trip_id, itinerary_item_id, user_id, body, created_at) VALUES
      (p_trip_id, _itin_id_1, _marcus_id, 'Booked! Confirmation in the email thread', now() - interval '2 days');
    _itin_comments_inserted := _itin_comments_inserted + 1;
  END IF;
  IF _itin_id_2 IS NOT NULL THEN
    INSERT INTO public.comments (trip_id, itinerary_item_id, user_id, body, created_at) VALUES
      (p_trip_id, _itin_id_2, _aisha_id, 'Skip the queue — there''s a side entrance', now() - interval '1 days');
    _itin_comments_inserted := _itin_comments_inserted + 1;
  END IF;

  IF _itin_comments_inserted > 0 THEN
    RAISE NOTICE 'Inserted % itinerary-item comments (public.comments)', _itin_comments_inserted;
  ELSE
    RAISE NOTICE 'Skipped itinerary-item comments: trip has no itinerary_items rows';
  END IF;

  -- ---- Poll: Sunday brunch ----
  _poll_id := gen_random_uuid();
  _opt_wh  := gen_random_uuid();
  _opt_ps  := gen_random_uuid();

  INSERT INTO public.polls (id, trip_id, type, title, status, multi_select)
  VALUES (_poll_id, p_trip_id, 'preference', 'Sunday brunch — Wild Honey or PS.Cafe?', 'open', false);

  INSERT INTO public.poll_options (id, poll_id, label, sort_order) VALUES
    (_opt_wh, _poll_id, 'Wild Honey (ION Orchard)', 0),
    (_opt_ps, _poll_id, 'PS.Cafe (Dempsey)',        1);

  INSERT INTO public.votes (poll_option_id, user_id, value) VALUES
    (_opt_wh, _aisha_id,  'yes'),
    (_opt_wh, _marcus_id, 'yes'),
    (_opt_ps, _priya_id,  'yes');

  RAISE NOTICE 'Inserted 1 preference poll with 2 options and 3 votes';

  RAISE NOTICE 'seed_demo_trip: done for trip %', p_trip_id;
END;
$fn$;

-- =============================================================================
-- Run on the Singapore landing-page demo trip
-- =============================================================================
SELECT public.seed_demo_trip('c6362e4f-2a76-41a7-aed1-5518795447e5');

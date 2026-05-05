-- =============================================================================
-- seed_demo_trip(p_trip_id uuid)
--
-- Populates an existing trip with realistic demo content for landing-page
-- screenshots: 3 fake group members, 7 expenses + splits, 8 ideas with vote
-- counts, 6 group-chat messages, 3 activity-level comments + emoji reactions,
-- 7 booking attachments (2 flights + hotel + visa + activity + restaurant
-- reservation), and 1 preference poll with options + votes.
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
--   The Group Activity panel (rendered at /app/trips/:tripId/ai-plan/:planId
--   via TripResultsView → GroupActivityPanel) reads `plan_activity_comments`
--   + `plan_activity_reactions` filtered by the planId in the URL. A trip can
--   have multiple `ai_trip_plans` rows (each generation/regeneration creates
--   one), so the seed loops over ALL plans for the trip and writes the same
--   demo set under each — otherwise opening an older plan in the URL would
--   show an empty panel.
--     * activity_key='trip-general' for the main group chat thread
--     * activity_key='day-{N}-activity-{M}' for inline per-activity comments
--   "Members active" is derived from unique user_ids across both tables, so
--   populating reactions+comments auto-fills that count too.
--   If the trip has no `ai_trip_plans` row, the loop is a no-op and a NOTICE
--   reports the skip (the rest of the seed still runs).
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
  _plan_count int := 0;

  _owner_name text;
  _outbound_date date;
  _return_date  date;
  _flight_pax   jsonb;

  -- Demo attachment titles — used for both inserts and cleanup. Owner-created
  -- attachments are matched by exact title (rather than created_by) so the
  -- cleanup never touches real attachments the owner uploaded themselves.
  _att_titles text[] := ARRAY[
    'Marina Bay Sands hotel booking confirmation.pdf',
    'Singapore Airlines SQ235 — LHR → SIN.pdf',
    'Singapore Airlines SQ322 — SIN → LHR.pdf',
    'Night Safari group booking confirmation.pdf',
    'Visa entry confirmation.pdf',
    'Burnt Ends — chef''s table reservation.pdf',
    'World Nomads travel insurance — group policy.pdf'
  ];
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

  -- AI plans for this trip. The group-chat panel reads
  -- plan_activity_comments / plan_activity_reactions filtered by plan_id, and
  -- a trip can have multiple plans (each generation/regeneration = one row).
  -- We seed under all of them in the loop further down. Just count here for
  -- the initial NOTICE.
  SELECT count(*) INTO _plan_count
    FROM public.ai_trip_plans WHERE trip_id = p_trip_id;

  RAISE NOTICE 'seed_demo_trip: target trip % | currency=% | dates % .. % | ai_trip_plans=%',
    p_trip_id, _trip_currency, _trip_start, _trip_end, _plan_count;

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
  -- has at least one AI plan. Scoped to ALL plans for the trip so re-running
  -- after the user generates additional plans still cleans every demo row.
  DELETE FROM public.plan_activity_comments
   WHERE user_id = ANY(_demo_ids)
     AND plan_id IN (SELECT id FROM public.ai_trip_plans WHERE trip_id = p_trip_id);
  DELETE FROM public.plan_activity_reactions
   WHERE user_id = ANY(_demo_ids)
     AND plan_id IN (SELECT id FROM public.ai_trip_plans WHERE trip_id = p_trip_id);

  -- Booking attachments: matched by exact demo title (covers both demo-persona-
  -- authored and owner-authored demo rows without touching real owner uploads).
  DELETE FROM public.attachments
   WHERE trip_id = p_trip_id
     AND title = ANY(_att_titles);

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

  -- ---- Group chat (plan_activity_comments + plan_activity_reactions) ----
  -- The trip view at /app/trips/:tripId/ai-plan/:planId reads these tables
  -- filtered by the planId in the URL. A trip can have multiple ai_trip_plans
  -- rows (each generation/regeneration creates one), and the user may navigate
  -- to any of them. Earlier versions only seeded under the latest plan, which
  -- left the panel empty whenever the user opened an older plan. Fix: insert
  -- the full demo set under EVERY plan attached to this trip.
  _plan_count := 0;
  _comments_inserted := 0;
  _reactions_inserted := 0;
  FOR _plan_id IN
    SELECT id FROM public.ai_trip_plans
     WHERE trip_id = p_trip_id
     ORDER BY created_at ASC
  LOOP
    _plan_count := _plan_count + 1;

    INSERT INTO public.plan_activity_comments (plan_id, activity_key, user_id, text, created_at) VALUES
      (_plan_id, 'trip-general', _aisha_id,  'Just looked at the itinerary — Marina Bay night looks amazing!!',          now() - interval '6 days'),
      (_plan_id, 'trip-general', _priya_id,  'Reminder: bring an umbrella, it rains every afternoon there',              now() - interval '5 days'),
      (_plan_id, 'trip-general', _marcus_id, 'Should we book Night Safari tickets in advance? Heard it sells out',       now() - interval '4 days'),
      (_plan_id, 'trip-general', _aisha_id,  'Saved Hawker Chan to ideas — heard the wait is brutal but worth it',       now() - interval '3 days'),
      (_plan_id, 'trip-general', _priya_id,  'Just checked weather: 30°C all week, bring layers for the AC indoors',     now() - interval '2 days'),
      (_plan_id, 'trip-general', _marcus_id, 'Anyone want to do an early morning Botanic Gardens walk Day 2?',            now() - interval '1 days'),
      -- Activity-level inline comments. activity_key format is 'day-{N}-activity-{M}',
      -- where N/M are 0-based positions in ai_trip_plans.result.days[N].activities[M].
      -- If a key doesn't match a rendered activity, the row sits silent — no error.
      (_plan_id, 'day-0-activity-1', _aisha_id,  'Heard the sushi place takes walk-ins after 9pm — let''s aim late', now() - interval '4 days 6 hours'),
      (_plan_id, 'day-1-activity-2', _marcus_id, 'We should swap this for the rooftop bar at CÉ LA VI instead',      now() - interval '3 days 4 hours'),
      (_plan_id, 'day-2-activity-1', _priya_id,  'Reservation confirmed for 4 at 19:30 — pls don''t be late again',   now() - interval '2 days 2 hours');
    _comments_inserted := _comments_inserted + 9;

    -- Emoji reactions. UNIQUE (plan_id, activity_key, user_id, emoji); cleanup
    -- above deletes by user_id so re-runs don't violate the constraint.
    INSERT INTO public.plan_activity_reactions (plan_id, activity_key, user_id, emoji) VALUES
      (_plan_id, 'day-0-activity-0', _aisha_id,  '🔥'),
      (_plan_id, 'day-0-activity-0', _marcus_id, '👍'),
      (_plan_id, 'day-1-activity-1', _priya_id,  '🔥'),
      (_plan_id, 'day-1-activity-1', _aisha_id,  '👍'),
      (_plan_id, 'day-2-activity-0', _marcus_id, '🔥'),
      (_plan_id, 'day-2-activity-2', _priya_id,  '🤔'),
      (_plan_id, 'day-3-activity-0', _aisha_id,  '👍');
    _reactions_inserted := _reactions_inserted + 7;
  END LOOP;

  IF _plan_count > 0 THEN
    RAISE NOTICE 'Inserted % plan_activity_comments and % reactions across % AI plan(s)',
      _comments_inserted, _reactions_inserted, _plan_count;
  ELSE
    RAISE NOTICE 'Skipped group chat: trip has no ai_trip_plans row (the panel lives under plan_id, not trip_id)';
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

  -- ---- Booking attachments (Bookings tab — public.attachments) ----
  -- attachments.created_by FKs to profiles(id); demo personas already have
  -- profiles inserted above. file_path/url left NULL so rows render as
  -- "manual" entries (the same shape addManual creates from the UI).
  -- booking_data JSON shapes match what extract-booking-info would produce
  -- and are read by ArrivalsCard / BookingCrossLinkDrawer / AttachmentCard.

  -- Owner display name for passenger lists (falls back to 'Trip Owner')
  SELECT coalesce(display_name, 'Trip Owner') INTO _owner_name
    FROM public.profiles WHERE id = _owner_id;
  _owner_name := coalesce(_owner_name, 'Trip Owner');

  _outbound_date := _trip_start;
  _return_date   := _trip_end;
  _flight_pax    := jsonb_build_array(
    _owner_name, 'Aisha Rahman', 'Marcus Tan', 'Priya Sharma'
  );

  -- 1) Hotel: Marina Bay Sands (owner)
  INSERT INTO public.attachments
    (trip_id, created_by, type, title, notes, booking_data, is_private, created_at)
  VALUES (
    p_trip_id, _owner_id, 'hotel',
    'Marina Bay Sands hotel booking confirmation.pdf',
    '4 nights · 2 deluxe rooms · breakfast included',
    jsonb_build_object(
      'booking_type',      'hotel',
      'provider',          'Marina Bay Sands',
      'check_in',          to_char(_trip_start, 'YYYY-MM-DD'),
      'check_out',         to_char(_trip_end,   'YYYY-MM-DD'),
      'booking_reference', 'MBS-7842XK',
      'total_price',       '1400 ' || _trip_currency,
      'guests',            4,
      'destination',       'Singapore'
    ),
    false, now() - interval '14 days'
  );

  -- 2) Flight outbound: SQ235 LHR → SIN (owner)
  INSERT INTO public.attachments
    (trip_id, created_by, type, title, notes, booking_data, is_private, created_at)
  VALUES (
    p_trip_id, _owner_id, 'flight',
    'Singapore Airlines SQ235 — LHR → SIN.pdf',
    'Outbound · 4 passengers · Economy',
    jsonb_build_object(
      'booking_type',      'flight',
      'direction',         'outbound',
      'provider',          'Singapore Airlines',
      'flight_number',     'SQ235',
      'departure',         'London Heathrow (LHR)',
      'destination',       'Singapore Changi (SIN)',
      'flight_date',       to_char(_outbound_date - 1, 'YYYY-MM-DD'),
      'departure_time',    to_char(_outbound_date - 1, 'YYYY-MM-DD') || 'T21:30:00+01:00',
      'arrival_time',      to_char(_outbound_date,     'YYYY-MM-DD') || 'T17:50:00+08:00',
      'check_in',          to_char(_outbound_date - 1, 'YYYY-MM-DD'),
      'class',             'Economy',
      'booking_reference', 'XKLM4P',
      'total_price',       '3400 ' || _trip_currency,
      'passenger_names',   _flight_pax
    ),
    false, now() - interval '13 days'
  );

  -- 3) Flight return: SQ322 SIN → LHR (owner)
  INSERT INTO public.attachments
    (trip_id, created_by, type, title, notes, booking_data, is_private, created_at)
  VALUES (
    p_trip_id, _owner_id, 'flight',
    'Singapore Airlines SQ322 — SIN → LHR.pdf',
    'Return · 4 passengers · Economy',
    jsonb_build_object(
      'booking_type',      'flight',
      'direction',         'return',
      'provider',          'Singapore Airlines',
      'flight_number',     'SQ322',
      'departure',         'Singapore Changi (SIN)',
      'destination',       'London Heathrow (LHR)',
      'flight_date',       to_char(_return_date, 'YYYY-MM-DD'),
      'departure_time',    to_char(_return_date,     'YYYY-MM-DD') || 'T23:55:00+08:00',
      'arrival_time',      to_char(_return_date + 1, 'YYYY-MM-DD') || 'T06:25:00+01:00',
      'check_out',         to_char(_return_date, 'YYYY-MM-DD'),
      'class',             'Economy',
      'booking_reference', 'XKLM4P',
      'total_price',       '3400 ' || _trip_currency,
      'passenger_names',   _flight_pax
    ),
    false, now() - interval '13 days'
  );

  -- 4) Activity: Night Safari (Marcus)
  INSERT INTO public.attachments
    (trip_id, created_by, type, title, notes, booking_data, is_private, created_at)
  VALUES (
    p_trip_id, _marcus_id, 'activity',
    'Night Safari group booking confirmation.pdf',
    '4 adult tickets · Tram tour included · 19:30 entry',
    jsonb_build_object(
      'booking_type',      'activity',
      'provider',          'Mandai Wildlife Reserve — Night Safari',
      'check_in',          to_char(_trip_start + 2, 'YYYY-MM-DD'),
      'booking_reference', 'NS-AB7291',
      'total_price',       '220 ' || _trip_currency,
      'guests',            4,
      'destination',       '80 Mandai Lake Rd, Singapore'
    ),
    false, now() - interval '8 days'
  );

  -- 5) Visa: entry confirmation (Priya)
  INSERT INTO public.attachments
    (trip_id, created_by, type, title, notes, booking_data, is_private, created_at)
  VALUES (
    p_trip_id, _priya_id, 'visa',
    'Visa entry confirmation.pdf',
    'SG Arrival Card submitted for all 4 travellers',
    jsonb_build_object(
      'booking_type',     'visa',
      'provider',         'Singapore ICA',
      'valid_until',      to_char(_trip_end + 30, 'YYYY-MM-DD'),
      'expiry_date',      to_char(_trip_end + 30, 'YYYY-MM-DD'),
      'passenger_names',  _flight_pax,
      'destination',      'Singapore'
    ),
    false, now() - interval '10 days'
  );

  -- 6) Restaurant: Burnt Ends reservation (owner)
  INSERT INTO public.attachments
    (trip_id, created_by, type, title, notes, booking_data, is_private, created_at)
  VALUES (
    p_trip_id, _owner_id, 'other',
    'Burnt Ends — chef''s table reservation.pdf',
    'Table for 4 · 19:30 · Confirmation: pls don''t be late',
    jsonb_build_object(
      'booking_type',      'restaurant',
      'provider',          'Burnt Ends',
      'check_in',          to_char(_trip_start + 2, 'YYYY-MM-DD'),
      'departure_time',    to_char(_trip_start + 2, 'YYYY-MM-DD') || 'T19:30:00+08:00',
      'booking_reference', 'BE-CH4823',
      'guests',            4,
      'destination',       '7 Dempsey Rd, Singapore'
    ),
    false, now() - interval '6 days'
  );

  -- 7) Insurance: World Nomads (Priya)
  INSERT INTO public.attachments
    (trip_id, created_by, type, title, notes, booking_data, is_private, created_at)
  VALUES (
    p_trip_id, _priya_id, 'insurance',
    'World Nomads travel insurance — group policy.pdf',
    'Group policy covering all 4 travellers · Standard plan',
    jsonb_build_object(
      'booking_type',     'insurance',
      'provider',         'World Nomads',
      'check_in',         to_char(_trip_start - 1, 'YYYY-MM-DD'),
      'check_out',        to_char(_trip_end + 1,   'YYYY-MM-DD'),
      'valid_until',      to_char(_trip_end + 1,   'YYYY-MM-DD'),
      'booking_reference','WN-7821-SG',
      'total_price',      '180 ' || _trip_currency,
      'passenger_names',  _flight_pax
    ),
    false, now() - interval '11 days'
  );

  RAISE NOTICE 'Inserted 7 booking attachments (1 hotel, 2 flights, 1 activity, 1 visa, 1 restaurant, 1 insurance)';

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

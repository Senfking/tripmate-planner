-- =============================================================================
-- seed_demo_trip(p_trip_id uuid)
--
-- Populates an existing trip with realistic demo content for landing-page
-- screenshots: 3 fake group members, 7 expenses + splits, 8 ideas, 6 trip-level
-- comments, and 1 preference poll with options + votes.
--
-- Designed to be:
--   * Reusable: pass any trip_id; the function picks up that trip's currency
--     and date range automatically.
--   * Idempotent: re-running on the same trip removes prior demo rows tied to
--     the three deterministic demo personas, then re-inserts a fresh batch.
--     The trip's pre-existing expenses, ideas, comments, and members (the
--     real owner) are never touched.
--   * Safe: pre-flight check verifies the trip exists, has dates set, and has
--     an owner. RAISE EXCEPTION if any are missing.
--
-- NOTE on auth.users:
--   trip_members.user_id, expenses.payer_id, expense_splits.user_id,
--   comments.user_id, and votes.user_id all carry NOT NULL foreign keys to
--   auth.users(id). Generated UUIDs alone won't satisfy those FKs, so the
--   function inserts three minimal auth.users rows (with deterministic UUIDs
--   and `@junto.demo` emails — IETF-reserved TLD) on first run, plus
--   matching profiles. Subsequent runs reuse the same rows. Demo personas
--   persist in auth.users across re-runs and across calls for different
--   trips; only the trip-scoped data is rebuilt.
--
-- Usage:
--   SELECT public.seed_demo_trip('<trip-uuid>');
--
-- To remove demo data later for a specific trip, re-run cleanup manually
-- against that trip_id, or call the function then DELETE the trip_members
-- rows for the three demo UUIDs.
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

  _trip_currency text;
  _trip_start    date;
  _trip_end      date;
  _owner_id      uuid;

  _eid     uuid;
  _poll_id uuid;
  _opt_wh  uuid;
  _opt_ps  uuid;
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

  RAISE NOTICE 'seed_demo_trip: target trip % | currency=% | dates % .. %',
    p_trip_id, _trip_currency, _trip_start, _trip_end;

  -- ---- Idempotency: remove any prior demo rows tied to this trip ----
  -- Order matters: splits before expenses; vote/option/poll cascades handle
  -- themselves via FK ON DELETE CASCADE on poll_options + votes.
  DELETE FROM public.expense_splits
   WHERE expense_id IN (
           SELECT id FROM public.expenses
            WHERE trip_id = p_trip_id
              AND payer_id IN (_aisha_id, _marcus_id, _priya_id)
         );
  DELETE FROM public.expense_splits
   WHERE user_id IN (_aisha_id, _marcus_id, _priya_id)
     AND expense_id IN (SELECT id FROM public.expenses WHERE trip_id = p_trip_id);
  DELETE FROM public.expenses
   WHERE trip_id = p_trip_id
     AND payer_id IN (_aisha_id, _marcus_id, _priya_id);
  DELETE FROM public.comments
   WHERE trip_id = p_trip_id
     AND user_id IN (_aisha_id, _marcus_id, _priya_id);
  DELETE FROM public.trip_ideas
   WHERE trip_id = p_trip_id
     AND created_by IN (_aisha_id, _marcus_id, _priya_id);
  DELETE FROM public.polls
   WHERE trip_id = p_trip_id
     AND title = 'Sunday brunch — Wild Honey or PS.Cafe?';
  DELETE FROM public.trip_members
   WHERE trip_id = p_trip_id
     AND user_id IN (_aisha_id, _marcus_id, _priya_id);

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

  -- ---- profiles (display_name + avatar_url) ----
  -- handle_new_user() trigger may have inserted bare profiles; UPSERT to
  -- guarantee display_name and avatar_url are populated.
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
  -- 7 expenses, all in the trip's settlement currency, distributed across
  -- the trip's date range. Mix of payers and split modes.

  -- 1) Accommodation: room upgrade (owner paid, equal 4-way)
  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _owner_id, 'Marina Bay hotel — Bay-view room upgrade', 280, _trip_currency, 'accommodation', _trip_start, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 70), (_eid, _aisha_id, 70), (_eid, _marcus_id, 70), (_eid, _priya_id, 70);

  -- 2) Accommodation: hotel breakfast add-on (Priya paid)
  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _priya_id, 'Hotel breakfast buffet add-on (4 nights)', 96, _trip_currency, 'accommodation', _trip_start, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 24), (_eid, _aisha_id, 24), (_eid, _marcus_id, 24), (_eid, _priya_id, 24);

  -- 3) Food: hawker dinner (Marcus paid)
  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _marcus_id, 'Lau Pa Sat satay & hawker dinner', 32, _trip_currency, 'food', _trip_start, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 8), (_eid, _aisha_id, 8), (_eid, _marcus_id, 8), (_eid, _priya_id, 8);

  -- 4) Activities: Gardens by the Bay (Aisha paid)
  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _aisha_id, 'Gardens by the Bay — Cloud Forest + Flower Dome', 112, _trip_currency, 'activities', _trip_start + 1, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 28), (_eid, _aisha_id, 28), (_eid, _marcus_id, 28), (_eid, _priya_id, 28);

  -- 5) Food: chef's table dinner (Priya paid)
  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _priya_id, 'Burnt Ends — chef''s table dinner', 320, _trip_currency, 'food', _trip_start + 2, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 80), (_eid, _aisha_id, 80), (_eid, _marcus_id, 80), (_eid, _priya_id, 80);

  -- 6) Activities: Night Safari (Marcus paid, custom split — Priya skipped)
  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _marcus_id, 'Night Safari tickets', 165, _trip_currency, 'activities', _trip_start + 2, 'custom');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 55), (_eid, _aisha_id, 55), (_eid, _marcus_id, 55);

  -- 7) Transport: EZ-Link top-ups + Grab rides (owner paid)
  _eid := gen_random_uuid();
  INSERT INTO public.expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on, split_type)
  VALUES (_eid, p_trip_id, _owner_id, 'EZ-Link top-ups + Grab to airport', 68, _trip_currency, 'transport', _trip_end, 'equal');
  INSERT INTO public.expense_splits (expense_id, user_id, share_amount) VALUES
    (_eid, _owner_id, 17), (_eid, _aisha_id, 17), (_eid, _marcus_id, 17), (_eid, _priya_id, 17);

  -- Total: 280 + 96 + 32 + 112 + 320 + 165 + 68 = 1073
  RAISE NOTICE 'Inserted 7 expenses totaling % 1073 (accommodation 376, food 352, activities 277, transport 68)', _trip_currency;

  -- ---- Trip ideas ----
  INSERT INTO public.trip_ideas (trip_id, created_by, title, category, status) VALUES
    (p_trip_id, _aisha_id,  'Hawker Chan Michelin one-star chicken rice',         'food',     'suggested'),
    (p_trip_id, _marcus_id, 'Night Safari',                                       'activity', 'suggested'),
    (p_trip_id, _priya_id,  'Kaya toast breakfast at Ya Kun Kaya Toast',          'food',     'suggested'),
    (p_trip_id, _owner_id,  'Marina Bay Sands SkyPark observation deck',          'activity', 'suggested'),
    (p_trip_id, _aisha_id,  'Botanic Gardens orchid garden',                      'place',    'suggested'),
    (p_trip_id, _priya_id,  'Tiong Bahru Bakery for kouign-amann',                'food',     'suggested'),
    (p_trip_id, _marcus_id, 'Lau Pa Sat satay street at night',                   'food',     'suggested'),
    (p_trip_id, _aisha_id,  'Chinatown street food walk',                         'activity', 'suggested');

  RAISE NOTICE 'Inserted 8 ideas across food/activity/place';

  -- ---- Trip-level comments ----
  INSERT INTO public.comments (trip_id, itinerary_item_id, user_id, body, created_at) VALUES
    (p_trip_id, NULL, _aisha_id,  'Just looked at the itinerary — Marina Bay night looks amazing!!',          now() - interval '6 days'),
    (p_trip_id, NULL, _priya_id,  'Reminder: bring an umbrella, it rains every afternoon there',              now() - interval '5 days'),
    (p_trip_id, NULL, _marcus_id, 'Should we book Night Safari tickets in advance? Heard it sells out',       now() - interval '4 days'),
    (p_trip_id, NULL, _aisha_id,  'Saved Hawker Chan to ideas — heard the wait is brutal but worth it',       now() - interval '3 days'),
    (p_trip_id, NULL, _priya_id,  'Just checked weather: 30°C all week, bring layers for the AC indoors',     now() - interval '2 days'),
    (p_trip_id, NULL, _marcus_id, 'Anyone want to do an early morning Botanic Gardens walk Day 2?',           now() - interval '1 days');

  RAISE NOTICE 'Inserted 6 trip-level comments';

  -- ---- Poll: Sunday brunch ----
  _poll_id := gen_random_uuid();
  _opt_wh  := gen_random_uuid();
  _opt_ps  := gen_random_uuid();

  INSERT INTO public.polls (id, trip_id, type, title, status, multi_select)
  VALUES (_poll_id, p_trip_id, 'preference', 'Sunday brunch — Wild Honey or PS.Cafe?', 'open', false);

  INSERT INTO public.poll_options (id, poll_id, label, sort_order) VALUES
    (_opt_wh, _poll_id, 'Wild Honey (ION Orchard)', 0),
    (_opt_ps, _poll_id, 'PS.Cafe (Dempsey)',        1);

  -- 3 votes: 2 for Wild Honey, 1 for PS.Cafe (preference polls use yes/maybe/no semantics)
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

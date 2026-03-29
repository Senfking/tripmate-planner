
CREATE OR REPLACE FUNCTION public._seed_brazil_trip()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _oliver uuid := '1d5b21fe-f74c-429b-8d9d-938a4f295013';
  _juntob uuid := 'faa40b9a-a94d-43ba-8f6a-ad00855899b1';
  _trip_id uuid := gen_random_uuid();
  _trip_code text;
  _p_rio uuid := gen_random_uuid();
  _p_iguazu uuid := gen_random_uuid();
  _p_floripa uuid := gen_random_uuid();
  _p_bsas uuid := gen_random_uuid();
  _do_rio uuid := gen_random_uuid();
  _do_iguazu uuid := gen_random_uuid();
  _do_floripa uuid := gen_random_uuid();
  _do_bsas uuid := gen_random_uuid();
  _poll1 uuid := gen_random_uuid();
  _poll2 uuid := gen_random_uuid();
  _poll3 uuid := gen_random_uuid();
  _po1a uuid := gen_random_uuid();
  _po1b uuid := gen_random_uuid();
  _po2a uuid := gen_random_uuid();
  _po2b uuid := gen_random_uuid();
  _po3a uuid := gen_random_uuid();
  _po3b uuid := gen_random_uuid();
  _it1 uuid := gen_random_uuid();
  _eid uuid;
BEGIN
  _trip_code := public.generate_trip_code();

  -- Disable only user-defined triggers
  ALTER TABLE trips DISABLE TRIGGER auto_add_trip_owner;
  ALTER TABLE trips DISABLE TRIGGER auto_generate_trip_code;

  -- 1. Trip
  INSERT INTO trips (id, name, emoji, tentative_start_date, tentative_end_date, settlement_currency, vibe_board_active, trip_code)
  VALUES (_trip_id, 'Carine''s Wedding — Brazil May 2025', '💍', '2025-05-22', '2025-05-31', 'EUR', true, _trip_code);

  -- Re-enable triggers
  ALTER TABLE trips ENABLE TRIGGER auto_add_trip_owner;
  ALTER TABLE trips ENABLE TRIGGER auto_generate_trip_code;

  -- 2. Members
  INSERT INTO trip_members (trip_id, user_id, role) VALUES
    (_trip_id, _oliver, 'owner'),
    (_trip_id, _juntob, 'member');

  -- 3. Route stops
  INSERT INTO trip_route_stops (trip_id, destination, start_date, end_date, confirmed_by) VALUES
    (_trip_id, 'Rio de Janeiro', '2025-05-22', '2025-05-27', _oliver),
    (_trip_id, 'Iguazu Falls', '2025-05-28', '2025-05-29', _oliver),
    (_trip_id, 'Florianópolis', '2025-05-29', '2025-05-31', _oliver);

  -- 4. Proposals
  INSERT INTO trip_proposals (id, trip_id, destination, created_by, start_date, end_date, note) VALUES
    (_p_rio, _trip_id, 'Rio de Janeiro', _oliver, '2025-05-22', '2025-05-27', NULL),
    (_p_iguazu, _trip_id, 'Iguazu Falls', _juntob, '2025-05-28', '2025-05-29', NULL),
    (_p_floripa, _trip_id, 'Florianópolis', _oliver, '2025-05-29', '2025-05-31', 'Beautiful island to wind down after the wedding week'),
    (_p_bsas, _trip_id, 'Buenos Aires', _juntob, '2025-05-29', '2025-05-31', 'Alternative to Floripa if we want to go international');

  -- 5. Proposal reactions
  INSERT INTO proposal_reactions (proposal_id, user_id, value) VALUES
    (_p_rio, _oliver, 'up'), (_p_rio, _juntob, 'up'),
    (_p_iguazu, _oliver, 'up'), (_p_iguazu, _juntob, 'up'),
    (_p_floripa, _oliver, 'up'), (_p_floripa, _juntob, 'maybe'),
    (_p_bsas, _oliver, 'down'), (_p_bsas, _juntob, 'up');

  -- 6. Date options
  INSERT INTO proposal_date_options (id, proposal_id, start_date, end_date, created_by) VALUES
    (_do_rio, _p_rio, '2025-05-22', '2025-05-27', _oliver),
    (_do_iguazu, _p_iguazu, '2025-05-28', '2025-05-29', _juntob),
    (_do_floripa, _p_floripa, '2025-05-29', '2025-05-31', _oliver),
    (_do_bsas, _p_bsas, '2025-05-29', '2025-05-31', _juntob);

  -- 7. Date option votes
  INSERT INTO date_option_votes (date_option_id, user_id, value) VALUES
    (_do_rio, _oliver, 'yes'), (_do_rio, _juntob, 'yes'),
    (_do_iguazu, _oliver, 'yes'), (_do_iguazu, _juntob, 'yes'),
    (_do_floripa, _oliver, 'yes'), (_do_floripa, _juntob, 'maybe'),
    (_do_bsas, _oliver, 'no'), (_do_bsas, _juntob, 'yes');

  -- 8. Polls
  INSERT INTO polls (id, trip_id, type, title, status) VALUES
    (_poll1, _trip_id, 'structured', 'Boat ride at Iguazu?', 'open'),
    (_poll2, _trip_id, 'structured', 'Extra night in Florianópolis or fly home earlier?', 'open'),
    (_poll3, _trip_id, 'structured', 'Wedding gift — group present or individual?', 'open');

  -- 9. Poll options
  INSERT INTO poll_options (id, poll_id, label, sort_order) VALUES
    (_po1a, _poll1, 'Yes definitely', 0),
    (_po1b, _poll1, 'Maybe if not too touristy', 1),
    (_po2a, _poll2, 'Extra night', 0),
    (_po2b, _poll2, 'Fly home earlier', 1),
    (_po3a, _poll3, 'Group present', 0),
    (_po3b, _poll3, 'Individual', 1);

  -- 10. Votes
  INSERT INTO votes (poll_option_id, user_id, value) VALUES
    (_po1a, _oliver, 'yes'), (_po1a, _juntob, 'yes'),
    (_po2a, _oliver, 'yes');

  -- 11. Itinerary
  INSERT INTO itinerary_items (id, trip_id, day_date, start_time, title, location_text, status, created_by, sort_order) VALUES
    (_it1, _trip_id, '2025-05-22', '15:55', 'Land at GIG', 'Galeão Airport', 'confirmed', _oliver, 0),
    (gen_random_uuid(), _trip_id, '2025-05-22', '18:00', 'Check in', 'Santa Teresa Hotel', 'booked', _oliver, 1),
    (gen_random_uuid(), _trip_id, '2025-05-22', '20:00', 'Ipanema sunset walk + boteco dinner', 'Ipanema', 'planned', _juntob, 2);
  INSERT INTO itinerary_items (trip_id, day_date, start_time, title, location_text, status, created_by, sort_order) VALUES
    (_trip_id, '2025-05-23', '08:00', 'Christ the Redeemer — go early before the crowds', 'Corcovado', 'booked', _oliver, 0),
    (_trip_id, '2025-05-23', '12:00', 'Lunch in Santa Teresa + Selarón steps', 'Santa Teresa', 'planned', _juntob, 1),
    (_trip_id, '2025-05-23', '17:00', 'Sugarloaf sunset', 'Pão de Açúcar', 'planned', _oliver, 2);
  INSERT INTO itinerary_items (trip_id, day_date, start_time, title, location_text, status, created_by, sort_order) VALUES
    (_trip_id, '2025-05-24', '09:00', 'Tijuca rainforest hike', 'Floresta da Tijuca', 'idea', _juntob, 0),
    (_trip_id, '2025-05-24', '14:00', 'Ipanema beach', 'Ipanema Beach', 'planned', _oliver, 1),
    (_trip_id, '2025-05-24', '20:00', 'Dinner at Aprazível', 'Santa Teresa', 'idea', _juntob, 2);
  INSERT INTO itinerary_items (trip_id, day_date, start_time, title, location_text, status, created_by, sort_order) VALUES
    (_trip_id, '2025-05-25', '12:00', 'Lunch — easy chill day before wedding', 'Leblon', 'planned', _oliver, 0);
  INSERT INTO itinerary_items (trip_id, day_date, start_time, title, location_text, notes, status, created_by, sort_order) VALUES
    (_trip_id, '2025-05-26', NULL, 'Carine''s Wedding', 'Wedding venue, Rio', 'main activity: don''t embarrass us', 'confirmed', _oliver, 0);
  INSERT INTO itinerary_items (trip_id, day_date, start_time, title, location_text, status, created_by, sort_order) VALUES
    (_trip_id, '2025-05-27', '11:00', 'Late start — recovery beach day', 'Barra da Tijuca', 'planned', _juntob, 0),
    (_trip_id, '2025-05-27', '14:00', 'Churrasco lunch', 'Fogo de Chão Rio', 'planned', _oliver, 1),
    (_trip_id, '2025-05-27', '19:00', 'Boteco evening', 'Lapa', 'idea', _juntob, 2);
  INSERT INTO itinerary_items (trip_id, day_date, start_time, title, location_text, notes, status, created_by, sort_order) VALUES
    (_trip_id, '2025-05-28', '10:00', 'Fly GIG → IGU', 'Santos Dumont Airport', 'GIG → IGU aim 10:00–13:00 · ~2h15', 'confirmed', _oliver, 0),
    (_trip_id, '2025-05-28', '14:00', 'Brazil side of the falls', 'Parque Nacional do Iguaçu', NULL, 'booked', _oliver, 1),
    (_trip_id, '2025-05-28', '19:00', 'Dinner at Porto Canoas restaurant', 'Inside the national park', NULL, 'idea', _juntob, 2);
  INSERT INTO itinerary_items (trip_id, day_date, start_time, title, location_text, notes, status, created_by, sort_order) VALUES
    (_trip_id, '2025-05-29', '08:00', 'Argentina side: Devil''s Throat + optional boat ride', 'Parque Nacional Iguazú, Argentina', NULL, 'planned', _juntob, 0),
    (_trip_id, '2025-05-29', '18:00', 'Fly IGR → FLN', 'Cataratas del Iguazú Airport', 'IGR → FLN aim 18:00–21:00 · ~1h50 via GRU', 'confirmed', _oliver, 1);
  INSERT INTO itinerary_items (trip_id, day_date, start_time, title, location_text, status, created_by, sort_order) VALUES
    (_trip_id, '2025-05-30', '09:00', 'Joaquina beach', 'Joaquina', 'planned', _oliver, 0),
    (_trip_id, '2025-05-30', '13:00', 'Lunch at Ostradamus — fresh oysters', 'Ribeirão da Ilha', 'idea', _juntob, 1),
    (_trip_id, '2025-05-30', '18:00', 'Sunset drinks at the lagoon', 'Lagoa da Conceição', 'idea', _juntob, 2);
  INSERT INTO itinerary_items (trip_id, day_date, start_time, title, location_text, notes, status, created_by, sort_order) VALUES
    (_trip_id, '2025-05-31', '09:00', 'Santo Antônio de Lisboa — colonial village, last coffee', 'Santo Antônio de Lisboa', NULL, 'planned', _oliver, 0),
    (_trip_id, '2025-05-31', '18:00', 'Fly home FLN → GRU → DXB', 'Hercílio Luz Airport', 'FLN → GRU + GRU → DXB overnight ~14h', 'confirmed', _oliver, 1);

  -- 12. Attachments
  INSERT INTO attachments (trip_id, title, url, type, created_by) VALUES
    (_trip_id, 'Santa Teresa Hotel Rio', 'https://www.santateresahotel.com', 'link', _oliver),
    (_trip_id, 'Iguazu Falls Brazil side tour', 'https://www.viator.com/en-AE/tours/Puerto-Iguazu/Iguazu-Falls-Brazil-Side/d5028-5028IGUA_BRZ', 'link', _juntob),
    (_trip_id, 'Airbnb Florianópolis', 'https://www.airbnb.com/s/Florianopolis--Brazil', 'link', _oliver);

  -- 13+14. Expenses
  _eid := gen_random_uuid();
  INSERT INTO expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on) VALUES (_eid, _trip_id, _juntob, 'Flights DXB→Brazil return', 1360, 'EUR', 'transport', '2025-05-01');
  INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (_eid, _oliver, 680), (_eid, _juntob, 680);

  _eid := gen_random_uuid();
  INSERT INTO expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on) VALUES (_eid, _trip_id, _oliver, 'Santa Teresa Hotel 4 nights', 560, 'EUR', 'accommodation', '2025-05-22');
  INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (_eid, _oliver, 280), (_eid, _juntob, 280);

  _eid := gen_random_uuid();
  INSERT INTO expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on) VALUES (_eid, _trip_id, _juntob, 'Internal flight GIG→IGU', 180, 'EUR', 'transport', '2025-05-28');
  INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (_eid, _oliver, 90), (_eid, _juntob, 90);

  _eid := gen_random_uuid();
  INSERT INTO expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on) VALUES (_eid, _trip_id, _oliver, 'Internal flight IGR→FLN', 160, 'EUR', 'transport', '2025-05-29');
  INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (_eid, _oliver, 80), (_eid, _juntob, 80);

  _eid := gen_random_uuid();
  INSERT INTO expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on) VALUES (_eid, _trip_id, _juntob, 'Florianópolis Airbnb 2 nights', 220, 'EUR', 'accommodation', '2025-05-30');
  INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (_eid, _oliver, 110), (_eid, _juntob, 110);

  _eid := gen_random_uuid();
  INSERT INTO expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on) VALUES (_eid, _trip_id, _oliver, 'Churrasco lunch Fogo de Chão', 380, 'BRL', 'food & drink', '2025-05-27');
  INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (_eid, _oliver, 190), (_eid, _juntob, 190);

  _eid := gen_random_uuid();
  INSERT INTO expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on) VALUES (_eid, _trip_id, _juntob, 'Iguazu national park entry', 440, 'BRL', 'activities', '2025-05-28');
  INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (_eid, _oliver, 220), (_eid, _juntob, 220);

  _eid := gen_random_uuid();
  INSERT INTO expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on) VALUES (_eid, _trip_id, _oliver, 'Ipanema beach drinks', 120, 'BRL', 'food & drink', '2025-05-23');
  INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (_eid, _oliver, 60), (_eid, _juntob, 60);

  _eid := gen_random_uuid();
  INSERT INTO expenses (id, trip_id, payer_id, title, amount, currency, category, incurred_on) VALUES (_eid, _trip_id, _juntob, 'Taxi GIG to hotel', 180, 'BRL', 'transport', '2025-05-22');
  INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (_eid, _oliver, 90), (_eid, _juntob, 90);

  -- 15. Comment
  INSERT INTO comments (trip_id, itinerary_item_id, user_id, body) VALUES
    (_trip_id, _it1, _oliver, 'TEST DATA — remove before production');

  RETURN jsonb_build_object('trip_id', _trip_id, 'trip_code', _trip_code);
END;
$fn$;

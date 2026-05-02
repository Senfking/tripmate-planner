DO $migration$
DECLARE
  v_awin_mid    text := '18119';
  v_awin_affid  text := '2848261';
  v_updated     int;
  v_test_in     text;
  v_test_out    text;
  v_test_again  text;
  v_inner_ss    text;
BEGIN

-- URL-decode helper: handles + as space and %XX percent-encoding.
CREATE OR REPLACE FUNCTION pg_temp.urldecode(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v_in text;
  v_out text := '';
  v_i int := 1;
  v_len int;
  v_hex text;
  v_bytes bytea := ''::bytea;
  v_ch text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  v_in := replace(p, '+', ' ');
  v_len := length(v_in);
  -- Build a bytea by walking the string, then convert to UTF8 once at the end.
  WHILE v_i <= v_len LOOP
    v_ch := substring(v_in from v_i for 1);
    IF v_ch = '%' AND v_i + 2 <= v_len
       AND substring(v_in from v_i+1 for 2) ~ '^[0-9a-fA-F]{2}$' THEN
      v_hex := substring(v_in from v_i+1 for 2);
      v_bytes := v_bytes || decode(v_hex, 'hex');
      v_i := v_i + 3;
    ELSE
      v_bytes := v_bytes || convert_to(v_ch, 'UTF8');
      v_i := v_i + 1;
    END IF;
  END LOOP;
  BEGIN
    v_out := convert_from(v_bytes, 'UTF8');
  EXCEPTION WHEN OTHERS THEN
    v_out := p;
  END;
  RETURN v_out;
END
$f$;

-- Extract a query parameter value (URL-decoded) from a URL.
CREATE OR REPLACE FUNCTION pg_temp.qparam(p_url text, p_key text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v_q text; v_pair text; v_eq int; v_k text; v_v text;
BEGIN
  IF p_url IS NULL OR position('?' in p_url) = 0 THEN RETURN NULL; END IF;
  v_q := split_part(split_part(p_url, '?', 2), '#', 1);
  FOREACH v_pair IN ARRAY string_to_array(v_q, '&') LOOP
    v_eq := position('=' in v_pair);
    IF v_eq = 0 THEN v_k := v_pair; v_v := '';
    ELSE v_k := substring(v_pair from 1 for v_eq - 1); v_v := substring(v_pair from v_eq + 1);
    END IF;
    IF v_k = p_key THEN
      RETURN pg_temp.urldecode(v_v);
    END IF;
  END LOOP;
  RETURN NULL;
END
$f$;

CREATE OR REPLACE FUNCTION pg_temp.build_awin(
  p_ss text, p_checkin text, p_checkout text, p_trip_id text,
  p_mid text, p_affid text
) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v_inner text;
  v_parts text[] := ARRAY[]::text[];
BEGIN
  IF p_ss IS NULL OR length(trim(p_ss)) = 0 THEN RETURN NULL; END IF;
  v_parts := array_append(v_parts, 'ss=' || replace(replace(replace(replace(replace(
    p_ss, '%', '%25'), ' ', '%20'), '&', '%26'), '#', '%23'), '?', '%3F'));
  IF p_checkin  IS NOT NULL AND length(p_checkin)  > 0 THEN v_parts := array_append(v_parts, 'checkin='  || p_checkin);  END IF;
  IF p_checkout IS NOT NULL AND length(p_checkout) > 0 THEN v_parts := array_append(v_parts, 'checkout=' || p_checkout); END IF;
  v_parts := array_append(v_parts, 'aid=' || p_affid);
  v_inner := 'https://www.booking.com/searchresults.html?' || array_to_string(v_parts, '&');
  RETURN 'https://www.awin1.com/cread.php?awinmid=' || p_mid
    || '&awinaffid=' || p_affid
    || '&clickref=' || coalesce(p_trip_id, '')
    || '&ued=' || replace(replace(replace(replace(replace(replace(replace(
        v_inner,
        '%', '%25'), ' ', '%20'), '&', '%26'),
        '=', '%3D'), '?', '%3F'), '#', '%23'), ':', '%3A');
END
$f$;

CREATE OR REPLACE FUNCTION pg_temp.rewrite_booking_url(
  p_url text, p_checkin text, p_checkout text, p_trip_id text,
  p_mid text, p_affid text
) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v_ss text; v_ued text;
BEGIN
  IF p_url IS NULL THEN RETURN NULL; END IF;
  IF position('awin1.com/cread.php' in p_url) > 0 THEN
    v_ued := pg_temp.qparam(p_url, 'ued');
    IF v_ued IS NULL THEN RETURN p_url; END IF;
    v_ss := pg_temp.qparam(v_ued, 'ss');
    IF v_ss IS NULL THEN RETURN p_url; END IF;
    RETURN pg_temp.build_awin(v_ss,
      pg_temp.qparam(v_ued, 'checkin'),
      pg_temp.qparam(v_ued, 'checkout'),
      p_trip_id, p_mid, p_affid);
  END IF;
  IF position('booking.com' in p_url) = 0 THEN RETURN p_url; END IF;
  v_ss := pg_temp.qparam(p_url, 'ss');
  IF v_ss IS NULL OR length(trim(v_ss)) = 0 THEN RETURN p_url; END IF;
  RETURN pg_temp.build_awin(v_ss,
    coalesce(pg_temp.qparam(p_url, 'checkin'), p_checkin),
    coalesce(pg_temp.qparam(p_url, 'checkout'), p_checkout),
    p_trip_id, p_mid, p_affid);
END
$f$;

CREATE OR REPLACE FUNCTION pg_temp.rewrite_result(
  p_result jsonb, p_trip_start text, p_trip_end text, p_trip_id text,
  p_mid text, p_affid text
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v_dests jsonb; v_dest jsonb; v_days jsonb; v_day jsonb; v_acts jsonb; v_act jsonb;
  v_di int; v_dyi int; v_ai int;
  v_dest_in text; v_dest_out text;
  v_url text; v_new_url text; v_partner text;
BEGIN
  v_dests := p_result -> 'destinations';
  IF v_dests IS NULL OR jsonb_typeof(v_dests) <> 'array' THEN RETURN p_result; END IF;
  FOR v_di IN 0 .. jsonb_array_length(v_dests) - 1 LOOP
    v_dest := v_dests -> v_di;
    v_dest_in  := coalesce(v_dest ->> 'start_date', p_trip_start);
    v_dest_out := coalesce(v_dest ->> 'end_date',   p_trip_end);
    v_url := v_dest #>> '{accommodation,booking_url}';
    IF v_url IS NOT NULL THEN
      v_new_url := pg_temp.rewrite_booking_url(v_url, v_dest_in, v_dest_out, p_trip_id, p_mid, p_affid);
      IF v_new_url IS DISTINCT FROM v_url THEN
        p_result := jsonb_set(p_result,
          ARRAY['destinations', v_di::text, 'accommodation', 'booking_url'],
          to_jsonb(v_new_url), true);
        v_dests := p_result -> 'destinations';
        v_dest := v_dests -> v_di;
      END IF;
    END IF;
    v_days := v_dest -> 'days';
    IF v_days IS NOT NULL AND jsonb_typeof(v_days) = 'array' THEN
      FOR v_dyi IN 0 .. jsonb_array_length(v_days) - 1 LOOP
        v_day := v_days -> v_dyi;
        v_acts := v_day -> 'activities';
        IF v_acts IS NULL OR jsonb_typeof(v_acts) <> 'array' THEN CONTINUE; END IF;
        FOR v_ai IN 0 .. jsonb_array_length(v_acts) - 1 LOOP
          v_act := v_acts -> v_ai;
          v_partner := v_act ->> 'booking_partner';
          IF v_partner IS DISTINCT FROM 'booking' THEN CONTINUE; END IF;
          v_url := v_act ->> 'booking_url';
          IF v_url IS NULL THEN CONTINUE; END IF;
          v_new_url := pg_temp.rewrite_booking_url(v_url, v_dest_in, v_dest_out, p_trip_id, p_mid, p_affid);
          IF v_new_url IS DISTINCT FROM v_url THEN
            p_result := jsonb_set(p_result,
              ARRAY['destinations', v_di::text, 'days', v_dyi::text, 'activities', v_ai::text, 'booking_url'],
              to_jsonb(v_new_url), true);
            v_dests := p_result -> 'destinations';
            v_dest := v_dests -> v_di;
            v_days := v_dest -> 'days';
            v_day := v_days -> v_dyi;
            v_acts := v_day -> 'activities';
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
  RETURN p_result;
END
$f$;

-- Self-tests
v_test_in  := 'https://www.booking.com/search.html?ss=Hotel%20Arts%20Barcelona&aid=';
v_test_out := pg_temp.rewrite_booking_url(v_test_in, '2026-07-20', '2026-07-24', 'trip-abc', v_awin_mid, v_awin_affid);
IF v_test_out IS NULL OR position('awin1.com/cread.php' in v_test_out) = 0
   OR position('awinmid=' || v_awin_mid in v_test_out) = 0
   OR position('awinaffid=' || v_awin_affid in v_test_out) = 0
   OR position('clickref=trip-abc' in v_test_out) = 0
   OR position('ued=' in v_test_out) = 0 THEN
  RAISE EXCEPTION 'Self-test 1 failed: stale URL not rewritten. Got: %', v_test_out;
END IF;

-- Test urldecode directly
IF pg_temp.urldecode('Hotel%20Arts%20Barcelona') <> 'Hotel Arts Barcelona' THEN
  RAISE EXCEPTION 'Self-test urldecode-ascii failed: %', pg_temp.urldecode('Hotel%20Arts%20Barcelona');
END IF;
IF pg_temp.urldecode('Reykjav%C3%ADk') <> 'Reykjavík' THEN
  RAISE EXCEPTION 'Self-test urldecode-utf8 failed: %', pg_temp.urldecode('Reykjav%C3%ADk');
END IF;

v_test_again := pg_temp.rewrite_booking_url(v_test_out, '2026-07-20', '2026-07-24', 'trip-abc', v_awin_mid, v_awin_affid);
IF v_test_again IS DISTINCT FROM v_test_out THEN
  RAISE EXCEPTION 'Self-test 2 failed: not idempotent. First: % | Second: %', v_test_out, v_test_again;
END IF;

v_test_in  := 'https://maps.google.com/?cid=12345';
v_test_out := pg_temp.rewrite_booking_url(v_test_in, '2026-07-20', '2026-07-24', 'trip-abc', v_awin_mid, v_awin_affid);
IF v_test_out IS DISTINCT FROM v_test_in THEN
  RAISE EXCEPTION 'Self-test 3 failed: non-booking URL altered. Got: %', v_test_out;
END IF;

v_test_in  := 'https://www.booking.com/search.html?ss=Hotel%20Reykjav%C3%ADk%20Saga&aid=';
v_test_out := pg_temp.rewrite_booking_url(v_test_in, NULL, NULL, 'trip-xyz', v_awin_mid, v_awin_affid);
v_inner_ss := pg_temp.qparam(pg_temp.qparam(v_test_out, 'ued'), 'ss');
IF v_inner_ss IS NULL OR position('Reykjav' in v_inner_ss) = 0 THEN
  RAISE EXCEPTION 'Self-test 4 failed: ss not preserved. ued.ss: %', v_inner_ss;
END IF;

RAISE NOTICE 'All self-tests passed. Proceeding with backfill UPDATE.';

WITH updated AS (
  UPDATE ai_trip_plans p
  SET result = pg_temp.rewrite_result(
    p.result,
    (SELECT t.tentative_start_date::text FROM trips t WHERE t.id = p.trip_id),
    (SELECT t.tentative_end_date::text   FROM trips t WHERE t.id = p.trip_id),
    p.trip_id::text,
    v_awin_mid,
    v_awin_affid
  )
  WHERE p.result::text LIKE '%booking.com%'
    AND p.result::text NOT LIKE '%awin1.com%'
  RETURNING 1
)
SELECT count(*) INTO v_updated FROM updated;

RAISE NOTICE 'Backfill complete. Rows updated: %', v_updated;

END
$migration$;
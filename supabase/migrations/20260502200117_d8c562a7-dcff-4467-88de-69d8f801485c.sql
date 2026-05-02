DO $migration$
DECLARE
  v_updated     int;
  v_test_in     text;
  v_test_out    text;
  v_test_again  text;
  v_inner       text;
BEGIN

CREATE OR REPLACE FUNCTION pg_temp.urldecode(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v_in text; v_out text := '';
  v_i int := 1; v_len int;
  v_hex text; v_bytes bytea := ''::bytea; v_ch text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  v_in := replace(p, '+', ' ');
  v_len := length(v_in);
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

CREATE OR REPLACE FUNCTION pg_temp.urlencode_component(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v_bytes bytea;
  v_out text := '';
  v_i int;
  v_b int;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  v_bytes := convert_to(p, 'UTF8');
  FOR v_i IN 0 .. octet_length(v_bytes) - 1 LOOP
    v_b := get_byte(v_bytes, v_i);
    IF (v_b BETWEEN 48 AND 57)
       OR (v_b BETWEEN 65 AND 90)
       OR (v_b BETWEEN 97 AND 122)
       OR v_b = 45
       OR v_b = 46
       OR v_b = 95
       OR v_b = 126
    THEN
      v_out := v_out || chr(v_b);
    ELSE
      v_out := v_out || '%' || upper(lpad(to_hex(v_b), 2, '0'));
    END IF;
  END LOOP;
  RETURN v_out;
END
$f$;

CREATE OR REPLACE FUNCTION pg_temp.qparam_raw(p_url text, p_key text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v_q text; v_pair text; v_eq int; v_k text;
BEGIN
  IF p_url IS NULL OR position('?' in p_url) = 0 THEN RETURN NULL; END IF;
  v_q := substring(p_url from position('?' in p_url) + 1);
  IF position('#' in v_q) > 0 THEN
    v_q := substring(v_q from 1 for position('#' in v_q) - 1);
  END IF;
  FOREACH v_pair IN ARRAY string_to_array(v_q, '&') LOOP
    v_eq := position('=' in v_pair);
    IF v_eq = 0 THEN
      v_k := v_pair;
      IF v_k = p_key THEN RETURN ''; END IF;
    ELSE
      v_k := substring(v_pair from 1 for v_eq - 1);
      IF v_k = p_key THEN RETURN substring(v_pair from v_eq + 1); END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END
$f$;

CREATE OR REPLACE FUNCTION pg_temp.reencode_awin_url(p_url text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v_qs text;
  v_pair text;
  v_eq int;
  v_k text; v_v text;
  v_pairs text[] := ARRAY[]::text[];
  v_ued_decoded text;
  v_ued_encoded text;
BEGIN
  IF p_url IS NULL THEN RETURN NULL; END IF;
  IF position('awin1.com/cread.php' in p_url) = 0 THEN RETURN p_url; END IF;
  IF position('?' in p_url) = 0 THEN RETURN p_url; END IF;

  v_qs := substring(p_url from position('?' in p_url) + 1);
  IF position('#' in v_qs) > 0 THEN
    v_qs := substring(v_qs from 1 for position('#' in v_qs) - 1);
  END IF;

  FOREACH v_pair IN ARRAY string_to_array(v_qs, '&') LOOP
    v_eq := position('=' in v_pair);
    IF v_eq = 0 THEN
      v_pairs := array_append(v_pairs, v_pair);
      CONTINUE;
    END IF;
    v_k := substring(v_pair from 1 for v_eq - 1);
    v_v := substring(v_pair from v_eq + 1);
    IF v_k = 'ued' THEN
      v_ued_decoded := pg_temp.urldecode(v_v);
      v_ued_encoded := pg_temp.urlencode_component(v_ued_decoded);
      v_pairs := array_append(v_pairs, 'ued=' || v_ued_encoded);
    ELSE
      v_pairs := array_append(v_pairs, v_pair);
    END IF;
  END LOOP;

  RETURN substring(p_url from 1 for position('?' in p_url) - 1)
    || '?' || array_to_string(v_pairs, '&');
END
$f$;

CREATE OR REPLACE FUNCTION pg_temp.reencode_result(p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  v_dests jsonb; v_dest jsonb; v_days jsonb; v_day jsonb; v_acts jsonb; v_act jsonb;
  v_di int; v_dyi int; v_ai int;
  v_url text; v_new_url text;
BEGIN
  v_dests := p_result -> 'destinations';
  IF v_dests IS NULL OR jsonb_typeof(v_dests) <> 'array' THEN RETURN p_result; END IF;

  FOR v_di IN 0 .. jsonb_array_length(v_dests) - 1 LOOP
    v_dest := v_dests -> v_di;

    v_url := v_dest #>> '{accommodation,booking_url}';
    IF v_url IS NOT NULL THEN
      v_new_url := pg_temp.reencode_awin_url(v_url);
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
          v_url := v_act ->> 'booking_url';
          IF v_url IS NULL THEN CONTINUE; END IF;
          v_new_url := pg_temp.reencode_awin_url(v_url);
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

IF pg_temp.urlencode_component('https://www.booking.com/searchresults.html?ss=Hotel X&aid=2848261')
   <> 'https%3A%2F%2Fwww.booking.com%2Fsearchresults.html%3Fss%3DHotel%20X%26aid%3D2848261' THEN
  RAISE EXCEPTION 'Self-test urlencode-basic failed';
END IF;

v_test_in := 'https://www.awin1.com/cread.php?awinmid=18119&awinaffid=2848261&clickref=trip-abc'
  || '&ued=https%3A//www.booking.com/searchresults.html%3Fss%3DCan%2520Quince%26checkin%3D2026-04-20%26checkout%3D2026-04-22%26aid%3D2848261';

v_test_out := pg_temp.reencode_awin_url(v_test_in);

IF position('https%3A%2F%2Fwww.booking.com%2Fsearchresults.html' in v_test_out) = 0 THEN
  RAISE EXCEPTION 'Self-test slash failed: %', v_test_out;
END IF;

IF position('awinmid=18119' in v_test_out) = 0
   OR position('awinaffid=2848261' in v_test_out) = 0
   OR position('clickref=trip-abc' in v_test_out) = 0 THEN
  RAISE EXCEPTION 'Self-test tracking-params failed: %', v_test_out;
END IF;

v_inner := pg_temp.urldecode(pg_temp.qparam_raw(v_test_out, 'ued'));
IF position('https://www.booking.com/searchresults.html?' in v_inner) = 0 THEN
  RAISE EXCEPTION 'Self-test inner-url failed: %', v_inner;
END IF;
IF position('ss=Can' in v_inner) = 0
   OR position('checkin=2026-04-20' in v_inner) = 0
   OR position('checkout=2026-04-22' in v_inner) = 0
   OR position('aid=2848261' in v_inner) = 0 THEN
  RAISE EXCEPTION 'Self-test inner-params failed: %', v_inner;
END IF;

v_test_again := pg_temp.reencode_awin_url(v_test_out);
IF v_test_again IS DISTINCT FROM v_test_out THEN
  RAISE EXCEPTION 'Self-test idempotency failed';
END IF;

IF pg_temp.reencode_awin_url('https://maps.google.com/?cid=12345') <> 'https://maps.google.com/?cid=12345' THEN
  RAISE EXCEPTION 'Self-test non-awin-passthrough failed';
END IF;

RAISE NOTICE 'All self-tests passed.';

WITH updated AS (
  UPDATE ai_trip_plans p
  SET result = pg_temp.reencode_result(p.result)
  WHERE p.result::text LIKE '%awin1.com/cread.php%'
  RETURNING 1
)
SELECT count(*) INTO v_updated FROM updated;

RAISE NOTICE 'Re-encode complete. Rows updated: %', v_updated;

END
$migration$;
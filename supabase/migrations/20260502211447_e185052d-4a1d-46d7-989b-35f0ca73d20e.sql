-- =========================================================================
-- Backfill: revert Booking.com inner URLs from /searchresults.html (PR #248)
-- back to lenient /search.html, stripping checkin/checkout/aid. The Awin
-- wrapper (awinmid, awinaffid, clickref) is preserved as-is.
--
-- Strategy: operate purely on the percent-encoded form of the inner URL
-- (the `ued=` param value). This avoids any decode/encode round-trip and
-- guarantees byte-for-byte stability of the `ss=` value.
-- =========================================================================

-- 1) Snapshot current state so this revert is itself reversible.
DROP TABLE IF EXISTS public.ai_trip_plans_backup_pre_search_html_revert;
CREATE TABLE public.ai_trip_plans_backup_pre_search_html_revert AS
TABLE public.ai_trip_plans;

-- 2) Helper: rewrite a single booking_url string. Pure function.
--    Operates on the encoded form: substring replacement + regex stripping
--    of date/aid query params. Works for both Awin-wrapped (where the inner
--    URL appears percent-encoded inside `ued=`) and bare booking.com URLs.
CREATE OR REPLACE FUNCTION public.__revert_booking_url(_url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _out text := _url;
BEGIN
  IF _url IS NULL OR _url = '' THEN
    RETURN _url;
  END IF;

  IF position('booking.com' in _out) = 0 THEN
    RETURN _out;  -- not a Booking link, leave alone
  END IF;

  -- Path swap: handle both encoded (inside ued=) and unencoded forms.
  _out := replace(_out, '%2Fsearchresults.html%3F', '%2Fsearch.html%3F');
  _out := replace(_out, '/searchresults.html?',     '/search.html?');

  -- Strip checkin / checkout / aid from the inner Booking URL.
  -- Encoded form: &checkin=...  is &checkin%3D...%26  or terminates with end-of-ued.
  -- We strip "%26(checkin|checkout|aid)%3D<value>" up to the next %26 or end-of-string.
  _out := regexp_replace(
    _out,
    '%26(checkin|checkout|aid)%3D[^%&]*',
    '',
    'g'
  );
  -- Same for unencoded form (if any bare booking.com URLs slipped through).
  _out := regexp_replace(
    _out,
    '&(checkin|checkout|aid)=[^&]*',
    '',
    'g'
  );

  RETURN _out;
END;
$$;

-- 3) Self-test — abort migration if the rewrite doesn't behave as expected.
DO $$
DECLARE
  _input text := 'https://www.awin1.com/cread.php?awinmid=18119&awinaffid=2848261&clickref=test-trip-id&ued=https%3A%2F%2Fwww.booking.com%2Fsearchresults.html%3Fss%3DRove%2520Downtown%2520Dubai%26checkin%3D2026-05-10%26checkout%3D2026-05-12%26aid%3D2848261';
  _expected text := 'https://www.awin1.com/cread.php?awinmid=18119&awinaffid=2848261&clickref=test-trip-id&ued=https%3A%2F%2Fwww.booking.com%2Fsearch.html%3Fss%3DRove%2520Downtown%2520Dubai';
  _actual text;
  _bare_input text := 'https://www.booking.com/searchresults.html?ss=Hotel%20X&checkin=2026-01-01&checkout=2026-01-02&aid=2848261';
  _bare_expected text := 'https://www.booking.com/search.html?ss=Hotel%20X';
BEGIN
  _actual := public.__revert_booking_url(_input);
  IF _actual <> _expected THEN
    RAISE EXCEPTION 'Awin self-test failed.\n  expected: %\n  actual:   %', _expected, _actual;
  END IF;

  _actual := public.__revert_booking_url(_bare_input);
  IF _actual <> _bare_expected THEN
    RAISE EXCEPTION 'Bare URL self-test failed.\n  expected: %\n  actual:   %', _bare_expected, _actual;
  END IF;

  -- Idempotence: running twice should produce the same result.
  IF public.__revert_booking_url(_expected) <> _expected THEN
    RAISE EXCEPTION 'Idempotence self-test failed';
  END IF;

  -- Non-booking URLs pass through untouched.
  IF public.__revert_booking_url('https://www.viator.com/searchResults/all?text=foo') <>
                                   'https://www.viator.com/searchResults/all?text=foo' THEN
    RAISE EXCEPTION 'Pass-through self-test failed';
  END IF;
END $$;

-- 4) Recursive walker: rewrite every booking_url string anywhere inside the JSON.
CREATE OR REPLACE FUNCTION public.__rewrite_booking_urls_in_jsonb(_in jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _key text;
  _val jsonb;
  _out jsonb := _in;
  _arr jsonb := '[]'::jsonb;
  _elem jsonb;
BEGIN
  IF _in IS NULL THEN RETURN _in; END IF;

  IF jsonb_typeof(_in) = 'object' THEN
    FOR _key, _val IN SELECT * FROM jsonb_each(_in) LOOP
      IF _key = 'booking_url' AND jsonb_typeof(_val) = 'string' THEN
        _out := jsonb_set(_out, ARRAY[_key],
          to_jsonb(public.__revert_booking_url(_val #>> '{}')));
      ELSE
        _out := jsonb_set(_out, ARRAY[_key],
          public.__rewrite_booking_urls_in_jsonb(_val));
      END IF;
    END LOOP;
    RETURN _out;
  ELSIF jsonb_typeof(_in) = 'array' THEN
    FOR _elem IN SELECT * FROM jsonb_array_elements(_in) LOOP
      _arr := _arr || jsonb_build_array(public.__rewrite_booking_urls_in_jsonb(_elem));
    END LOOP;
    RETURN _arr;
  ELSE
    RETURN _in;
  END IF;
END;
$$;

-- 5) Apply the rewrite to every row whose result JSON mentions the broken path.
UPDATE public.ai_trip_plans
SET result = public.__rewrite_booking_urls_in_jsonb(result)
WHERE result::text LIKE '%booking.com%searchresults.html%'
   OR result::text LIKE '%booking.com%2Fsearchresults.html%';

-- 6) Sanity check post-update: no remaining /searchresults.html references.
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.ai_trip_plans
  WHERE result::text LIKE '%booking.com%searchresults.html%'
     OR result::text LIKE '%booking.com%2Fsearchresults.html%';
  IF _n > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % rows still reference /searchresults.html', _n;
  END IF;
END $$;

-- 7) Drop the helper functions (one-shot; no need to keep them around).
DROP FUNCTION IF EXISTS public.__revert_booking_url(text);
DROP FUNCTION IF EXISTS public.__rewrite_booking_urls_in_jsonb(jsonb);

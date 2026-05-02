-- One-time backfill: rewrite stale Booking.com URLs in ai_trip_plans.result
-- to use the new Awin tracking wrapper introduced in PR #248
-- (commit 17145906, merged 2026-05-02 17:41:44 UTC).
--
-- Trip plans saved before PR #248 still hold pre-PR URLs of the form
--     https://www.booking.com/search.html?ss=<HotelName>&aid=&checkin=...
-- which (a) hit a 404 page on Booking.com (the path doesn't exist) and (b)
-- carry no affiliate tracking. This migration rewrites them to
--     https://www.awin1.com/cread.php?awinmid=18119&awinaffid=2848261&clickref=<trip_id>&ued=<encoded>
-- where the encoded inner URL uses the correct /searchresults.html path with
-- checkin/checkout pre-filled from the corresponding trips row.
--
-- Mirrors the rewriteCachedBookingUrls() helper in
-- supabase/functions/generate-trip-itinerary/index.ts: peel any existing
-- awin1.com wrapper to recover the inner Booking URL via `ued`, extract the
-- search query (`ss`), then rebuild the destination URL and re-wrap.
--
-- Awin IDs (publisher 2848261, LATAM merchant 18119) are public — same
-- values as the AWIN_PUBLISHER_ID / AWIN_BOOKING_MID secrets, hardcoded
-- here since this is a static one-time backfill.
--
-- Scope: every destinations[].accommodation.booking_url (the user-facing
-- locus per the bug report) AND every destinations[].days[].activities[]
-- where booking_partner = 'booking' (rare, but the JS helper covers it for
-- completeness so we mirror the surface area exactly).
--
-- Idempotent: re-applying to an already-wrapped URL produces the same
-- output, since we always rebuild from `ss` + the trip's date range.

BEGIN;

-- Percent-encode a string using the unreserved set [A-Za-z0-9_.~-]
-- (RFC 3986). Multi-byte characters are expanded to their UTF-8 byte
-- sequence and each byte percent-encoded — matches encodeURIComponent in
-- JS for the alphabet we care about.
CREATE OR REPLACE FUNCTION pg_temp.urlencode_bookbf(input text)
RETURNS text AS $$
DECLARE
  result text := '';
  ch text;
  bytes bytea;
  i int;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;
  FOR ch IN SELECT regexp_split_to_table(input, '') LOOP
    IF ch ~ '^[A-Za-z0-9_.~-]$' THEN
      result := result || ch;
    ELSE
      bytes := convert_to(ch, 'UTF8');
      FOR i IN 0..length(bytes) - 1 LOOP
        result := result || '%' || upper(to_hex(get_byte(bytes, i)));
      END LOOP;
    END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Inverse of urlencode_bookbf. Used to peel `ued=` out of an existing
-- awin1.com wrapper so we can re-extract the inner Booking URL's `ss`.
-- Treats '+' as space (form-urlencoded convention) so values written by
-- JS URLSearchParams round-trip cleanly.
CREATE OR REPLACE FUNCTION pg_temp.urldecode_bookbf(input text)
RETURNS text AS $$
DECLARE
  bytes bytea := ''::bytea;
  i int := 1;
  n int;
  ch text;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;
  n := length(input);
  WHILE i <= n LOOP
    ch := substr(input, i, 1);
    IF ch = '%' AND i + 2 <= n THEN
      bytes := bytes || decode(substr(input, i + 1, 2), 'hex');
      i := i + 3;
    ELSIF ch = '+' THEN
      bytes := bytes || decode('20', 'hex');
      i := i + 1;
    ELSE
      bytes := bytes || convert_to(ch, 'UTF8');
      i := i + 1;
    END IF;
  END LOOP;
  RETURN convert_from(bytes, 'UTF8');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Pull the still-encoded value of a single query param from a URL. Returns
-- NULL if the key isn't present. Only called with literal keys ('ss',
-- 'ued') so regex-metacharacter escaping in `key` is intentionally skipped.
CREATE OR REPLACE FUNCTION pg_temp.url_query_param_bookbf(url text, key text)
RETURNS text AS $$
DECLARE
  qs text;
  m text[];
BEGIN
  IF url IS NULL THEN
    RETURN NULL;
  END IF;
  qs := split_part(split_part(url, '?', 2), '#', 1);
  IF qs = '' THEN
    RETURN NULL;
  END IF;
  m := regexp_match(qs, '(?:^|&)' || key || '=([^&]*)');
  IF m IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN m[1];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Core rewrite: maps any Booking.com URL (raw, with /search.html, or
-- already wrapped via awin1.com) to a correctly-wrapped Awin URL with
-- /searchresults.html and the trip's checkin/checkout. NULL/empty input
-- and unparseable URLs pass through unchanged.
CREATE OR REPLACE FUNCTION pg_temp.rewrite_booking_url_bookbf(
  existing_url text,
  trip_id uuid,
  checkin date,
  checkout date
) RETURNS text AS $$
DECLARE
  inner_url text;
  ss_raw text;
  ss_canonical text;
  rebuilt_inner text;
  encoded_inner text;
  result text;
  awin_pub constant text := '2848261';
  awin_mid constant text := '18119';
BEGIN
  IF existing_url IS NULL OR existing_url = '' THEN
    RETURN existing_url;
  END IF;

  -- Peel any existing awin1.com wrapper to recover the inner Booking URL.
  IF position('awin1.com' IN existing_url) > 0 THEN
    inner_url := pg_temp.urldecode_bookbf(
      pg_temp.url_query_param_bookbf(existing_url, 'ued')
    );
    IF inner_url IS NULL THEN
      -- Wrapped link with no ued — leave alone, nothing we can do.
      RETURN existing_url;
    END IF;
  ELSE
    inner_url := existing_url;
  END IF;

  -- Pull the search query. Decode-then-re-encode normalizes any
  -- non-canonical encoding (e.g. uppercase vs lowercase hex, '+' vs '%20')
  -- so the output matches what the live edge function would produce.
  ss_raw := pg_temp.url_query_param_bookbf(inner_url, 'ss');
  IF ss_raw IS NULL THEN
    RETURN existing_url;
  END IF;
  ss_canonical := pg_temp.urlencode_bookbf(pg_temp.urldecode_bookbf(ss_raw));
  IF ss_canonical = '' THEN
    RETURN existing_url;
  END IF;

  -- Build the fresh Booking destination URL. /searchresults.html is the
  -- correct path; the legacy /search.html returns 404. checkin/checkout
  -- are appended only when the trip has dates set.
  rebuilt_inner := 'https://www.booking.com/searchresults.html?ss=' || ss_canonical;
  IF checkin IS NOT NULL THEN
    rebuilt_inner := rebuilt_inner || '&checkin=' || to_char(checkin, 'YYYY-MM-DD');
  END IF;
  IF checkout IS NOT NULL THEN
    rebuilt_inner := rebuilt_inner || '&checkout=' || to_char(checkout, 'YYYY-MM-DD');
  END IF;

  -- Wrap with Awin. clickref is the trip ID so clicks attribute back to
  -- this specific trip via Awin's transactions report.
  encoded_inner := pg_temp.urlencode_bookbf(rebuilt_inner);
  result := 'https://www.awin1.com/cread.php?awinmid=' || awin_mid
            || '&awinaffid=' || awin_pub;
  IF trip_id IS NOT NULL THEN
    result := result || '&clickref=' || trip_id::text;
  END IF;
  result := result || '&ued=' || encoded_inner;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Walk the full trip plan, rewriting booking_url on every accommodation
-- and on every activity where booking_partner = 'booking', across all
-- destinations (not just destinations[0] — multi-destination trips exist).
-- Each destination uses its own start_date / end_date when set; the
-- trip-level dates are only a fallback for legs missing per-destination
-- dates. This matches the live edge function, which passes per-destination
-- check-in/check-out at runtime — applying a single trip-level pair to
-- every leg of a Bali → Singapore trip would bake Bali dates into the
-- Singapore hotel URL.
-- jsonb_set runs in-place on a working copy; rows whose URLs already
-- match the canonical wrapped form are no-ops.
CREATE OR REPLACE FUNCTION pg_temp.rewrite_plan_result_bookbf(
  plan_result jsonb,
  trip_id uuid,
  fallback_checkin date,
  fallback_checkout date
) RETURNS jsonb AS $$
DECLARE
  out_result jsonb := plan_result;
  destinations jsonb;
  d_idx int;
  d_count int;
  dest_checkin date;
  dest_checkout date;
  dest_start_text text;
  dest_end_text text;
  accom jsonb;
  days jsonb;
  day_idx int;
  day_count int;
  acts jsonb;
  act jsonb;
  act_idx int;
  act_count int;
  current_url text;
  next_url text;
  partner text;
BEGIN
  destinations := out_result -> 'destinations';
  IF destinations IS NULL OR jsonb_typeof(destinations) <> 'array' THEN
    RETURN out_result;
  END IF;

  d_count := jsonb_array_length(destinations);
  FOR d_idx IN 0..d_count - 1 LOOP
    -- Resolve per-destination dates with trip-level fallback. Wrap each
    -- cast in a sub-block so a malformed date string degrades to the
    -- fallback rather than aborting the migration.
    dest_start_text := NULLIF(out_result #>> ARRAY['destinations', d_idx::text, 'start_date'], '');
    dest_end_text   := NULLIF(out_result #>> ARRAY['destinations', d_idx::text, 'end_date'],   '');
    BEGIN
      dest_checkin := COALESCE(dest_start_text::date, fallback_checkin);
    EXCEPTION WHEN others THEN
      dest_checkin := fallback_checkin;
    END;
    BEGIN
      dest_checkout := COALESCE(dest_end_text::date, fallback_checkout);
    EXCEPTION WHEN others THEN
      dest_checkout := fallback_checkout;
    END;

    -- Accommodation
    accom := out_result -> 'destinations' -> d_idx -> 'accommodation';
    IF accom IS NOT NULL AND jsonb_typeof(accom) = 'object' THEN
      partner := accom ->> 'booking_partner';
      IF partner = 'booking' THEN
        current_url := accom ->> 'booking_url';
        next_url := pg_temp.rewrite_booking_url_bookbf(current_url, trip_id, dest_checkin, dest_checkout);
        IF next_url IS DISTINCT FROM current_url THEN
          out_result := jsonb_set(
            out_result,
            ARRAY['destinations', d_idx::text, 'accommodation', 'booking_url'],
            to_jsonb(next_url),
            false
          );
        END IF;
      END IF;
    END IF;

    -- Activities
    days := out_result -> 'destinations' -> d_idx -> 'days';
    IF days IS NULL OR jsonb_typeof(days) <> 'array' THEN
      CONTINUE;
    END IF;
    day_count := jsonb_array_length(days);
    FOR day_idx IN 0..day_count - 1 LOOP
      acts := out_result -> 'destinations' -> d_idx -> 'days' -> day_idx -> 'activities';
      IF acts IS NULL OR jsonb_typeof(acts) <> 'array' THEN
        CONTINUE;
      END IF;
      act_count := jsonb_array_length(acts);
      FOR act_idx IN 0..act_count - 1 LOOP
        act := acts -> act_idx;
        partner := act ->> 'booking_partner';
        IF partner IS DISTINCT FROM 'booking' THEN
          CONTINUE;
        END IF;
        current_url := act ->> 'booking_url';
        next_url := pg_temp.rewrite_booking_url_bookbf(current_url, trip_id, dest_checkin, dest_checkout);
        IF next_url IS DISTINCT FROM current_url THEN
          out_result := jsonb_set(
            out_result,
            ARRAY['destinations', d_idx::text, 'days', day_idx::text, 'activities', act_idx::text, 'booking_url'],
            to_jsonb(next_url),
            false
          );
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN out_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper-level self-test. Build a synthetic two-leg payload with distinct
-- per-leg dates, run the walker, and assert each leg's wrapped URL encodes
-- its own dates (not the fallback, not the other leg's). Also re-runs the
-- walker on its own output to assert idempotency. Any assertion failure
-- raises and rolls back the whole migration before the UPDATE fires, so
-- no real rows are touched if the rewrite logic regresses.
DO $$
DECLARE
  synthetic jsonb;
  rewritten jsonb;
  url_a text;
  url_b text;
  dest_a text;
  dest_b text;
  url_a2 text;
BEGIN
  synthetic := '{
    "destinations": [
      {
        "name": "Bali",
        "start_date": "2026-06-01",
        "end_date":   "2026-06-05",
        "accommodation": {
          "booking_partner": "booking",
          "booking_url": "https://www.booking.com/search.html?ss=Hanging+Gardens+Bali&aid="
        },
        "days": []
      },
      {
        "name": "Singapore",
        "start_date": "2026-06-06",
        "end_date":   "2026-06-10",
        "accommodation": {
          "booking_partner": "booking",
          "booking_url": "https://www.booking.com/search.html?ss=Marina+Bay+Sands&aid="
        },
        "days": []
      }
    ]
  }'::jsonb;

  rewritten := pg_temp.rewrite_plan_result_bookbf(
    synthetic,
    NULL::uuid,
    DATE '2026-01-01',  -- fallback should NOT be used: per-leg dates are set
    DATE '2026-01-31'
  );

  url_a := rewritten #>> '{destinations,0,accommodation,booking_url}';
  url_b := rewritten #>> '{destinations,1,accommodation,booking_url}';

  IF position('awin1.com' IN url_a) = 0
     OR position('awin1.com' IN url_b) = 0 THEN
    RAISE EXCEPTION 'self-test: rewrite did not wrap with awin1.com (a=%, b=%)', url_a, url_b;
  END IF;

  dest_a := pg_temp.urldecode_bookbf(pg_temp.url_query_param_bookbf(url_a, 'ued'));
  dest_b := pg_temp.urldecode_bookbf(pg_temp.url_query_param_bookbf(url_b, 'ued'));

  IF dest_a NOT LIKE '%/searchresults.html%' OR dest_b NOT LIKE '%/searchresults.html%' THEN
    RAISE EXCEPTION 'self-test: rebuilt URL is not /searchresults.html (a=%, b=%)', dest_a, dest_b;
  END IF;

  IF dest_a NOT LIKE '%checkin=2026-06-01%checkout=2026-06-05%' THEN
    RAISE EXCEPTION 'self-test: leg A dates do not match destinations[0] start/end (decoded=%)', dest_a;
  END IF;
  IF dest_b NOT LIKE '%checkin=2026-06-06%checkout=2026-06-10%' THEN
    RAISE EXCEPTION 'self-test: leg B dates do not match destinations[1] start/end (decoded=%)', dest_b;
  END IF;

  IF dest_a = dest_b THEN
    RAISE EXCEPTION 'self-test: legs produced identical destination URLs (%)', dest_a;
  END IF;

  -- Idempotency: re-running over already-wrapped output should be a no-op.
  url_a2 := (pg_temp.rewrite_plan_result_bookbf(
    rewritten, NULL::uuid, DATE '2026-01-01', DATE '2026-01-31'
  )) #>> '{destinations,0,accommodation,booking_url}';
  IF url_a2 <> url_a THEN
    RAISE EXCEPTION 'self-test: rewrite is not idempotent (1st=%, 2nd=%)', url_a, url_a2;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply the rewrite. Filter on `result::text` containing 'booking.com'
-- broadly — the rewrite function is idempotent on already-wrapped URLs,
-- and over-selecting here costs nothing (a no-op UPDATE per row at worst).
-- Per-destination dates inside the cached payload are the primary source
-- of truth (resolved inside rewrite_plan_result_bookbf); trips.tentative_*
-- is passed in only as a fallback for legs missing destinations[n].start_date
-- or end_date — and exists at all just for orphan rows where neither place
-- has a date set.
UPDATE public.ai_trip_plans p
SET result = pg_temp.rewrite_plan_result_bookbf(
  p.result,
  p.trip_id,
  (SELECT t.tentative_start_date FROM public.trips t WHERE t.id = p.trip_id),
  (SELECT t.tentative_end_date   FROM public.trips t WHERE t.id = p.trip_id)
)
WHERE p.result::text LIKE '%booking.com%';

-- Verification (commented out — run manually post-migration):
--
-- 1. No /search.html or empty-aid URLs should remain anywhere in the
--    result JSON of any plan.
--
--   SELECT count(*) AS stale_remaining
--   FROM public.ai_trip_plans
--   WHERE result::text LIKE '%booking.com/search.html%'
--      OR result::text LIKE '%aid=&%';
--
--   -- expected: 0
--
-- 2. Every booking-partner accommodation should now point to awin1.com.
--
--   SELECT count(*) AS unwrapped_booking
--   FROM public.ai_trip_plans p,
--        jsonb_array_elements(p.result -> 'destinations') AS dest
--   WHERE dest -> 'accommodation' ->> 'booking_partner' = 'booking'
--     AND dest -> 'accommodation' ->> 'booking_url' NOT LIKE '%awin1.com%';
--
--   -- expected: 0
--
-- 3. Spot-check the encoded ued= for a handful of rewritten rows. Decode
--    the value (any URL decoder will do) and confirm it resolves to
--    /searchresults.html with the expected hotel name and dates.
--    pg_temp helpers from this migration aren't available outside this
--    session, so the query just extracts the raw encoded value.
--
--   SELECT
--     p.id,
--     p.trip_id,
--     dest -> 'accommodation' ->> 'name'                                              AS hotel,
--     split_part(split_part(dest -> 'accommodation' ->> 'booking_url', 'ued=', 2), '&', 1) AS encoded_destination
--   FROM public.ai_trip_plans p,
--        jsonb_array_elements(p.result -> 'destinations') AS dest
--   WHERE dest -> 'accommodation' ->> 'booking_partner' = 'booking'
--   LIMIT 3;
--
--   -- decoded form should be:
--   --   https://www.booking.com/searchresults.html?ss=<HotelName>&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD
--
-- 4. Multi-destination spot-check. For any trip plan with two or more
--    destinations, every leg's wrapped URL should encode that leg's own
--    start_date / end_date — not the trip's outer range. The query pulls
--    the per-destination dates side-by-side with the checkin/checkout
--    encoded into the awin1.com `ued` value. Distinct legs should show
--    distinct encoded checkin/checkout strings matching their respective
--    destinations[n].start_date / end_date.
--
--   WITH multi AS (
--     SELECT id
--     FROM public.ai_trip_plans
--     WHERE jsonb_array_length(result -> 'destinations') > 1
--   )
--   SELECT
--     p.id,
--     d_ord                                                                            AS leg,
--     dest ->> 'name'                                                                  AS leg_name,
--     dest ->> 'start_date'                                                            AS dest_start_date,
--     dest ->> 'end_date'                                                              AS dest_end_date,
--     split_part(split_part(dest -> 'accommodation' ->> 'booking_url', 'ued=', 2), '&', 1) AS encoded_destination
--   FROM public.ai_trip_plans p
--   JOIN multi USING (id),
--        jsonb_array_elements(p.result -> 'destinations') WITH ORDINALITY AS d(dest, d_ord)
--   WHERE dest -> 'accommodation' ->> 'booking_partner' = 'booking'
--   ORDER BY p.id, d_ord;
--
--   -- decoding `encoded_destination` for each row should yield
--   --   https://www.booking.com/searchresults.html?ss=...&checkin=<dest_start_date>&checkout=<dest_end_date>
--   -- with the percent-decoded checkin/checkout matching dest_start_date/end_date
--   -- *of that row*, not the same dates across all legs.

COMMIT;

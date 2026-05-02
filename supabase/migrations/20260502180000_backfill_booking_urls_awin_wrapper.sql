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
-- jsonb_set runs in-place on a working copy; rows whose URLs already match
-- the canonical wrapped form are no-ops.
CREATE OR REPLACE FUNCTION pg_temp.rewrite_plan_result_bookbf(
  plan_result jsonb,
  trip_id uuid,
  checkin date,
  checkout date
) RETURNS jsonb AS $$
DECLARE
  out_result jsonb := plan_result;
  destinations jsonb;
  d_idx int;
  d_count int;
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
    -- Accommodation
    accom := out_result -> 'destinations' -> d_idx -> 'accommodation';
    IF accom IS NOT NULL AND jsonb_typeof(accom) = 'object' THEN
      partner := accom ->> 'booking_partner';
      IF partner = 'booking' THEN
        current_url := accom ->> 'booking_url';
        next_url := pg_temp.rewrite_booking_url_bookbf(current_url, trip_id, checkin, checkout);
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
        next_url := pg_temp.rewrite_booking_url_bookbf(current_url, trip_id, checkin, checkout);
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

-- Apply the rewrite. Filter on `result::text` containing 'booking.com'
-- broadly — the rewrite function is idempotent on already-wrapped URLs,
-- and over-selecting here costs nothing (a no-op UPDATE per row at worst).
-- Trip dates come from public.trips when joinable; for orphan drafts
-- (trip_id IS NULL) we fall back to the destination's own start/end dates
-- inside the cached payload.
UPDATE public.ai_trip_plans p
SET result = pg_temp.rewrite_plan_result_bookbf(
  p.result,
  p.trip_id,
  COALESCE(
    (SELECT t.tentative_start_date FROM public.trips t WHERE t.id = p.trip_id),
    NULLIF(p.result #>> '{destinations,0,start_date}', '')::date
  ),
  COALESCE(
    (SELECT t.tentative_end_date FROM public.trips t WHERE t.id = p.trip_id),
    NULLIF(p.result #>> '{destinations,0,end_date}', '')::date
  )
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

COMMIT;

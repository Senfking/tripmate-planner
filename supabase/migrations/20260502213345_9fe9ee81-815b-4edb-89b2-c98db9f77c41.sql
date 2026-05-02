-- 1. Snapshot
DROP TABLE IF EXISTS public.ai_trip_plans_backup_pre_ss_cleanup;
CREATE TABLE public.ai_trip_plans_backup_pre_ss_cleanup AS
TABLE public.ai_trip_plans;

-- 2. Helpers
CREATE OR REPLACE FUNCTION pg_temp.clean_ss(hotel_name text, city_hint text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n text := btrim(regexp_replace(coalesce(hotel_name,''), '\s+', ' ', 'g'));
  c text := btrim(regexp_replace(coalesce(city_hint,''), '\s+', ' ', 'g'));
BEGIN
  IF n = '' THEN RETURN c; END IF;
  IF c = '' THEN RETURN n; END IF;
  IF position(lower(c) in lower(n)) > 0 THEN RETURN n; END IF;
  RETURN n || ' ' || c;
END;
$$;

-- Rebuild a single awin-wrapped (or raw) booking URL using hotel title + city.
-- Returns the input unchanged if it doesn't look like a booking link we own.
CREATE OR REPLACE FUNCTION pg_temp.rebuild_booking_url(
  existing text,
  hotel_title text,
  city_hint text
) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  prefix text;
  ss text;
  encoded_inner text;
BEGIN
  IF existing IS NULL OR existing = '' THEN RETURN existing; END IF;
  ss := pg_temp.clean_ss(hotel_title, city_hint);
  IF ss IS NULL OR ss = '' THEN RETURN existing; END IF;

  IF existing LIKE 'https://www.awin1.com/cread.php?%' THEN
    -- Keep everything up to and including ued= , then replace the rest.
    prefix := regexp_replace(existing, '(ued=)[^&]*.*$', '\1');
    encoded_inner := 'https%3A%2F%2Fwww.booking.com%2Fsearch.html%3Fss%3D'
      || replace(replace(replace(
           regexp_replace(ss, '%', '%25', 'g'),
           ' ', '%2520'),
           '&', '%2526'),
           '#', '%2523');
    RETURN prefix || encoded_inner;
  ELSIF existing LIKE 'https://www.booking.com/search.html?%' THEN
    RETURN 'https://www.booking.com/search.html?ss='
      || replace(replace(replace(ss, '%', '%25'), ' ', '%20'), '&', '%26');
  ELSE
    RETURN existing;
  END IF;
END;
$$;

-- 3. Self-test gate (fail loud if helper produces wrong ss for known cases)
DO $$
DECLARE
  tcase record;
  got text;
BEGIN
  FOR tcase IN SELECT * FROM (VALUES
    ('Artyzen Singapore',           'Singapore', 'Artyzen Singapore'),
    ('Rove Downtown',               'Dubai',     'Rove Downtown Dubai'),
    ('THE MADISON Hotel Hamburg',   'Hamburg',   'THE MADISON Hotel Hamburg'),
    ('Park Inn by Radisson Muscat', 'Muscat',    'Park Inn by Radisson Muscat')
  ) AS t(hotel, city, expected) LOOP
    got := pg_temp.clean_ss(tcase.hotel, tcase.city);
    IF got <> tcase.expected THEN
      RAISE EXCEPTION 'self-test failed: hotel=% city=% got=% expected=%',
        tcase.hotel, tcase.city, got, tcase.expected;
    END IF;
  END LOOP;
END $$;

-- 4. Recursive walker — rewrite accommodation + activities booking_url.
CREATE OR REPLACE FUNCTION pg_temp.fix_plan(plan jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  dest jsonb;
  city text;
  accom jsonb;
  days jsonb;
  day jsonb;
  acts jsonb;
  act jsonb;
  new_acts jsonb;
  new_days jsonb;
  new_url text;
BEGIN
  IF plan IS NULL OR jsonb_typeof(plan->'destinations') <> 'array' THEN
    RETURN plan;
  END IF;
  dest := plan->'destinations'->0;
  IF dest IS NULL THEN RETURN plan; END IF;
  city := dest->>'name';

  -- Accommodation
  accom := dest->'accommodation';
  IF accom IS NOT NULL
     AND accom->>'booking_partner' = 'booking'
     AND accom->>'booking_url' IS NOT NULL THEN
    new_url := pg_temp.rebuild_booking_url(accom->>'booking_url', accom->>'title', city);
    accom := jsonb_set(accom, '{booking_url}', to_jsonb(new_url));
    dest := jsonb_set(dest, '{accommodation}', accom);
  END IF;

  -- Days
  days := dest->'days';
  IF jsonb_typeof(days) = 'array' THEN
    new_days := '[]'::jsonb;
    FOR day IN SELECT * FROM jsonb_array_elements(days) LOOP
      acts := day->'activities';
      IF jsonb_typeof(acts) = 'array' THEN
        new_acts := '[]'::jsonb;
        FOR act IN SELECT * FROM jsonb_array_elements(acts) LOOP
          IF act->>'booking_partner' = 'booking'
             AND act->>'booking_url' IS NOT NULL THEN
            new_url := pg_temp.rebuild_booking_url(act->>'booking_url', act->>'title', city);
            act := jsonb_set(act, '{booking_url}', to_jsonb(new_url));
          END IF;
          new_acts := new_acts || jsonb_build_array(act);
        END LOOP;
        day := jsonb_set(day, '{activities}', new_acts);
      END IF;
      new_days := new_days || jsonb_build_array(day);
    END LOOP;
    dest := jsonb_set(dest, '{days}', new_days);
  END IF;

  RETURN jsonb_set(plan, '{destinations,0}', dest);
END;
$$;

-- 5. Apply
UPDATE public.ai_trip_plans
SET result = pg_temp.fix_plan(result)
WHERE result #>> '{destinations,0,accommodation,booking_partner}' = 'booking'
   OR result::text LIKE '%"booking_partner":"booking"%';
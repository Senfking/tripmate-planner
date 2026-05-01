CREATE OR REPLACE FUNCTION public._strip_emojis_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        COALESCE(input, ''),
        '[⌀-⏿☀-⛿✀-➿⬀-⯿︀-️‍\U0001F000-\U0001FFFF]',
        '',
        'g'
      ),
      '\s+', ' ', 'g'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public._strip_emojis_jsonb(input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _key text;
  _val jsonb;
  _obj jsonb;
  _arr jsonb;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;

  CASE jsonb_typeof(input)
    WHEN 'string' THEN
      RETURN to_jsonb(public._strip_emojis_text(input #>> '{}'));
    WHEN 'object' THEN
      _obj := '{}'::jsonb;
      FOR _key, _val IN SELECT * FROM jsonb_each(input) LOOP
        _obj := _obj || jsonb_build_object(_key, public._strip_emojis_jsonb(_val));
      END LOOP;
      RETURN _obj;
    WHEN 'array' THEN
      _arr := '[]'::jsonb;
      FOR _val IN SELECT * FROM jsonb_array_elements(input) LOOP
        _arr := _arr || jsonb_build_array(public._strip_emojis_jsonb(_val));
      END LOOP;
      RETURN _arr;
    ELSE
      RETURN input;
  END CASE;
END;
$$;

UPDATE public.trips
SET    name = public._strip_emojis_text(name)
WHERE  name ~ '[⌀-⏿☀-⛿✀-➿⬀-⯿︀-️‍]'
   OR  name ~ '[\U0001F000-\U0001FFFF]';

UPDATE public.ai_trip_plans
SET    result = public._strip_emojis_jsonb(result)
WHERE  result::text ~ '[⌀-⏿☀-⛿✀-➿⬀-⯿︀-️‍]'
   OR  result::text ~ '[\U0001F000-\U0001FFFF]';

UPDATE public.ai_response_cache
SET    response_json = public._strip_emojis_jsonb(response_json)
WHERE  response_json::text ~ '[⌀-⏿☀-⛿✀-➿⬀-⯿︀-️‍]'
   OR  response_json::text ~ '[\U0001F000-\U0001FFFF]';

DO $verify$
DECLARE
  _trips_left bigint;
  _plans_left bigint;
  _cache_left bigint;
BEGIN
  SELECT count(*) INTO _trips_left
  FROM   public.trips
  WHERE  name ~ '[⌀-⏿☀-⛿✀-➿⬀-⯿︀-️‍]'
     OR  name ~ '[\U0001F000-\U0001FFFF]';

  SELECT count(*) INTO _plans_left
  FROM   public.ai_trip_plans
  WHERE  result::text ~ '[⌀-⏿☀-⛿✀-➿⬀-⯿︀-️‍]'
     OR  result::text ~ '[\U0001F000-\U0001FFFF]';

  SELECT count(*) INTO _cache_left
  FROM   public.ai_response_cache
  WHERE  response_json::text ~ '[⌀-⏿☀-⛿✀-➿⬀-⯿︀-️‍]'
     OR  response_json::text ~ '[\U0001F000-\U0001FFFF]';

  RAISE NOTICE 'emoji-backfill verify: trips=% ai_trip_plans=% ai_response_cache=%',
    _trips_left, _plans_left, _cache_left;

  IF _trips_left + _plans_left + _cache_left > 0 THEN
    RAISE EXCEPTION
      'emoji-backfill incomplete: trips=% ai_trip_plans=% ai_response_cache=%',
      _trips_left, _plans_left, _cache_left;
  END IF;
END
$verify$;

DROP FUNCTION public._strip_emojis_jsonb(jsonb);
DROP FUNCTION public._strip_emojis_text(text);
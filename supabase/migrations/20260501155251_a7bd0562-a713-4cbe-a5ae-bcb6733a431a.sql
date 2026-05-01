-- Backfill: strip emoji + pictographs from AI-generated text in existing rows.
-- Mirrors the JS util in src/lib/stripEmoji.ts:
--   /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu  +  variation selectors + ZWJ
-- Postgres regex doesn't support \p{Extended_Pictographic}, so we use explicit
-- Unicode ranges covering the same set of characters.

CREATE OR REPLACE FUNCTION public._strip_emoji_text(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned text;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;

  cleaned := input;

  -- Pictographs, emoji, symbols, dingbats, transport/map, misc symbols.
  -- Covers Extended_Pictographic + Emoji_Presentation in practice.
  cleaned := regexp_replace(cleaned,
    '[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9-\u21AA\u231A-\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA-\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u27BF\u2B05-\u2B07\u2B1B-\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]',
    '', 'g');

  -- Supplementary Multilingual / Symbols & Pictographs planes
  -- (U+1F000–U+1FAFF range covers all modern emoji blocks).
  cleaned := regexp_replace(cleaned,
    '[\U0001F000-\U0001FAFF]',
    '', 'g');

  -- Regional indicator symbols (flags) U+1F1E6–U+1F1FF
  cleaned := regexp_replace(cleaned,
    '[\U0001F1E6-\U0001F1FF]',
    '', 'g');

  -- Variation selectors (FE0E/FE0F) and zero-width joiner
  cleaned := regexp_replace(cleaned, '[\uFE0E\uFE0F\u200D]', '', 'g');

  -- Tidy whitespace before punctuation, collapse double spaces, trim
  cleaned := regexp_replace(cleaned, '\s+([,;:!?.])', '\1', 'g');
  cleaned := regexp_replace(cleaned, '\s{2,}', ' ', 'g');
  cleaned := btrim(cleaned);

  RETURN cleaned;
END;
$$;

-- Recursively strip emoji from string fields in a JSON value.
-- Walks objects and arrays; leaves non-string scalars untouched.
CREATE OR REPLACE FUNCTION public._strip_emoji_jsonb(v jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  result jsonb;
  arr jsonb := '[]'::jsonb;
  elem jsonb;
BEGIN
  IF v IS NULL THEN
    RETURN NULL;
  END IF;

  CASE jsonb_typeof(v)
    WHEN 'string' THEN
      RETURN to_jsonb(public._strip_emoji_text(v #>> '{}'));
    WHEN 'object' THEN
      result := '{}'::jsonb;
      FOR k IN SELECT jsonb_object_keys(v) LOOP
        result := result || jsonb_build_object(k, public._strip_emoji_jsonb(v -> k));
      END LOOP;
      RETURN result;
    WHEN 'array' THEN
      FOR elem IN SELECT * FROM jsonb_array_elements(v) LOOP
        arr := arr || jsonb_build_array(public._strip_emoji_jsonb(elem));
      END LOOP;
      RETURN arr;
    ELSE
      RETURN v;
  END CASE;
END;
$$;

-- ─── Backfill trips.name ─────────────────────────────────────────────────
UPDATE public.trips
SET name = public._strip_emoji_text(name)
WHERE name IS DISTINCT FROM public._strip_emoji_text(name);

-- ─── Backfill ai_trip_plans.result (trip_title, day themes, activity titles, etc.) ───
UPDATE public.ai_trip_plans
SET result = public._strip_emoji_jsonb(result)
WHERE result IS DISTINCT FROM public._strip_emoji_jsonb(result);

-- ─── Backfill ai_response_cache.response_json (avoids serving stale emoji-laden cached responses) ───
UPDATE public.ai_response_cache
SET response_json = public._strip_emoji_jsonb(response_json)
WHERE response_json IS DISTINCT FROM public._strip_emoji_jsonb(response_json);

-- Helper functions are no longer needed after the one-shot backfill.
DROP FUNCTION public._strip_emoji_jsonb(jsonb);
DROP FUNCTION public._strip_emoji_text(text);
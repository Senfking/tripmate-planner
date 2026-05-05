-- =============================================================================
-- handle_new_user: capture OAuth display name + avatar from raw_user_meta_data
-- =============================================================================
-- Previously, the trigger only read raw_user_meta_data->>'display_name', which
-- is the field our email/password signup writes. OAuth providers don't use that
-- key, so Google/Apple signups landed with profiles.display_name = NULL.
--
-- Name extraction preference (per Google/Apple OAuth conventions):
--   1. full_name              (Google)
--   2. name                   (Google fallback)
--   3. given_name + family_name concatenated (Google fallback / Apple first sign-in)
--   4. display_name           (our email/password signUp writes this via options.data)
-- Avatar extraction preference:
--   1. avatar_url             (some providers / our own writes)
--   2. picture                (Google)
-- Apple does not return an avatar.
--
-- Apple quirk: Apple only returns the user's name on the FIRST sign-in. Since
-- this trigger runs on auth.users INSERT (i.e. only the first sign-in), we
-- capture whatever Apple sends here. We never re-read raw_user_meta_data on
-- subsequent sign-ins anywhere in the codebase, so we can't accidentally
-- overwrite a previously captured name with Apple's later NULLs.
--
-- The trigger remains wrapped in EXCEPTION WHEN OTHERS so a malformed metadata
-- payload can never block user creation. We RAISE LOG (not silently swallow)
-- so failures are visible in Postgres logs.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta   jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_name   text;
  v_avatar text;
BEGIN
  v_name := NULLIF(TRIM(COALESCE(
    NULLIF(TRIM(COALESCE(v_meta->>'full_name', '')), ''),
    NULLIF(TRIM(COALESCE(v_meta->>'name', '')), ''),
    NULLIF(TRIM(CONCAT_WS(' ', v_meta->>'given_name', v_meta->>'family_name')), ''),
    NULLIF(TRIM(COALESCE(v_meta->>'display_name', '')), '')
  )), '');

  v_avatar := NULLIF(TRIM(COALESCE(
    NULLIF(TRIM(COALESCE(v_meta->>'avatar_url', '')), ''),
    NULLIF(TRIM(COALESCE(v_meta->>'picture', '')), '')
  )), '');

  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, v_name, v_avatar);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user failed for user %: % (SQLSTATE %)', NEW.id, SQLERRM, SQLSTATE;
    -- Best-effort fallback: ensure a profile row exists so downstream code
    -- (notify_new_user trigger, RLS-checked reads, etc.) doesn't break.
    BEGIN
      INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'handle_new_user fallback insert failed for user %: % (SQLSTATE %)', NEW.id, SQLERRM, SQLSTATE;
    END;
    RETURN NEW;
END;
$$;

-- =============================================================================
-- Backfill: populate display_name / avatar_url for existing users whose
-- profile fields are null/empty but whose auth.users.raw_user_meta_data has
-- a usable value. Idempotent — only touches rows that are currently empty,
-- so re-running this migration is a no-op.
-- =============================================================================
UPDATE public.profiles p
SET display_name = NULLIF(TRIM(COALESCE(
      NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', '')), ''),
      NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'name', '')), ''),
      NULLIF(TRIM(CONCAT_WS(' ', u.raw_user_meta_data->>'given_name', u.raw_user_meta_data->>'family_name')), ''),
      NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'display_name', '')), '')
    )), '')
FROM auth.users u
WHERE u.id = p.id
  AND (p.display_name IS NULL OR TRIM(p.display_name) = '')
  AND COALESCE(u.raw_user_meta_data, '{}'::jsonb) <> '{}'::jsonb
  AND NULLIF(TRIM(COALESCE(
        NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', '')), ''),
        NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'name', '')), ''),
        NULLIF(TRIM(CONCAT_WS(' ', u.raw_user_meta_data->>'given_name', u.raw_user_meta_data->>'family_name')), ''),
        NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'display_name', '')), '')
      )), '') IS NOT NULL;

UPDATE public.profiles p
SET avatar_url = NULLIF(TRIM(COALESCE(
      NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', '')), ''),
      NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'picture', '')), '')
    )), '')
FROM auth.users u
WHERE u.id = p.id
  AND (p.avatar_url IS NULL OR TRIM(p.avatar_url) = '')
  AND COALESCE(u.raw_user_meta_data, '{}'::jsonb) <> '{}'::jsonb
  AND NULLIF(TRIM(COALESCE(
        NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', '')), ''),
        NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'picture', '')), '')
      )), '') IS NOT NULL;

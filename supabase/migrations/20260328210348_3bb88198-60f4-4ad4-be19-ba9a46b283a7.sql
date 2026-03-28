
-- Add the missing columns and objects from the failed first migration

-- revoked_at on invites (was in failed migration)
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- trip_code on trips (was in failed migration)
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS trip_code text UNIQUE;

-- invite_redemptions table (was in failed migration)
CREATE TABLE IF NOT EXISTS public.invite_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.invites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invite_id, user_id)
);

ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;

-- RLS policies (IF NOT EXISTS not supported, use DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'invite_redemptions_select' AND tablename = 'invite_redemptions') THEN
    CREATE POLICY "invite_redemptions_select" ON public.invite_redemptions
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.invites i
        WHERE i.id = invite_redemptions.invite_id
        AND public.is_trip_member(i.trip_id, auth.uid())
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'invite_redemptions_insert' AND tablename = 'invite_redemptions') THEN
    CREATE POLICY "invite_redemptions_insert" ON public.invite_redemptions
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- generate_trip_code function
CREATE OR REPLACE FUNCTION public.generate_trip_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  _chars text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  _code text;
  _exists boolean;
BEGIN
  LOOP
    _code := '';
    FOR i IN 1..6 LOOP
      _code := _code || substr(_chars, floor(random() * length(_chars) + 1)::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.trips WHERE trip_code = _code) INTO _exists;
    IF NOT _exists THEN
      RETURN _code;
    END IF;
  END LOOP;
END;
$$;

-- Trigger
CREATE OR REPLACE FUNCTION public.auto_generate_trip_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.trip_code IS NULL THEN
    NEW.trip_code := public.generate_trip_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_trip_code ON public.trips;
CREATE TRIGGER trg_auto_trip_code
  BEFORE INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_trip_code();

-- Backfill existing trips
UPDATE public.trips SET trip_code = public.generate_trip_code() WHERE trip_code IS NULL;

-- Make NOT NULL
ALTER TABLE public.trips ALTER COLUMN trip_code SET NOT NULL;

-- Updated redeem_invite
CREATE OR REPLACE FUNCTION public.redeem_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _invite RECORD;
  _user_id uuid := auth.uid();
  _trip_name text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO _invite FROM public.invites WHERE token = _token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF _invite.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'revoked');
  END IF;

  IF _invite.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = _invite.trip_id AND user_id = _user_id) THEN
    RETURN jsonb_build_object('error', 'already_member', 'trip_id', _invite.trip_id);
  END IF;

  INSERT INTO public.trip_members (trip_id, user_id, role)
  VALUES (_invite.trip_id, _user_id, _invite.role);

  INSERT INTO public.invite_redemptions (invite_id, user_id)
  VALUES (_invite.id, _user_id)
  ON CONFLICT (invite_id, user_id) DO NOTHING;

  SELECT name INTO _trip_name FROM public.trips WHERE id = _invite.trip_id;

  RETURN jsonb_build_object('success', true, 'trip_id', _invite.trip_id, 'trip_name', _trip_name);
END;
$$;

-- join_by_code
CREATE OR REPLACE FUNCTION public.join_by_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _trip RECORD;
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO _trip FROM public.trips WHERE trip_code = upper(trim(_code));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = _trip.id AND user_id = _user_id) THEN
    RETURN jsonb_build_object('error', 'already_member', 'trip_id', _trip.id, 'trip_name', _trip.name);
  END IF;

  INSERT INTO public.trip_members (trip_id, user_id, role)
  VALUES (_trip.id, _user_id, 'member');

  RETURN jsonb_build_object('success', true, 'trip_id', _trip.id, 'trip_name', _trip.name);
END;
$$;

-- regenerate_trip_code
CREATE OR REPLACE FUNCTION public.regenerate_trip_code(_trip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_code text;
BEGIN
  IF NOT public.is_trip_admin_or_owner(_trip_id, auth.uid()) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  _new_code := public.generate_trip_code();
  UPDATE public.trips SET trip_code = _new_code WHERE id = _trip_id;

  RETURN jsonb_build_object('success', true, 'trip_code', _new_code);
END;
$$;


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

  -- Find the invite
  SELECT * INTO _invite FROM public.invites
  WHERE token = _token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF _invite.redeemed_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_redeemed');
  END IF;

  IF _invite.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  -- Check if already a member
  IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = _invite.trip_id AND user_id = _user_id) THEN
    RETURN jsonb_build_object('error', 'already_member', 'trip_id', _invite.trip_id);
  END IF;

  -- Insert trip member
  INSERT INTO public.trip_members (trip_id, user_id, role)
  VALUES (_invite.trip_id, _user_id, _invite.role);

  -- Mark invite as redeemed
  UPDATE public.invites
  SET redeemed_at = now(), redeemed_by = _user_id
  WHERE id = _invite.id;

  -- Get trip name
  SELECT name INTO _trip_name FROM public.trips WHERE id = _invite.trip_id;

  RETURN jsonb_build_object('success', true, 'trip_id', _invite.trip_id, 'trip_name', _trip_name);
END;
$$;

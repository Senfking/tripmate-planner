
-- 1. Add share_permission column to trips
ALTER TABLE public.trips
ADD COLUMN share_permission text NOT NULL DEFAULT 'all';

-- 2. Security definer function: update_member_role
CREATE OR REPLACE FUNCTION public.update_member_role(_trip_id uuid, _target_user_id uuid, _new_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller_id uuid := auth.uid();
  _caller_role text;
  _target_role text;
  _owner_count int;
BEGIN
  IF _caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT role INTO _caller_role FROM public.trip_members WHERE trip_id = _trip_id AND user_id = _caller_id;
  IF _caller_role IS NULL THEN
    RETURN jsonb_build_object('error', 'not_a_member');
  END IF;

  SELECT role INTO _target_role FROM public.trip_members WHERE trip_id = _trip_id AND user_id = _target_user_id;
  IF _target_role IS NULL THEN
    RETURN jsonb_build_object('error', 'target_not_found');
  END IF;

  -- Only owner can promote to admin
  IF _new_role = 'admin' AND _caller_role != 'owner' THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Only owner can demote admin to member
  IF _target_role = 'admin' AND _new_role = 'member' AND _caller_role != 'owner' THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Cannot change owner role
  IF _target_role = 'owner' THEN
    RETURN jsonb_build_object('error', 'cannot_change_owner');
  END IF;

  -- Must be admin or owner to change roles
  IF _caller_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Only allow valid roles
  IF _new_role NOT IN ('admin', 'member') THEN
    RETURN jsonb_build_object('error', 'invalid_role');
  END IF;

  UPDATE public.trip_members SET role = _new_role WHERE trip_id = _trip_id AND user_id = _target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Security definer function: remove_trip_member
CREATE OR REPLACE FUNCTION public.remove_trip_member(_trip_id uuid, _target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller_id uuid := auth.uid();
  _caller_role text;
  _target_role text;
BEGIN
  IF _caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT role INTO _caller_role FROM public.trip_members WHERE trip_id = _trip_id AND user_id = _caller_id;
  IF _caller_role IS NULL THEN
    RETURN jsonb_build_object('error', 'not_a_member');
  END IF;

  SELECT role INTO _target_role FROM public.trip_members WHERE trip_id = _trip_id AND user_id = _target_user_id;
  IF _target_role IS NULL THEN
    RETURN jsonb_build_object('error', 'target_not_found');
  END IF;

  -- Self-leave: anyone can leave except sole owner
  IF _caller_id = _target_user_id THEN
    IF _caller_role = 'owner' THEN
      RETURN jsonb_build_object('error', 'owner_cannot_leave');
    END IF;
    DELETE FROM public.trip_members WHERE trip_id = _trip_id AND user_id = _target_user_id;
    RETURN jsonb_build_object('success', true);
  END IF;

  -- Removing others: must be admin or owner
  IF _caller_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Cannot remove owner
  IF _target_role = 'owner' THEN
    RETURN jsonb_build_object('error', 'cannot_remove_owner');
  END IF;

  -- Admin cannot remove other admins
  IF _caller_role = 'admin' AND _target_role = 'admin' THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  DELETE FROM public.trip_members WHERE trip_id = _trip_id AND user_id = _target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

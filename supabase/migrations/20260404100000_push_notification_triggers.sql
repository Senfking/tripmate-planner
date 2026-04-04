-- Push notification triggers for trip events
-- Calls send-push-notification Edge Function via pg_net for each qualifying member

-- ============================================================
-- Helper: reusable function that fans out push notifications
-- to trip members who have a given preference enabled.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_trip_members_push(
  p_trip_id    uuid,
  p_exclude    uuid,       -- actor to exclude (NULL = nobody excluded)
  p_pref_key   text,       -- notification_preferences JSON key
  p_title      text,
  p_body       text,
  p_url        text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member RECORD;
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4';
BEGIN
  FOR _member IN
    SELECT tm.user_id
    FROM   trip_members tm
    JOIN   profiles     p ON p.id = tm.user_id
    WHERE  tm.trip_id = p_trip_id
      AND  (p_exclude IS NULL OR tm.user_id <> p_exclude)
      AND  COALESCE((p.notification_preferences ->> p_pref_key)::boolean, false) = true
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/send-push-notification',
        body    := jsonb_build_object(
          'user_id', _member.user_id,
          'title',   p_title,
          'body',    p_body,
          'url',     p_url
        ),
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'apikey',        _anon_key,
          'Authorization', 'Bearer ' || _anon_key
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_trip_members_push(%, %): %', p_trip_id, _member.user_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ============================================================
-- 1. New expense → notify members with new_expense enabled
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_push_new_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trip_name text;
BEGIN
  SELECT name INTO _trip_name FROM trips WHERE id = NEW.trip_id;

  PERFORM notify_trip_members_push(
    NEW.trip_id,
    NEW.payer_id,
    'new_expense',
    COALESCE(_trip_name, 'Trip') || ': New expense',
    LEFT(NEW.title, 100) || ' — ' || NEW.amount || ' ' || COALESCE(NEW.currency, 'EUR'),
    '/trips/' || NEW.trip_id || '/expenses'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_new_expense ON public.expenses;
CREATE TRIGGER trg_push_new_expense
  AFTER INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_new_expense();

-- ============================================================
-- 2. New poll → notify members with decisions_reminder enabled
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_push_new_poll()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trip_name text;
  _actor     uuid;
BEGIN
  SELECT name INTO _trip_name FROM trips WHERE id = NEW.trip_id;

  -- polls table has no created_by; use the authenticated user from context
  _actor := auth.uid();

  PERFORM notify_trip_members_push(
    NEW.trip_id,
    _actor,
    'decisions_reminder',
    COALESCE(_trip_name, 'Trip') || ': New poll',
    LEFT(NEW.title, 120),
    '/trips/' || NEW.trip_id || '/decisions'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_new_poll ON public.polls;
CREATE TRIGGER trg_push_new_poll
  AFTER INSERT ON public.polls
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_new_poll();

-- ============================================================
-- 3. New member joins → notify existing members with new_member
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_push_new_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trip_name    text;
  _display_name text;
BEGIN
  SELECT name INTO _trip_name FROM trips WHERE id = NEW.trip_id;
  SELECT display_name INTO _display_name FROM profiles WHERE id = NEW.user_id;

  PERFORM notify_trip_members_push(
    NEW.trip_id,
    NEW.user_id,
    'new_member',
    COALESCE(_trip_name, 'Trip') || ': New member',
    COALESCE(_display_name, 'Someone') || ' joined the trip',
    '/trips/' || NEW.trip_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_new_member ON public.trip_members;
CREATE TRIGGER trg_push_new_member
  AFTER INSERT ON public.trip_members
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_new_member();

-- ============================================================
-- 4. Itinerary item added/changed → notify with new_activity
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_push_itinerary_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trip_name text;
  _verb      text;
BEGIN
  SELECT name INTO _trip_name FROM trips WHERE id = NEW.trip_id;

  IF TG_OP = 'INSERT' THEN
    _verb := 'New item';
  ELSE
    _verb := 'Updated';
  END IF;

  PERFORM notify_trip_members_push(
    NEW.trip_id,
    NEW.created_by,
    'new_activity',
    COALESCE(_trip_name, 'Trip') || ': Itinerary ' || LOWER(_verb),
    _verb || ': ' || LEFT(NEW.title, 100),
    '/trips/' || NEW.trip_id || '/itinerary'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_itinerary_change ON public.itinerary_items;
CREATE TRIGGER trg_push_itinerary_change
  AFTER INSERT OR UPDATE ON public.itinerary_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_itinerary_change();

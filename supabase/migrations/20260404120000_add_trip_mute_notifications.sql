-- Add per-trip notification muting to trip_members
-- When mute_notifications is true, the member receives no push notifications for that trip.

ALTER TABLE public.trip_members
  ADD COLUMN IF NOT EXISTS mute_notifications boolean NOT NULL DEFAULT false;

-- Update the push notification helper to skip muted members

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
      AND  tm.mute_notifications IS NOT TRUE
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

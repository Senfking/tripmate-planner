CREATE OR REPLACE FUNCTION public.notify_new_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/check-admin-alerts',
    body := jsonb_build_object(
      'trigger','feedback','feedback_id',NEW.id,
      'body',LEFT(COALESCE(NEW.body,''),200),
      'category',COALESCE(NEW.category,'general'),
      'severity',COALESCE(NEW.ai_severity,'medium')
    ),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4',
      'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );

  PERFORM net.http_post(
    url := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/analyze-feedback',
    body := jsonb_build_object(
      'feedbackId', NEW.id,
      'category', COALESCE(NEW.category, 'general'),
      'message', COALESCE(NEW.body, ''),
      'route', COALESCE(NEW.route, '')
    )::text,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3dGJxb21mbGVpaGN2a2Zvb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTIwOTYsImV4cCI6MjA5MDI4ODA5Nn0.3pcmb_onAUrzgqOHJMQPJTB0sIClViacP6zPUAi3NK4',
      'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );

  RETURN NEW;
END;
$function$;
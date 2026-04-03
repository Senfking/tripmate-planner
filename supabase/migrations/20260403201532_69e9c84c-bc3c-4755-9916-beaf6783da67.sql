CREATE OR REPLACE FUNCTION public.notify_new_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _service_role_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  PERFORM net.http_post(
    url := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/check-admin-alerts',
    body := jsonb_build_object(
      'trigger','feedback','feedback_id',NEW.id,
      'body',LEFT(COALESCE(NEW.body,''),200),
      'category',COALESCE(NEW.category,'general'),
      'severity',COALESCE(NEW.ai_severity,'medium')
    )::text,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey', _service_role_key,
      'Authorization','Bearer ' || _service_role_key
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
      'apikey', _service_role_key,
      'Authorization','Bearer ' || _service_role_key
    )
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_notify_new_feedback ON public.feedback;
CREATE TRIGGER trigger_notify_new_feedback
AFTER INSERT ON public.feedback
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_feedback();
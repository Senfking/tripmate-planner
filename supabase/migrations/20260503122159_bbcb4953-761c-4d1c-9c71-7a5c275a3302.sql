CREATE OR REPLACE FUNCTION public._smoketest_push_auth()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _jwt text;
  _ok_req_id bigint;
  _bad_req_id bigint;
  _ok_resp record;
  _bad_resp record;
  _result jsonb;
BEGIN
  SELECT decrypted_secret INTO _jwt
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF _jwt IS NULL THEN
    RETURN jsonb_build_object('error', 'no vault key');
  END IF;

  -- T2b: legitimate vault JWT bearer; user_id intentionally absent so we
  -- expect 400 (validation) not 403. A 403 here means auth still broken.
  SELECT net.http_post(
    url := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/send-push-notification',
    body := jsonb_build_object('user_id', '00000000-0000-0000-0000-000000000000', 'title', 't', 'body', 'b'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', _jwt,
      'Authorization', 'Bearer ' || _jwt
    )
  ) INTO _ok_req_id;

  -- T2a: garbage bearer; expect 403 (gateway will accept-or-reject; if
  -- gateway rejects with 401 that's also fine — we just need NOT 200).
  SELECT net.http_post(
    url := 'https://dwtbqomfleihcvkfoopm.supabase.co/functions/v1/send-push-notification',
    body := jsonb_build_object('user_id', '00000000-0000-0000-0000-000000000000', 'title', 't', 'body', 'b'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', _jwt,
      'Authorization', 'Bearer not-a-real-jwt'
    )
  ) INTO _bad_req_id;

  PERFORM pg_sleep(3);

  SELECT status_code, content INTO _ok_resp FROM net._http_response WHERE id = _ok_req_id;
  SELECT status_code, content INTO _bad_resp FROM net._http_response WHERE id = _bad_req_id;

  RETURN jsonb_build_object(
    'T2b_legit_status', _ok_resp.status_code,
    'T2b_legit_body', LEFT(COALESCE(_ok_resp.content::text, ''), 200),
    'T2a_garbage_status', _bad_resp.status_code,
    'T2a_garbage_body', LEFT(COALESCE(_bad_resp.content::text, ''), 200)
  );
END;
$$;
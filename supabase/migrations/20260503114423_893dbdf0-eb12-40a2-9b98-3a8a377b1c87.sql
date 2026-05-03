SELECT vault.create_secret(
  decrypted_secret,
  'service_role_key',
  'Service role key for pg_net -> edge function calls (used by admin alerts and notify_trip_members_push). Copied from email_queue_service_role_key on 2026-05-03.'
)
FROM vault.decrypted_secrets
WHERE name = 'email_queue_service_role_key';
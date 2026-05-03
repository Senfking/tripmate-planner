// Defense-in-depth: send-push-notification is only ever invoked by DB
// triggers (notify_trip_members_push) and other server-side callers. It must
// never be reachable to a regular logged-in user, who could otherwise spam any
// user UUID with arbitrary titles and bodies. Require the service-role key in
// Authorization. Mirrors the guard used by check-admin-alerts.
export function isServiceRoleAuthorized(
  authHeader: string | null,
  serviceRoleKey: string,
): boolean {
  if (!authHeader || !serviceRoleKey) return false;
  return authHeader === `Bearer ${serviceRoleKey}`;
}

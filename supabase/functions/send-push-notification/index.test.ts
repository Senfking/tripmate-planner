// Probes for the service-role bearer guard added to send-push-notification.
// Run with: deno test supabase/functions/send-push-notification/index.test.ts
import { isServiceRoleAuthorized } from "./auth.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

const SERVICE_KEY = "service-role-key-fake-for-test";
const ANON_KEY = "anon-key-fake-for-test";
const USER_JWT = "eyJhbGciOiJIUzI1NiJ9.user.payload";

Deno.test("rejects request with no Authorization header", () => {
  assert(!isServiceRoleAuthorized(null, SERVICE_KEY), "missing header rejected");
  assert(!isServiceRoleAuthorized("", SERVICE_KEY), "empty header rejected");
});

Deno.test("rejects anon key (the previous DB trigger's key)", () => {
  assert(
    !isServiceRoleAuthorized(`Bearer ${ANON_KEY}`, SERVICE_KEY),
    "anon key cannot impersonate service role",
  );
});

Deno.test("rejects ordinary user JWT", () => {
  assert(
    !isServiceRoleAuthorized(`Bearer ${USER_JWT}`, SERVICE_KEY),
    "logged-in user JWT cannot call send-push-notification",
  );
});

Deno.test("rejects malformed bearer", () => {
  assert(!isServiceRoleAuthorized("Bearer", SERVICE_KEY), "no token rejected");
  assert(!isServiceRoleAuthorized(SERVICE_KEY, SERVICE_KEY), "missing 'Bearer ' prefix rejected");
  assert(
    !isServiceRoleAuthorized(`bearer ${SERVICE_KEY}`, SERVICE_KEY),
    "case-sensitive scheme rejected",
  );
});

Deno.test("accepts the exact service-role bearer", () => {
  assert(
    isServiceRoleAuthorized(`Bearer ${SERVICE_KEY}`, SERVICE_KEY),
    "service role bearer accepted",
  );
});

Deno.test("rejects when service role key env is empty", () => {
  assert(
    !isServiceRoleAuthorized(`Bearer ${SERVICE_KEY}`, ""),
    "empty server-side key fails closed",
  );
});

// Run with: deno test supabase/functions/_shared/anon/auth-gate.test.ts
import { decideAuthGate } from "./auth-gate.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

const VALID_UUID = "11111111-2222-4333-8444-555555555555";

Deno.test("authenticated user always proceeds, regardless of anon_session_id", () => {
  const decision = decideAuthGate({
    authenticatedUserId: "user-1",
    body: { anon_session_id: "ignored" },
  });
  assert(decision.kind === "authenticated", "should authenticate");
  assert(decision.kind === "authenticated" && decision.userId === "user-1", "user id passed through");
});

Deno.test("anonymous request with valid session id is allowed", () => {
  const decision = decideAuthGate({
    authenticatedUserId: null,
    body: { anon_session_id: VALID_UUID },
  });
  assert(decision.kind === "anonymous", "should allow anon");
  assert(
    decision.kind === "anonymous" && decision.anonSessionId === VALID_UUID,
    "session id forwarded",
  );
});

Deno.test("no auth + no anon_session_id rejects 401 auth_required", () => {
  const decision = decideAuthGate({ authenticatedUserId: null, body: {} });
  assert(decision.kind === "reject", "should reject");
  assert(
    decision.kind === "reject" &&
      decision.status === 401 &&
      decision.code === "auth_required",
    "401 / auth_required",
  );
});

Deno.test("no auth + invalid anon_session_id rejects 401 auth_required", () => {
  const decision = decideAuthGate({
    authenticatedUserId: null,
    body: { anon_session_id: "not-a-uuid" },
  });
  assert(
    decision.kind === "reject" &&
      decision.status === 401 &&
      decision.code === "auth_required",
    "invalid uuid → 401",
  );
});

Deno.test("anon attempting alternatives_mode is gated with auth_required", () => {
  const decision = decideAuthGate({
    authenticatedUserId: null,
    body: { anon_session_id: VALID_UUID, alternatives_mode: true },
  });
  assert(
    decision.kind === "reject" &&
      decision.status === 401 &&
      decision.code === "auth_required",
    "alternatives_mode is auth-only",
  );
  assert(
    decision.kind === "reject" && /refine/i.test(decision.message),
    "message refers to refining activities",
  );
});

Deno.test("anon attempting regenerate (trip_id present) is gated with auth_required", () => {
  const decision = decideAuthGate({
    authenticatedUserId: null,
    body: { anon_session_id: VALID_UUID, trip_id: "trip-abc" },
  });
  assert(
    decision.kind === "reject" &&
      decision.status === 401 &&
      decision.code === "auth_required",
    "trip_id-bearing request is auth-only",
  );
  assert(
    decision.kind === "reject" && /save or regenerate/i.test(decision.message),
    "message refers to save/regenerate",
  );
});

Deno.test("blank trip_id (whitespace) is treated as absent and allows the anon path", () => {
  const decision = decideAuthGate({
    authenticatedUserId: null,
    body: { anon_session_id: VALID_UUID, trip_id: "   " },
  });
  assert(decision.kind === "anonymous", "whitespace trip_id is no trip_id");
});

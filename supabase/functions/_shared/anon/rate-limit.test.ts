// Run with: deno test supabase/functions/_shared/anon/rate-limit.test.ts
import {
  ANON_IP_LIMIT_PER_DAY,
  ANON_SESSION_LIMIT_PER_DAY,
  decideAnonRateLimit,
  extractClientIp,
  isValidAnonSessionId,
} from "./rate-limit.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

const VALID_UUID = "11111111-2222-4333-8444-555555555555";

Deno.test("isValidAnonSessionId accepts a v4 UUID", () => {
  assert(isValidAnonSessionId(VALID_UUID), "v4 uuid should pass");
  assert(isValidAnonSessionId(crypto.randomUUID()), "crypto uuid should pass");
});

Deno.test("isValidAnonSessionId rejects non-v4 / malformed values", () => {
  assert(!isValidAnonSessionId(""), "empty string");
  assert(!isValidAnonSessionId("not-a-uuid"), "garbage string");
  // v1 uuid (time-based, third group starts with 1)
  assert(
    !isValidAnonSessionId("11111111-2222-1333-8444-555555555555"),
    "v1 uuid",
  );
  assert(!isValidAnonSessionId(undefined), "undefined");
  assert(!isValidAnonSessionId(123), "number");
});

Deno.test("extractClientIp prefers cf-connecting-ip", () => {
  const req = new Request("https://example.com", {
    headers: {
      "cf-connecting-ip": "203.0.113.5",
      "x-forwarded-for": "10.0.0.1, 10.0.0.2",
      "x-real-ip": "10.0.0.3",
    },
  });
  assert(extractClientIp(req) === "203.0.113.5", "cf header wins");
});

Deno.test("extractClientIp falls back to first x-forwarded-for entry", () => {
  const req = new Request("https://example.com", {
    headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" },
  });
  assert(extractClientIp(req) === "203.0.113.7", "first xff entry");
});

Deno.test("extractClientIp falls back to x-real-ip", () => {
  const req = new Request("https://example.com", {
    headers: { "x-real-ip": "203.0.113.9" },
  });
  assert(extractClientIp(req) === "203.0.113.9", "real-ip fallback");
});

Deno.test("extractClientIp returns null when no proxy headers are set", () => {
  const req = new Request("https://example.com");
  assert(extractClientIp(req) === null, "null when no headers");
});

Deno.test("extractClientIp strips IPv6 zone identifier", () => {
  const req = new Request("https://example.com", {
    headers: { "cf-connecting-ip": "fe80::1%eth0" },
  });
  assert(extractClientIp(req) === "fe80::1", "zone id stripped");
});

// ---- Rate-limit decision matrix ----------------------------------------

function makeDeps(opts: { sessionCount?: number; ipCount?: number }) {
  return {
    countSession: () => Promise.resolve(opts.sessionCount ?? 0),
    countIp: () => Promise.resolve(opts.ipCount ?? 0),
  };
}

Deno.test("decideAnonRateLimit allows when both counters are zero", async () => {
  const decision = await decideAnonRateLimit(makeDeps({}), VALID_UUID, "1.2.3.4");
  assert(decision.kind === "ok", "should allow");
});

Deno.test(
  "decideAnonRateLimit blocks when session has reached the per-day limit",
  async () => {
    const decision = await decideAnonRateLimit(
      makeDeps({ sessionCount: ANON_SESSION_LIMIT_PER_DAY }),
      VALID_UUID,
      "1.2.3.4",
    );
    assert(decision.kind === "blocked", "should block");
    assert(
      decision.kind === "blocked" && decision.reason === "session",
      "reason=session",
    );
  },
);

Deno.test(
  "decideAnonRateLimit blocks on IP only when session is clean and IP is at limit",
  async () => {
    const decision = await decideAnonRateLimit(
      makeDeps({ sessionCount: 0, ipCount: ANON_IP_LIMIT_PER_DAY }),
      VALID_UUID,
      "1.2.3.4",
    );
    assert(decision.kind === "blocked", "should block");
    assert(
      decision.kind === "blocked" && decision.reason === "ip",
      "reason=ip",
    );
  },
);

Deno.test(
  "decideAnonRateLimit checks session before IP — session reason wins on a tie",
  async () => {
    const decision = await decideAnonRateLimit(
      makeDeps({
        sessionCount: ANON_SESSION_LIMIT_PER_DAY,
        ipCount: ANON_IP_LIMIT_PER_DAY,
      }),
      VALID_UUID,
      "1.2.3.4",
    );
    assert(
      decision.kind === "blocked" && decision.reason === "session",
      "session checked first",
    );
  },
);

Deno.test(
  "decideAnonRateLimit skips IP check when client ip is null (proxy did not expose it)",
  async () => {
    let ipCalled = false;
    const decision = await decideAnonRateLimit(
      {
        countSession: () => Promise.resolve(0),
        countIp: () => {
          ipCalled = true;
          return Promise.resolve(99);
        },
      },
      VALID_UUID,
      null,
    );
    assert(decision.kind === "ok", "should allow when ip is null");
    assert(!ipCalled, "ip counter must NOT be called when ip is null");
  },
);

Deno.test(
  "decideAnonRateLimit allows the third IP request and blocks the fourth",
  async () => {
    // Mirror the spec test: 3 different anon_session_ids from same IP, fourth blocks.
    const allowed = await decideAnonRateLimit(
      makeDeps({ sessionCount: 0, ipCount: ANON_IP_LIMIT_PER_DAY - 1 }),
      VALID_UUID,
      "203.0.113.10",
    );
    assert(allowed.kind === "ok", "third call (count=2) should allow");

    const blocked = await decideAnonRateLimit(
      makeDeps({ sessionCount: 0, ipCount: ANON_IP_LIMIT_PER_DAY }),
      VALID_UUID,
      "203.0.113.10",
    );
    assert(
      blocked.kind === "blocked" && blocked.reason === "ip",
      "fourth call (count=3) blocks on ip",
    );
  },
);

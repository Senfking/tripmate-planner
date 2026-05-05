// Run with: deno test supabase/functions/claim-anonymous-trip/claim.test.ts
//
// These tests cover the claim logic against a recording mock client so we can
// assert the exact sequence of writes hit the right tables with the right
// values without touching a real Supabase instance.

import {
  type AnonTripPayload,
  type AnonTripRow,
  buildTripInsert,
  type ClaimDbClient,
  type ClaimQuery,
  materializeOne,
  stripEmojis,
} from "./claim.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("Assertion failed: " + msg);
}
function assertEquals<T>(actual: T, expected: T, msg: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

interface OpRecord {
  table: string;
  op: "insertReturning" | "insert" | "delete.eq" | "update.eq.is";
  values?: Record<string, unknown>;
  filter?: Record<string, unknown>;
}

interface MockOptions {
  // Per-table behavior overrides. Each function returns the next response.
  trips?: {
    insertReturning?: () => { data: { id: string } | null; error: { message: string } | null };
    delete?: () => { error: { message: string } | null };
  };
  ai_trip_plans?: {
    insert?: () => { error: { message: string } | null };
  };
  anonymous_trips?: {
    update?: () => { error: { message: string } | null };
  };
}

function makeMockClient(opts: MockOptions = {}): { client: ClaimDbClient; ops: OpRecord[] } {
  const ops: OpRecord[] = [];
  const client: ClaimDbClient = {
    from(table: string): ClaimQuery {
      return {
        insertReturning(values) {
          ops.push({ table, op: "insertReturning", values });
          if (table === "trips") {
            const r = opts.trips?.insertReturning?.() ?? {
              data: { id: "trip-uuid-1" },
              error: null,
            };
            return Promise.resolve(r);
          }
          return Promise.resolve({
            data: { id: `${table}-id` },
            error: null,
          });
        },
        insert(values) {
          ops.push({ table, op: "insert", values });
          if (table === "ai_trip_plans") {
            const r = opts.ai_trip_plans?.insert?.() ?? { error: null };
            return Promise.resolve(r);
          }
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(k, v) {
              ops.push({ table, op: "delete.eq", filter: { [k]: v } });
              const r = opts.trips?.delete?.() ?? { error: null };
              return Promise.resolve(r);
            },
          };
        },
        update(values) {
          return {
            eq(k1, v1) {
              return {
                is(k2, v2) {
                  ops.push({
                    table,
                    op: "update.eq.is",
                    values,
                    filter: { [k1]: v1, [`${k2}_is`]: v2 },
                  });
                  if (table === "anonymous_trips") {
                    const r = opts.anonymous_trips?.update?.() ?? { error: null };
                    return Promise.resolve(r);
                  }
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, ops };
}

const SAMPLE_PAYLOAD: AnonTripPayload = {
  trip_title: "🌊 Lisbon Long Weekend",
  destination_image_url: "https://img.example/lisbon.jpg",
  destination_country_iso: "PT",
  destinations: [
    { name: "Lisbon", start_date: "2026-06-10", end_date: "2026-06-14" },
  ],
  daily_budget_estimate: 120,
};

const UNCLAIMED_ROW: AnonTripRow = {
  id: "anon-row-1",
  prompt: "long weekend in lisbon, foodie vibe",
  payload: SAMPLE_PAYLOAD,
  claimed_trip_id: null,
  claimed_by_user_id: null,
  claimed_at: null,
};

// ---- buildTripInsert / stripEmojis -----------------------------------------

Deno.test("stripEmojis removes pictographs and collapses whitespace", () => {
  assertEquals(stripEmojis("🌊  Lisbon"), "Lisbon", "strips leading emoji");
  assertEquals(stripEmojis(""), "", "handles empty");
  assertEquals(stripEmojis(null), "", "handles null");
});

Deno.test("buildTripInsert maps payload onto the trips columns", () => {
  const insert = buildTripInsert(SAMPLE_PAYLOAD);
  assertEquals(insert.name, "Lisbon Long Weekend", "title strips emoji");
  assertEquals(insert.trip_name, "Lisbon Long Weekend", "trip_name mirrors name");
  assertEquals(insert.itinerary_title, "Lisbon Long Weekend", "itinerary_title mirrors name");
  assertEquals(insert.status, "draft", "status defaults to draft");
  assertEquals(insert.destination, "Lisbon", "destination joined");
  assertEquals(insert.tentative_start_date, "2026-06-10", "start date");
  assertEquals(insert.tentative_end_date, "2026-06-14", "end date");
  assertEquals(insert.destination_country_iso, "PT", "country iso");
  assertEquals(insert.destination_image_url, "https://img.example/lisbon.jpg", "image url");
});

Deno.test("buildTripInsert falls back to 'Your Trip' on missing title", () => {
  const insert = buildTripInsert({ destinations: [{ name: "Madrid" }] });
  assertEquals(insert.name, "Your Trip", "fallback title");
});

// ---- materializeOne happy path --------------------------------------------

Deno.test("materializeOne creates trip + plan, then marks anonymous_trips claimed", async () => {
  const { client: userClient, ops: userOps } = makeMockClient();
  const { client: svcClient, ops: svcOps } = makeMockClient();

  const result = await materializeOne(userClient, svcClient, "user-1", UNCLAIMED_ROW);
  assert(result.ok, "should succeed");
  assert(result.ok && result.tripId === "trip-uuid-1", "returns new trip id");
  assert(result.ok && result.created === true, "created=true on first claim");

  // User-side ops: trips insertReturning, then ai_trip_plans insert.
  assertEquals(userOps.length, 2, "two user-side writes");
  assertEquals(userOps[0].table, "trips", "first write is trips");
  assertEquals(userOps[0].op, "insertReturning", "trips uses insertReturning");
  assertEquals(userOps[1].table, "ai_trip_plans", "second write is ai_trip_plans");
  assertEquals(userOps[1].op, "insert", "plans uses insert");
  const planValues = userOps[1].values as Record<string, unknown>;
  assertEquals(planValues.trip_id, "trip-uuid-1", "plan links to trip id");
  assertEquals(planValues.created_by, "user-1", "plan attributes the caller");
  // Service-side ops: anonymous_trips claim update.
  assertEquals(svcOps.length, 1, "one service-side write");
  assertEquals(svcOps[0].table, "anonymous_trips", "marks anonymous_trips");
  assertEquals(svcOps[0].op, "update.eq.is", "claim is race-safe via .is(claimed_at, null)");
  const claimValues = svcOps[0].values as Record<string, unknown>;
  assertEquals(claimValues.claimed_by_user_id, "user-1", "claimed_by set");
  assertEquals(claimValues.claimed_trip_id, "trip-uuid-1", "claimed_trip_id set");
  assert(typeof claimValues.claimed_at === "string", "claimed_at is set");
});

// ---- Idempotency -----------------------------------------------------------

Deno.test("materializeOne is idempotent when the row is already claimed by the same user", async () => {
  const claimedRow: AnonTripRow = {
    ...UNCLAIMED_ROW,
    claimed_trip_id: "trip-existing",
    claimed_by_user_id: "user-1",
    claimed_at: "2026-05-04T10:00:00Z",
  };
  const { client: userClient, ops: userOps } = makeMockClient();
  const { client: svcClient, ops: svcOps } = makeMockClient();

  const result = await materializeOne(userClient, svcClient, "user-1", claimedRow);
  assert(result.ok, "should succeed");
  assert(result.ok && result.tripId === "trip-existing", "returns existing trip id");
  assert(result.ok && result.created === false, "created=false on idempotent re-entry");
  assertEquals(userOps.length, 0, "no user-side writes");
  assertEquals(svcOps.length, 0, "no service-side writes");
});

Deno.test("materializeOne refuses a row already claimed by a different user", async () => {
  const claimedRow: AnonTripRow = {
    ...UNCLAIMED_ROW,
    claimed_trip_id: "trip-other",
    claimed_by_user_id: "user-other",
    claimed_at: "2026-05-04T10:00:00Z",
  };
  const { client: userClient, ops: userOps } = makeMockClient();
  const { client: svcClient } = makeMockClient();

  const result = await materializeOne(userClient, svcClient, "user-1", claimedRow);
  assert(!result.ok, "should fail");
  assert(
    !result.ok && /already claimed/.test(result.error),
    "error mentions already-claimed",
  );
  assertEquals(userOps.length, 0, "no writes attempted");
});

// ---- Failure rollback ------------------------------------------------------

Deno.test("materializeOne rolls back the trip when ai_trip_plans insert fails", async () => {
  const { client: userClient, ops: userOps } = makeMockClient({
    ai_trip_plans: {
      insert: () => ({ error: { message: "rls denied" } }),
    },
  });
  const { client: svcClient, ops: svcOps } = makeMockClient();

  const result = await materializeOne(userClient, svcClient, "user-1", UNCLAIMED_ROW);
  assert(!result.ok, "should fail");
  // Trip insert + plan insert + trip rollback delete.
  assertEquals(userOps.length, 3, "trip + plan + rollback delete");
  assertEquals(userOps[2].table, "trips", "rollback hits trips");
  assertEquals(userOps[2].op, "delete.eq", "rollback uses delete");
  assertEquals(svcOps.length, 0, "anonymous_trips not touched on rollback");
});

Deno.test(
  "materializeOne reports a clean error when the trip insert itself fails",
  async () => {
    const { client: userClient, ops: userOps } = makeMockClient({
      trips: {
        insertReturning: () => ({
          data: null,
          error: { message: "trip rls denied" },
        }),
      },
    });
    const { client: svcClient, ops: svcOps } = makeMockClient();

    const result = await materializeOne(userClient, svcClient, "user-1", UNCLAIMED_ROW);
    assert(!result.ok, "should fail");
    assert(
      !result.ok && /trip rls denied/.test(result.error),
      "error surfaces underlying message",
    );
    assertEquals(userOps.length, 1, "no plan insert, no rollback");
    assertEquals(svcOps.length, 0, "no anonymous_trips write");
  },
);

Deno.test(
  "materializeOne still reports success when anonymous_trips claim update fails",
  async () => {
    // Trip and plan creation succeed. Only the bookkeeping update fails. The
    // user already has the materialized trip — we don't roll it back.
    const { client: userClient } = makeMockClient();
    const { client: svcClient, ops: svcOps } = makeMockClient({
      anonymous_trips: {
        update: () => ({ error: { message: "transient" } }),
      },
    });

    const result = await materializeOne(userClient, svcClient, "user-1", UNCLAIMED_ROW);
    assert(result.ok, "still succeeds (trip is created)");
    assertEquals(svcOps.length, 1, "claim update was attempted");
  },
);

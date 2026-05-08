// Run with:
//   deno test supabase/functions/generate-trip-itinerary/empty-day-recovery.test.ts
//
// Covers Fix 1 (empty-day safety net) — projectedActivityCount and the
// maybeRecoverEmptyDay orchestrator that retries rankDay with empty
// avoid_place_ids when the initial result would project to zero kept
// activities.

import {
  maybeRecoverEmptyDay,
  projectedActivityCount,
  type RecoveryDaySkeleton,
  type RecoveryRankResult,
  type RecoveryRawDay,
  type RecoveryLogger,
} from "./empty-day-recovery.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

function assertEqual<T>(a: T, b: T, msg: string): void {
  if (a !== b) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
  }
}

function makeDay(
  overrides: Partial<RecoveryDaySkeleton> = {},
): RecoveryDaySkeleton {
  return {
    day_number: 6,
    destination_index: 0,
    date: "2026-05-13",
    slots: [
      { type: "afternoon_major", start_time: "14:00", duration_minutes: 120 },
      { type: "dinner", start_time: "20:00", duration_minutes: 90 },
      { type: "nightlife", start_time: "22:30", duration_minutes: 120 },
    ],
    ...overrides,
  };
}

function makePool(ids: string[]): Map<string, { id: string }> {
  return new Map(ids.map((id) => [id, { id }]));
}

function makeRawDayWithNullPlaceIds(): RecoveryRawDay {
  // Mirrors the production failure: every slot picked but place_id=null,
  // is_event=false. hydrateActivity drops them all → empty day.
  return {
    activities: [
      { slot_index: 0, place_id: null, is_event: false },
      { slot_index: 1, place_id: null, is_event: false },
      { slot_index: 2, place_id: null, is_event: false },
    ],
  };
}

function makeRawDayWithValidPicks(): RecoveryRawDay {
  return {
    activities: [
      { slot_index: 0, place_id: "place_A", is_event: false },
      { slot_index: 1, place_id: "place_B", is_event: false },
      { slot_index: 2, place_id: "place_C", is_event: false },
    ],
  };
}

// ---------------------------------------------------------------------------
// projectedActivityCount
// ---------------------------------------------------------------------------

Deno.test("projectedActivityCount: null rawDay returns 0", () => {
  const day = makeDay();
  assertEqual(projectedActivityCount(null, day, new Set(), new Map(), null), 0, "null");
});

Deno.test("projectedActivityCount: every place_id=null + is_event=false → 0", () => {
  // The Dubai Day-6 production case. LLM follows the prompt's "emit
  // place_id=null for unfillable slots" instruction; hydration drops them.
  const day = makeDay();
  const raw = makeRawDayWithNullPlaceIds();
  const pool = makePool(["place_A", "place_B", "place_C"]);
  assertEqual(projectedActivityCount(raw, day, new Set(), pool, null), 0, "all-null");
});

Deno.test("projectedActivityCount: legSeen drops dedup'd picks", () => {
  const day = makeDay();
  const raw = makeRawDayWithValidPicks();
  const pool = makePool(["place_A", "place_B", "place_C"]);
  // place_A already claimed by an earlier day.
  const seen = new Set(["place_A"]);
  assertEqual(projectedActivityCount(raw, day, seen, pool, null), 2, "B+C kept, A deduped");
});

Deno.test("projectedActivityCount: leg accommodation collision drops the pick", () => {
  const day = makeDay();
  const raw = makeRawDayWithValidPicks();
  const pool = makePool(["place_A", "place_B", "place_C"]);
  // place_A IS the leg's hotel; can't render it again as an activity.
  assertEqual(projectedActivityCount(raw, day, new Set(), pool, "place_A"), 2, "B+C kept");
});

Deno.test("projectedActivityCount: place_id not in pool drops non-events", () => {
  const day = makeDay();
  const raw = makeRawDayWithValidPicks();
  const pool = makePool(["place_A", "place_B"]); // place_C absent
  assertEqual(projectedActivityCount(raw, day, new Set(), pool, null), 2, "C dropped");
});

Deno.test("projectedActivityCount: events without place_id still count", () => {
  const day = makeDay();
  const raw: RecoveryRawDay = {
    activities: [
      { slot_index: 0, place_id: null, is_event: true }, // event row, kept
      { slot_index: 1, place_id: null, is_event: false }, // dropped
      { slot_index: 2, place_id: "place_C", is_event: false },
    ],
  };
  const pool = makePool(["place_C"]);
  assertEqual(projectedActivityCount(raw, day, new Set(), pool, null), 2, "event + C");
});

// ---------------------------------------------------------------------------
// maybeRecoverEmptyDay — the orchestrator the user explicitly asked us to
// test: mock rankDay to return all-null place_ids on first call and valid
// picks on retry, verify the second call uses empty avoidIds.
// ---------------------------------------------------------------------------

interface CapturedCall {
  avoidIds: string[];
  unfulfilled: string[];
  isLastDay: boolean;
}

function makeCapturingRanker(
  responses: ReadonlyArray<RecoveryRankResult<RecoveryRawDay>>,
): {
  rankOneDay: (day: RecoveryDaySkeleton, avoidIds: string[], unfulfilled: string[], isLastDay: boolean) => Promise<RecoveryRankResult<RecoveryRawDay>>;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  let i = 0;
  const rankOneDay = (
    _day: RecoveryDaySkeleton,
    avoidIds: string[],
    unfulfilled: string[],
    isLastDay: boolean,
  ): Promise<RecoveryRankResult<RecoveryRawDay>> => {
    calls.push({ avoidIds: [...avoidIds], unfulfilled: [...unfulfilled], isLastDay });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return Promise.resolve(r);
  };
  return { rankOneDay, calls };
}

function silentLogger(): RecoveryLogger & { warns: string[]; errors: string[] } {
  const warns: string[] = [];
  const errors: string[] = [];
  return {
    warn: (m) => warns.push(m),
    error: (m) => errors.push(m),
    warns,
    errors,
  };
}

Deno.test("maybeRecoverEmptyDay: retries with empty avoidIds when initial returns all-null place_ids", async () => {
  // The exact scenario the prompt asks about: first rank call returns
  // all-null place_ids (production Day-6 failure mode); retry returns
  // valid picks. We verify the SECOND rankDay call receives avoidIds=[].
  const day = makeDay();
  const pool = makePool(["place_A", "place_B", "place_C"]);
  const initial: RecoveryRankResult<RecoveryRawDay> = {
    raw: makeRawDayWithNullPlaceIds(),
    source: "llm",
  };
  const retry: RecoveryRankResult<RecoveryRawDay> = {
    raw: makeRawDayWithValidPicks(),
    source: "llm",
  };
  const { rankOneDay, calls } = makeCapturingRanker([retry]);
  const log = silentLogger();

  const result = await maybeRecoverEmptyDay({
    initial,
    day,
    avoidIds: ["place_X", "place_Y", "place_Z"],
    unfulfilledMustHaves: ["beach club"],
    isLastDay: false,
    legSeen: new Set(),
    legPool: pool,
    legAccomId: null,
    mustHaves: ["beach club", "rooftop"],
    rankOneDay,
    logger: log,
  });

  assertEqual(calls.length, 1, "rankOneDay called exactly once for the retry");
  assertEqual(calls[0].avoidIds.length, 0, "retry call uses empty avoidIds");
  assertEqual(result.recovered, true, "recovered flag is true");
  assertEqual(result.retryFailed, false, "retry succeeded");
  assertEqual(result.settled, retry, "settled is the retry result");
  assert(
    log.warns.some((m) => m.includes("[recovery] reused_pool") && m.includes("day_number=6")),
    "warn includes the [recovery] log line for day 6",
  );
  assert(
    log.warns.some((m) => m.includes("original_avoid_count=3")),
    "warn captures the original avoid count",
  );
});

Deno.test("maybeRecoverEmptyDay: skips retry when avoidIds was already empty", async () => {
  // Parallel-mode (or first day) call — the retry would be identical to
  // the initial call, so we must NOT retry.
  const day = makeDay();
  const pool = makePool(["place_A"]);
  const initial: RecoveryRankResult<RecoveryRawDay> = {
    raw: makeRawDayWithNullPlaceIds(),
    source: "llm",
  };
  const { rankOneDay, calls } = makeCapturingRanker([]);
  const log = silentLogger();

  const result = await maybeRecoverEmptyDay({
    initial,
    day,
    avoidIds: [],
    unfulfilledMustHaves: [],
    isLastDay: false,
    legSeen: new Set(),
    legPool: pool,
    legAccomId: null,
    mustHaves: [],
    rankOneDay,
    logger: log,
  });

  assertEqual(calls.length, 0, "no retry when avoidIds was empty");
  assertEqual(result.recovered, false, "not recovered");
  assertEqual(log.warns.length, 0, "no warn");
  assertEqual(log.errors.length, 0, "no error");
});

Deno.test("maybeRecoverEmptyDay: skips retry on transit days", async () => {
  // Transit days are intentionally skeleton-only — never retry.
  const day = makeDay({ transit: { from_index: 0, to_index: 1, half_day: false, description: "" } });
  const initial: RecoveryRankResult<RecoveryRawDay> = { raw: makeRawDayWithNullPlaceIds(), source: "llm" };
  const { rankOneDay, calls } = makeCapturingRanker([]);
  const log = silentLogger();

  const result = await maybeRecoverEmptyDay({
    initial,
    day,
    avoidIds: ["place_X"],
    unfulfilledMustHaves: [],
    isLastDay: false,
    legSeen: new Set(),
    legPool: makePool([]),
    legAccomId: null,
    mustHaves: [],
    rankOneDay,
    logger: log,
  });

  assertEqual(calls.length, 0, "transit day not retried");
  assertEqual(result.recovered, false, "not recovered");
});

Deno.test("maybeRecoverEmptyDay: no retry when initial already projects to >0", async () => {
  // Happy path — initial picks survive projection, no retry.
  const day = makeDay();
  const pool = makePool(["place_A", "place_B", "place_C"]);
  const initial: RecoveryRankResult<RecoveryRawDay> = {
    raw: makeRawDayWithValidPicks(),
    source: "llm",
  };
  const { rankOneDay, calls } = makeCapturingRanker([]);
  const log = silentLogger();

  const result = await maybeRecoverEmptyDay({
    initial,
    day,
    avoidIds: ["place_X"],
    unfulfilledMustHaves: [],
    isLastDay: false,
    legSeen: new Set(),
    legPool: pool,
    legAccomId: null,
    mustHaves: [],
    rankOneDay,
    logger: log,
  });

  assertEqual(calls.length, 0, "no retry");
  assertEqual(result.recovered, false, "not recovered");
  assertEqual(result.settled, initial, "settled is the initial result");
});

Deno.test("maybeRecoverEmptyDay: emits empty_day_after_retry envelope when retry also returns 0", async () => {
  // Worst case: pool truly exhausted, retry also fails. We accept the
  // empty day but emit a structured stderr envelope so log aggregation
  // can route it.
  const day = makeDay();
  const pool = makePool(["place_A"]); // tiny pool, retry can't help either
  const initial: RecoveryRankResult<RecoveryRawDay> = {
    raw: makeRawDayWithNullPlaceIds(),
    source: "llm",
  };
  const retry: RecoveryRankResult<RecoveryRawDay> = {
    raw: makeRawDayWithNullPlaceIds(), // STILL all null
    source: "llm",
  };
  const { rankOneDay, calls } = makeCapturingRanker([retry]);
  const log = silentLogger();

  const result = await maybeRecoverEmptyDay({
    initial,
    day,
    avoidIds: ["place_X", "place_Y"],
    unfulfilledMustHaves: ["beach club"],
    isLastDay: false,
    legSeen: new Set(),
    legPool: pool,
    legAccomId: null,
    mustHaves: ["beach club", "rooftop"],
    rankOneDay,
    logger: log,
  });

  assertEqual(calls.length, 1, "retry attempted");
  assertEqual(result.recovered, true, "recovered flag set even on retry failure");
  assertEqual(result.retryFailed, true, "retryFailed flag set");
  assertEqual(log.errors.length, 1, "one error envelope emitted");
  const envelope = JSON.parse(log.errors[0]);
  assertEqual(envelope.tag, "empty_day_after_retry", "envelope tagged");
  assertEqual(envelope.day_number, 6, "envelope carries day_number");
  assertEqual(envelope.leg_index, 0, "envelope carries leg_index");
  assertEqual(envelope.pool_size, 1, "envelope carries pool_size");
  assert(
    Array.isArray(envelope.must_haves) && envelope.must_haves.includes("beach club"),
    "envelope carries must_haves",
  );
});

Deno.test("maybeRecoverEmptyDay: passes unfulfilled must-haves through to the retry call", async () => {
  // The retry should preserve must-have signal so the LLM still tries to
  // fulfil "beach club" / "rooftop" — even though we're letting it reuse.
  const day = makeDay();
  const pool = makePool(["place_A", "place_B", "place_C"]);
  const initial: RecoveryRankResult<RecoveryRawDay> = {
    raw: makeRawDayWithNullPlaceIds(),
    source: "llm",
  };
  const retry: RecoveryRankResult<RecoveryRawDay> = {
    raw: makeRawDayWithValidPicks(),
    source: "llm",
  };
  const { rankOneDay, calls } = makeCapturingRanker([retry]);

  await maybeRecoverEmptyDay({
    initial,
    day,
    avoidIds: ["place_X"],
    unfulfilledMustHaves: ["beach club", "rooftop bar"],
    isLastDay: true,
    legSeen: new Set(),
    legPool: pool,
    legAccomId: null,
    mustHaves: ["beach club", "rooftop bar"],
    rankOneDay,
    logger: silentLogger(),
  });

  assertEqual(calls[0].unfulfilled.length, 2, "unfulfilled passed through");
  assertEqual(calls[0].unfulfilled[0], "beach club", "unfulfilled[0] preserved");
  assertEqual(calls[0].isLastDay, true, "isLastDay flag preserved on retry");
});

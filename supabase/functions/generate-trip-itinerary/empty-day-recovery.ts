// Empty-day recovery helper.
//
// Background: in sequential ranking mode (numDays >= SEQUENTIAL_RANKING_MIN_DAYS)
// each day's call to rankDay receives `avoid_place_ids` containing every
// place_id already used by earlier days of the same leg. The system prompt
// instructs the model to emit `place_id=null` for slots it cannot fill from
// the unclaimed pool — leaving the slot visibly empty rather than reusing
// a venue. On long single-leg trips (Dubai 8 days, Tokyo 10 days) this can
// drain the unclaimed pool by Day 5-6, so the model returns a day full of
// `place_id=null` slots and hydration drops every one (hydrateActivity's
// `if (!raw.is_event && !place) return null` guard). Net effect: a visibly
// empty day in the rendered itinerary.
//
// This module is the band-aid: when a sequential-mode day's rank result
// would project to zero kept activities, retry the rank call ONCE with
// avoid_place_ids=[]. Venue reuse on that day is preferred over a blank
// slate. The deeper fix is geographic per-day planning (Phase 3c) — until
// then, the safety net keeps no day from shipping empty.
//
// Pure helpers extracted into a sibling module so unit tests can import
// directly without loading index.ts (which calls Deno.serve at module load
// and pulls in 11k+ lines of ranker code).

// ---------------------------------------------------------------------------
// Minimal structural types — duplicated from index.ts so this module stays
// dependency-free of the edge function entry point. They MUST stay in sync
// with the corresponding interfaces in index.ts.
// ---------------------------------------------------------------------------

export interface RecoveryRawActivity {
  slot_index: number;
  place_id: string | null;
  is_event: boolean;
}

export interface RecoveryRawDay {
  activities?: ReadonlyArray<RecoveryRawActivity | null | undefined> | null;
}

export interface RecoveryDaySkeleton {
  day_number: number;
  destination_index: number;
  date: string;
  transit?: unknown; // marker only — caller decides shape; presence means "skip recovery"
  slots: ReadonlyArray<{
    type: string;
    start_time: string;
    duration_minutes: number;
  }>;
}

export interface RecoveryPlace {
  id: string;
  // Only fields needed by the projected-count check. Caller can pass full
  // BatchPlaceResult — extra fields are ignored.
  // (We deliberately do NOT validate openingHours here; the projected count
  // is intentionally optimistic about hours so we don't over-trigger the
  // retry. closed_at_slot drops still happen at the real hydrate step.)
}

export interface RecoveryRankResult<R = RecoveryRawDay> {
  raw: R | null;
  source: "llm" | "fallback";
}

// ---------------------------------------------------------------------------
// projectedActivityCount — predict how many activities the real hydrate step
// would keep, without committing any side effects. Mirrors the per-slot
// drop checks at the head of hydrateDay/hydrateAndEmit:
//   - slot must have a matching rawAct
//   - place_id already in legSeen → drop (dedup)
//   - place_id === leg accommodation → drop (collision)
//   - non-event with place_id but place not in pool → drop
//   - non-event without place_id → drop (hydrateActivity returns null)
//
// Intentionally OPTIMISTIC about closed_at_slot and post-hydrate validation
// (distance, businessStatus) — those are rare drops, and false-negatives on
// the recovery trigger are preferable to false-positives (we'd retry on a
// day that would have shipped fine).
// ---------------------------------------------------------------------------
export function projectedActivityCount(
  rawDay: RecoveryRawDay | null,
  day: RecoveryDaySkeleton,
  legSeen: ReadonlySet<string>,
  legPool: ReadonlyMap<string, RecoveryPlace>,
  legAccomId: string | null,
): number {
  if (!rawDay) return 0;
  const rawActs = Array.isArray(rawDay.activities) ? rawDay.activities : [];
  let n = 0;
  for (let i = 0; i < day.slots.length; i++) {
    const rawAct = rawActs.find((a) => a?.slot_index === i);
    if (!rawAct) continue;
    if (rawAct.place_id && legSeen.has(rawAct.place_id)) continue;
    if (legAccomId && rawAct.place_id === legAccomId) continue;
    if (!rawAct.is_event) {
      if (!rawAct.place_id) continue; // hydrateActivity would return null
      if (!legPool.has(rawAct.place_id)) continue;
    }
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// EmptyDayAfterRetryEnvelope — structured stderr payload emitted when the
// retry ALSO returns zero activities. Tagged so log aggregation can route
// it (Sentry, Supabase log search) without a regex over free-form text.
// ---------------------------------------------------------------------------
export interface EmptyDayAfterRetryEnvelope {
  tag: "empty_day_after_retry";
  day_number: number;
  leg_index: number;
  pool_size: number;
  must_haves: readonly string[];
}

// ---------------------------------------------------------------------------
// maybeRecoverEmptyDay — orchestrator. Given the initial rank result and the
// rankOneDay continuation, decides whether to retry with avoid_place_ids=[]
// and emits the recovery / failure logs. Returns the (possibly new) settled
// result plus a `recovered` flag the caller can use for telemetry.
//
// Triggers retry IFF:
//   - day is a destination day (not transit)
//   - initial avoidIds was non-empty (otherwise the retry would be identical)
//   - projectedActivityCount(initial.raw) === 0
//
// Hooks (defaulted to console.* but overridable for tests):
//   - logger.warn for the [recovery] line
//   - logger.error for the empty_day_after_retry envelope (JSON-stringified)
// ---------------------------------------------------------------------------
export interface RecoveryLogger {
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export const DEFAULT_RECOVERY_LOGGER: RecoveryLogger = {
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

export interface MaybeRecoverEmptyDayInput<R extends RecoveryRawDay> {
  initial: RecoveryRankResult<R>;
  day: RecoveryDaySkeleton;
  avoidIds: readonly string[];
  unfulfilledMustHaves: readonly string[];
  isLastDay: boolean;
  legSeen: ReadonlySet<string>;
  legPool: ReadonlyMap<string, RecoveryPlace>;
  legAccomId: string | null;
  mustHaves: readonly string[];
  rankOneDay: (
    day: RecoveryDaySkeleton,
    avoidIds: string[],
    unfulfilledMustHaves: string[],
    isLastDay: boolean,
  ) => Promise<RecoveryRankResult<R>>;
  logger?: RecoveryLogger;
}

export interface MaybeRecoverEmptyDayResult<R extends RecoveryRawDay> {
  settled: RecoveryRankResult<R>;
  recovered: boolean;
  retryFailed: boolean;
}

export async function maybeRecoverEmptyDay<R extends RecoveryRawDay>(
  input: MaybeRecoverEmptyDayInput<R>,
): Promise<MaybeRecoverEmptyDayResult<R>> {
  const {
    initial, day, avoidIds, unfulfilledMustHaves, isLastDay,
    legSeen, legPool, legAccomId, mustHaves, rankOneDay,
    logger = DEFAULT_RECOVERY_LOGGER,
  } = input;

  // Transit days are intentionally skeleton-only — never retry.
  if (day.transit) return { settled: initial, recovered: false, retryFailed: false };
  // No claimed venues to free up; retry would be identical to the initial call.
  if (avoidIds.length === 0) return { settled: initial, recovered: false, retryFailed: false };

  const projected = projectedActivityCount(initial.raw, day, legSeen, legPool, legAccomId);
  if (projected > 0) return { settled: initial, recovered: false, retryFailed: false };

  logger.warn(
    `[recovery] reused_pool day_number=${day.day_number} original_avoid_count=${avoidIds.length}`,
  );
  const retry = await rankOneDay(day, [], [...unfulfilledMustHaves], isLastDay);
  const retryProjected = projectedActivityCount(retry.raw, day, legSeen, legPool, legAccomId);

  if (retryProjected === 0) {
    const envelope: EmptyDayAfterRetryEnvelope = {
      tag: "empty_day_after_retry",
      day_number: day.day_number,
      leg_index: day.destination_index,
      pool_size: legPool.size,
      must_haves: [...mustHaves],
    };
    logger.error(JSON.stringify(envelope));
    return { settled: retry, recovered: true, retryFailed: true };
  }
  return { settled: retry, recovered: true, retryFailed: false };
}

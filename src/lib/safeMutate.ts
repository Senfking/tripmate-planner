// Affected-row guards for Supabase mutations.
//
// Why this exists: PostgREST returns `data: []` with `error: null` when an
// RLS policy rejects an UPDATE/DELETE — for example when a backgrounded tab
// resumes with an expired JWT and `auth.uid()` evaluates to NULL. Call sites
// that gate only on `if (error)` treat the silent no-op as success and the
// UI confirms an action that never happened (e.g. "Trip deleted" toast while
// the row still exists in the database).
//
// The fix is to chain `.select()` on the mutation, then assert at least one
// row came back. This file wraps that pattern so call sites stay one-liners
// and the failure mode (toast: "Action could not be completed. Please refresh
// and try again.") is consistent across the app.

import type { PostgrestError } from "@supabase/supabase-js";

// Marker error thrown when a mutation succeeded at the network layer but
// affected zero rows. friendlyErrorMessage detects the `code` to surface a
// distinct toast — this is NOT a generic "something went wrong" case, it
// almost always means the user's permissions changed (session expired,
// removed from trip, etc.) and they need to refresh.
export class NoAffectedRowsError extends Error {
  readonly code = "PGRST_NO_AFFECTED_ROWS";
  constructor(message = "Action could not be completed. Please refresh and try again.") {
    super(message);
    this.name = "NoAffectedRowsError";
  }
}

type MutationResponse<T> = {
  data: T[] | null;
  error: PostgrestError | null;
};

// Throws on PostgREST error; throws NoAffectedRowsError on the silent-RLS
// case; otherwise returns the affected rows. Pass the awaited result of a
// mutation that already has `.select(...)` chained.
//
//   const rows = expectAffectedRows(
//     await supabase.from("trips").delete().eq("id", tripId).select("id"),
//     "Trip could not be deleted. Please refresh and try again.",
//   );
//
// The fallback message is what the user sees in the toast (via
// friendlyErrorMessage). Keep it short and action-oriented.
export function expectAffectedRows<T>(
  result: MutationResponse<T>,
  fallback?: string,
): T[] {
  if (result.error) throw result.error;
  if (!result.data || result.data.length === 0) {
    throw new NoAffectedRowsError(fallback);
  }
  return result.data;
}

// Variant for mutations that should affect exactly one row (UPDATE by primary
// key, DELETE by primary key). Same throwing behavior as expectAffectedRows;
// returns the single row. Throws if more than one row was returned (data
// integrity bug — the caller's filter wasn't unique).
export function expectOneAffectedRow<T>(
  result: MutationResponse<T>,
  fallback?: string,
): T {
  const rows = expectAffectedRows(result, fallback);
  if (rows.length > 1) {
    throw new Error(`Expected one affected row, got ${rows.length}`);
  }
  return rows[0];
}

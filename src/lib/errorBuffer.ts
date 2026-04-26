// Small in-memory ring buffer for recent errors.
//
// Every error logging path (withAuthRetry / withMutationRetry, ErrorBoundary,
// global window handlers, React Query caches) pushes into this buffer.
// FeedbackWidget reads from it on submit and attaches the recent context to
// the feedback row's metadata column — so when a user reports a bug we
// already have the trail of what just broke, without asking them to paste
// console output from a phone.
//
// Bounded by both count (MAX_ENTRIES) and age (MAX_AGE_MS): on read, only
// entries from the last 60 seconds are returned, and never more than 5.
// Older entries are pruned lazily on push so the buffer stays tiny.

export type ErrorSource =
  | "supabase_op" // withAuthRetry — a Supabase query/mutation that failed terminally
  | "react_crash" // ErrorBoundary caught a render/lifecycle throw
  | "unhandled_rejection" // window.unhandledrejection
  | "uncaught_exception" // window.error
  | "query_cache" // React Query QueryCache.onError catch-all
  | "mutation_cache"; // React Query MutationCache.onError catch-all

export interface ErrorBufferEntry {
  /** epoch ms when the error was captured */
  ts: number;
  source: ErrorSource;
  /** Stable label (op name, query key, "unhandled", …) */
  name: string;
  message: string | null;
  /** PostgREST/Postgres error code if available */
  code?: string | null;
  /** HTTP status if available */
  status?: number | null;
  /** Route where the error occurred */
  route?: string | null;
  /** Free-form extra fields — kept small */
  extra?: Record<string, unknown>;
}

const MAX_ENTRIES = 25; // hard cap on buffer size; reads return at most 5
const MAX_AGE_MS = 60_000; // 60s window
const READ_LIMIT = 5;

const buffer: ErrorBufferEntry[] = [];

export function pushError(entry: Omit<ErrorBufferEntry, "ts"> & { ts?: number }): void {
  const now = entry.ts ?? Date.now();
  // Prune anything older than the window before pushing.
  pruneOlderThan(now - MAX_AGE_MS);
  buffer.push({ ...entry, ts: now });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

export function getRecentErrors(now: number = Date.now()): ErrorBufferEntry[] {
  const cutoff = now - MAX_AGE_MS;
  pruneOlderThan(cutoff);
  // Return the most recent READ_LIMIT entries within the window, oldest first.
  return buffer.slice(-READ_LIMIT);
}

export function clearErrors(): void {
  buffer.length = 0;
}

function pruneOlderThan(cutoff: number) {
  // Buffer is push-ordered (chronological), so drop from the front while too old.
  let i = 0;
  while (i < buffer.length && buffer[i].ts < cutoff) i++;
  if (i > 0) buffer.splice(0, i);
}

// For tests / debugging only.
export function _bufferLength(): number {
  return buffer.length;
}

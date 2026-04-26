import { trackEvent } from "@/lib/analytics";
import { ensureFreshSession, forceRefreshSession } from "@/lib/sessionRefresh";
import { isAuthOrRlsError } from "@/lib/supabaseErrors";

// Centralized resilience wrapper for any Supabase call (query OR a single
// op inside a mutation). Use it instead of re-implementing the
// ensureFreshSession + retry-on-auth-error pattern at every call site.
//
//   const data = await withAuthRetry(
//     async () => {
//       const { data, error } = await supabase.from(...).select(...);
//       if (error) throw error;
//       return data;
//     },
//     { name: "expenses", context: { trip_id }, userId: user?.id },
//   );
//
// Behavior:
//   1. ensureFreshSession() pre-flight — closes the JWT-expiry race that
//      fires when a backgrounded tab resumes faster than auto-refresh.
//   2. On an auth/RLS error, forceRefreshSession() and retry once.
//   3. On terminal failure, log full Postgres error shape (code, status,
//      details, hint) plus environment hints (online, display_mode) via
//      trackEvent("supabase_op_error"). This is the diagnostic channel —
//      removing it leaves us flying blind on user-reported errors.
//
// IMPORTANT: for non-idempotent operations (INSERT calls), wrap each
// supabase call individually rather than wrapping the whole mutationFn —
// otherwise a retry can create duplicate rows. updateExpense's split
// replacement is idempotent (replace_expense_splits RPC); raw INSERTs are
// not.
export interface SafeQueryOpts {
  /** Stable name for the operation, used as the op label in analytics */
  name: string;
  /** Extra fields merged into the failure log (trip_id, expense_id, …) */
  context?: Record<string, unknown>;
  /** User id for the analytics row */
  userId?: string;
}

export async function withAuthRetry<T>(
  exec: () => Promise<T>,
  opts: SafeQueryOpts,
): Promise<T> {
  await ensureFreshSession();
  try {
    return await exec();
  } catch (err) {
    if (isAuthOrRlsError(err)) {
      await forceRefreshSession();
      try {
        return await exec();
      } catch (retryErr) {
        logSupabaseFailure(opts, retryErr, true);
        throw retryErr;
      }
    }
    logSupabaseFailure(opts, err, false);
    throw err;
  }
}

// Captures the full error shape so we can diagnose without DevTools/console
// access. Mirrored by App.tsx's MutationCache.onError for any mutation that
// hasn't been wrapped explicitly.
//
// TEMPORARY: keep until we've collected a few days of real failure data,
// then drop the trackEvent (or fold into Sentry once that lands). The
// helper itself stays — only the analytics call is the disposable bit.
export function logSupabaseFailure(
  opts: SafeQueryOpts,
  err: unknown,
  retried: boolean,
): void {
  const e = err as Record<string, unknown> | null;
  trackEvent(
    "supabase_op_error",
    {
      op: opts.name,
      retried,
      code: typeof e?.code === "string" ? e.code : null,
      status: typeof e?.status === "number" ? e.status : null,
      name: typeof e?.name === "string" ? e.name : null,
      message: typeof e?.message === "string" ? e.message.slice(0, 300) : null,
      details: typeof e?.details === "string" ? e.details.slice(0, 300) : null,
      hint: typeof e?.hint === "string" ? e.hint.slice(0, 200) : null,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      display_mode: getDisplayMode(),
      route: typeof window !== "undefined" ? window.location.pathname : null,
      ...opts.context,
    },
    opts.userId,
  );
}

function getDisplayMode(): "standalone" | "browser" | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser";
}

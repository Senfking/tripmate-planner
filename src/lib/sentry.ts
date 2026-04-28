import * as Sentry from "@sentry/react";

// Sentry is opt-in: it only initializes when VITE_SENTRY_DSN is set so dev
// and local environments don't pollute the project. Init happens before
// React renders (see src/main.tsx) so early errors are captured.
let initialized = false;

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: typeof __BUILD_TS__ !== "undefined" ? __BUILD_TS__ : undefined,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    beforeSend(event, hint) {
      // Supabase Auth's cross-tab lock fires this when another tab takes over
      // the auth-token mutex (e.g. after a token refresh). It's expected
      // behavior, not an error worth paging on. Drop it before it reaches
      // the project.
      const message =
        (hint?.originalException as Error | undefined)?.message ??
        event.message ??
        "";
      if (typeof message === "string" && /Lock '.*' was released because another request stole it/i.test(message)) {
        return null;
      }
      return event;
    },
  });

  initialized = true;
}

function getDisplayMode(): "standalone" | "browser" {
  if (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) {
    return "standalone";
  }
  return "browser";
}

// Common tags every event should carry. Kept in one place so all capture sites
// stay consistent. user_id is set by callers that have access to auth context.
function commonTags(userId?: string | null): Record<string, string | boolean> {
  const tags: Record<string, string | boolean> = {
    route: typeof window !== "undefined" ? window.location.pathname : "",
    display_mode: getDisplayMode(),
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
  };
  if (userId) tags.user_id = userId;
  return tags;
}

export interface SupabaseFailureExtras {
  op?: string;
  retried?: boolean;
  code?: string | null;
  status?: number | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
  name?: string | null;
  user_id?: string | null;
  /** Additional context (trip_id, expense_id, mutation_key, …) */
  [key: string]: unknown;
}

export function captureSupabaseFailure(error: unknown, extras: SupabaseFailureExtras = {}): void {
  if (!initialized) return;

  // Skip noise we don't want in Sentry:
  // - offline failures (the retry layer handles these on reconnect)
  // - expected auth failures (auth flow surfaces these to the user)
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (extras.status === 401 || extras.status === 403) return;

  const { user_id, ...rest } = extras;
  Sentry.captureException(error, {
    tags: commonTags(user_id ?? null),
    extra: rest,
  });
}

export function captureReactError(
  error: unknown,
  componentStack: string | null | undefined,
  userId?: string | null,
): void {
  if (!initialized) return;
  Sentry.captureException(error, {
    tags: commonTags(userId ?? null),
    contexts: {
      react: { componentStack: componentStack ?? "" },
    },
  });
}

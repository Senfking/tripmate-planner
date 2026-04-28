# JUNTO — Claude Code Instructions

## Stack
- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Backend: Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions in Deno)
- Routing: React Router v6
- State: React Context + Supabase Realtime subscriptions
- Icons: Lucide React only. Never mix icon libraries.
- Supabase project ref: dwtbqomfleihcvkfoopm

## Hard Rules

### Routing
- Every route component must independently fetch its data. Never assume parent components have loaded state.
- Use useParams() to extract tripId and query Supabase directly.
- Wrap major route components in Error Boundaries with user-friendly fallback UI.

### Supabase
- All database triggers must use BEGIN...EXCEPTION WHEN OTHERS THEN RAISE LOG to prevent cascading failures.
- Every new table requires RLS policies defined in the migration file.
- pg_net http_post requires positional parameters and jsonb body type. Named parameters and text body type fail silently.
- Use Supabase Realtime subscriptions for collaborative features.
- Edge Functions deploy through Lovable. Secrets set in Supabase Dashboard UI.

### UI/UX
- Destructive actions: red color, trash-2 icon, confirmation dialog.
- Edit actions: pencil icon, neutral color, opens modal with pre-filled form.
- Loading: skeleton components, not spinners.
- Empty states: every list/table must have a designed empty state with a CTA.
- All modals scrollable and usable at 375px viewport width.

### AI Features
- System prompts stored as constants, not inline strings.
- All LLM responses validated against a schema before use.
- Wrap all AI calls in try/catch with user-facing toast errors.
- Never trust LLM to generate factual data (venue names, locations). Use external APIs as source of truth, LLM for ranking/enrichment only.

### Dates
- Store as ISO 8601 strings in UTC.
- Use date-fns for manipulation and formatting.
- Never use "today + N days" as fallback for trip dates.

### Known Pitfalls
- exchange_rate_cache only has EUR/USD/GBP bases. Cross-calculation needed for other currencies (use EUR as intermediary).
- REPLICA IDENTITY FULL required on tables that need realtime DELETE events.
- The /admin route 404s on Lovable hosting, use /app/admin instead.
- Supabase `TOKEN_REFRESHED` fires on every tab focus. Auth handlers must compare `user.id` before calling `setUser`/`setSession`, or downstream consumers will unmount/remount with empty data.
- Never call `queryClient.invalidateQueries()` without a filter on `TOKEN_REFRESHED` — it flushes every cache entry and forces skeleton flashes across the app. Reserve full invalidation for `SIGNED_IN`.
- React Query list queries that users see after tab switches should set `placeholderData: keepPreviousData` so transient state resets don't flash skeletons over loaded data.
- queryFn results must be JSON-serializable. No `Date`, `Set`, `Map`, or other non-JSON-safe types — they break the localStorage persister. Use ISO strings or epoch milliseconds for timestamps.

### Known Architecture Issues

5. Service Worker cache/fetch interception was too broad — intercepted all same-host requests, not just storage signed URLs. Caused iOS Safari "Load failed" errors and dropped Authorization headers on cross-origin re-fetches. When adding SW fetch handling, the host check must distinguish Supabase Storage from REST/Auth/Functions (they share a host).

6. Browser tab backgrounding throttles setInterval, starving Supabase's autoRefreshToken timer. JWTs drift past expiry; next request fails RLS with auth.uid() = NULL. Fixed by calling ensureFreshSession() on AuthContext init. Any new client-side data mutation should pre-flight ensureFreshSession() and retry once on auth/RLS failure via forceRefreshSession().

7. Supabase JS v2.100+ emits SIGNED_IN on tab return (internal auto-refresh re-auths), not just on actual login. Responding to SIGNED_IN with queryClient.invalidateQueries() causes a refetch storm that cascades through the component tree, resetting local form state. Always gate SIGNED_IN handlers on actual userId change (prevUserId !== newUserId) — spurious re-emissions should be no-ops.

8. Postgres error code 42501 is NOT uniquely an auth error. Any RLS violation — including policy checks with NULL or wrong foreign keys — surfaces as 42501. Error classifiers must use auth-specific signals (401/403/PGRST301/"jwt expired" message), not just the Postgres code, or data errors get misreported as session expiry.

9. When debugging intermittent Supabase mutation failures, inspect the request payload first. Missing or null foreign keys in the body produce RLS failures that look identical to auth failures. The payload is ground truth; error messages often lie about the cause.

10. React Query's keepPreviousData makes state races invisible in the UI. A component can render with stale props while underlying queries are briefly broken. Useful for UX but dangerous for debugging — always verify prop freshness at mutation time, not just query data freshness.

11. Fixing over-eager cache invalidation (PR #173) exposed a pre-existing bug: mutations with invalidateQueries alone don't update UI immediately when combined with keepPreviousData — the old data stays visible during the background refetch round-trip. Mutations that modify lists must use setQueryData for synchronous cache updates in onSuccess, then follow with invalidateQueries to confirm from server. The pattern applies to delete, update, and any mutation that changes list membership. Reference implementations: `addExpense`, `updateExpense`, and `deleteExpense` in `src/hooks/useExpenses.ts` all follow this pattern — copy from there when adding new list mutations.

### Observability (Sentry)
- Frontend errors are reported via `@sentry/react`, initialized in `src/main.tsx` before React renders.
- DSN read from `VITE_SENTRY_DSN`. If unset, Sentry is a no-op — keeps dev/local out of the project.
- `environment` is `import.meta.env.MODE`; `release` is the build-time `__BUILD_TS__`. `tracesSampleRate: 0.1`. Replay and Profiling are intentionally disabled.
- Capture sites: `ErrorBoundary.componentDidCatch`, `BuilderErrorBoundary` (TripDashboard), `BuilderBoundary` (ItineraryTab), `safeQuery.logSupabaseFailure`, and `App.tsx` `MutationCache.onError`. Each event is tagged with `route`, `display_mode`, `online`, and `user_id` (when available).
- Filtered out: offline failures and 401/403 responses. These are handled by the retry/auth flow and would be noise. Form validation errors don't reach these paths.
- All Sentry calls go through helpers in `src/lib/sentry.ts` — don't call `Sentry.captureException` directly so tagging stays consistent.

### Env files
- **`VITE_`-prefixed vars go in the tracked `.env`.** Vite inlines them into the client bundle at build time, so they are public anyway. Lovable's hosted builds use the checked-out `.env` — Lovable's Secrets UI does **not** accept `VITE_`-prefixed vars (they're build-time, not runtime). This applies to `VITE_SUPABASE_*`, `VITE_VAPID_PUBLIC_KEY`, `VITE_SENTRY_DSN`, etc. Public-by-design values only — never a service-role key or anything that should stay server-side.
- **Non-`VITE_` secrets go in Lovable's Secrets UI** (or the Supabase Dashboard for Edge Function secrets). Anything server-side: service-role keys, third-party API keys consumed by Edge Functions, webhook signing secrets.
- `.env.local` is gitignored (`.env.*` rule with a `!.env.example` exception) — use it for per-developer overrides only. Mirroring `VITE_SENTRY_DSN` in `.env.local` is fine for local consistency, but the tracked `.env` is the source of truth for builds.
- `.env.example` documents which vars exist; copy to `.env.local` if you want a local override, otherwise the tracked `.env` defaults are picked up automatically.

## Common Commands
- npm run dev — start local dev server
- npm run build — production build
- npm run test:e2e — run Playwright E2E suite (auto-starts dev server)
- npm run test:e2e:smoke — only @smoke-tagged tests
- npm run test:e2e:ui — Playwright interactive UI mode
- npm run test:e2e:report — open last HTML report

### E2E test env vars
- Lives in `.env.local` for local runs; mirror as CI secrets later.
- `TEST_BASE_URL` — override target (default: `http://localhost:8080`). Set to `https://junto.pro` for prod smoke runs.
- `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` — only required for tests that need a pre-seeded account; the signup test creates its own users.
- `TEST_SUPABASE_SERVICE_ROLE_KEY` — used only for cleanup (delete orphan test users/trips). Never commit; never bundle into client code. If unset, cleanup helpers no-op with a single warning.
- See `tests/e2e/README.md` for full setup, including how to provision a persistent test user.

## Diagnosis First
Always diagnose before fixing. Read the relevant code, understand the current state, then propose changes. Don't assume the build doc or any external description reflects the current codebase accurately.

## Resolved Bugs

### Expenses page loading skeleton on browser tab switch
Symptom: Returning to the app tab caused ExpensesTab (and similar React Query screens) to flash skeleton loaders over already-loaded data.

Root cause (two interacting issues, both fixes required):
1. `src/contexts/AuthContext.tsx` (primary): On tab focus, Supabase fires `TOKEN_REFRESHED`. The handler unconditionally called `setUser(newSession.user)` and `setSession(newSession)` with new object references even when `user.id` was unchanged, re-rendering the entire tree. It also called `queryClient.invalidateQueries()` with no filter, flushing every cache entry. The combination caused ExpensesTab to unmount/remount mid-refetch.
2. `src/hooks/useExpenses.ts` (secondary): Without `placeholderData: keepPreviousData`, any brief query state reset flashed skeletons.

Fix:
- `AuthContext.tsx`: compare `user.id` before updating references; skip `fetchProfile` for same user on token refresh; remove `queryClient.invalidateQueries()` on `TOKEN_REFRESHED` (keep on `SIGNED_IN` only).
- `useExpenses.ts`: add `placeholderData: keepPreviousData` to all three queries.
- `src/main.tsx`: remove the service worker `controllerchange` reload; debounce `visibilitychange` to at most once per hour.

Key lesson: Never guess at React Query loading-state bugs. Diagnose the full rendering chain from route to component — the cause was in AuthContext, not in the expenses code.

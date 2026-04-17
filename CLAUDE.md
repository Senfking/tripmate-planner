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

## Common Commands
- npm run dev — start local dev server
- npm run build — production build

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

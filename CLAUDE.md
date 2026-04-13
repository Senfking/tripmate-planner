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

## Common Commands
- npm run dev — start local dev server
- npm run build — production build

## Diagnosis First
Always diagnose before fixing. Read the relevant code, understand the current state, then propose changes. Don't assume the build doc or any external description reflects the current codebase accurately.

# TripMate Planner — Claude Code Context

## Project Overview
Group travel planning app. Users create trips, collaborate on decisions (voting/polls), itineraries, expense tracking (multi-currency), bookings, and sharing.

## Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (Radix UI primitives)
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions + Realtime)
- **State:** TanStack React Query for server state, React Hook Form + Zod for forms
- **Routing:** React Router DOM v6
- **Package manager:** Bun (use `bun` not `npm`)

## Deployment & Publishing
- **Hosting:** Lovable Cloud — deploys from `main` branch automatically
- **Code flow:** Claude Code edits → push to feature branch → user merges to `main` via GitHub/Lovable → Lovable deploys
- **Edge Functions:** Deployed via Lovable or Supabase CLI (not via git push alone)
- **Database migrations:** Managed via Lovable or Supabase CLI

Do NOT push directly to `main`. Always use a feature branch.

## Supabase
- **Project ID:** `dwtbqomfleihcvkfoopm`
- **URL:** `https://dwtbqomfleihcvkfoopm.supabase.co`
- **Client:** `src/integrations/supabase/client.ts`
- **Types:** `src/integrations/supabase/types.ts` (auto-generated — do not edit manually)
- **Auth:** Supabase Auth (email/password + OAuth), context in `src/contexts/AuthContext.tsx`
- **Realtime:** `src/hooks/useTripRealtime.ts`

## Edge Functions (supabase/functions/)
- `delete-account` — deletes user + ownership checks
- `export-expenses-csv` — CSV export
- `export-trip-ics` — iCalendar export
- `extract-booking-info` — parses booking links
- `fetch-link-preview` — Open Graph previews
- `get-invite-info` — invite details
- `public-trip-share-view` — public sharing
- `refresh-exchange-rates` — currency rate updates

## Source Structure
```
src/
  pages/          # Route-level components (Login, TripList, Expenses, etc.)
  components/     # Feature components, organized by domain:
    ui/           # shadcn/ui primitives (do not edit directly)
    admin/        # Trip admin (members, delete)
    trip/         # Trip dashboard & overview
    decisions/    # Voting & polls
    itinerary/    # Schedule & attendance
    expenses/     # Expense tracking & settlement
    bookings/     # Attachments & links
    vibe/         # Vibe board / sentiment
  hooks/          # Custom React hooks (data fetching, UI state)
  contexts/       # React contexts (Auth)
  integrations/   # Supabase client & generated types
  lib/            # Utilities (settlement calc, feature flags, error formatting)
```

## Key Conventions
- Path alias: `@/` maps to `src/`
- Colors via CSS custom properties (HSL variables), not hardcoded Tailwind colors
- TypeScript is intentionally loose (`noImplicitAny: false`, `strictNullChecks: false`)
- ESLint warnings for unused vars are disabled
- Components use shadcn/ui patterns — prefer extending existing components over creating new ones

## Testing
- **Unit:** Vitest (`bun test`)
- **E2E:** Playwright (`playwright.config.ts`, `playwright-fixture.ts`)
- No CI/CD pipeline yet (no `.github/` workflows)

## Features & Flags
- Feature flags in `src/lib/features.ts`
- PWA support via `src/service-worker.ts`
- Dark mode via `next-themes` (CSS class strategy)
- Mobile-first with `useMobile` hook and `BottomNav` component

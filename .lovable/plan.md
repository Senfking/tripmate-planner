

## Trip List, Create Trip, and Trip Home

### Overview
Build three new screens: trip list, create trip form, and trip home scaffold. The trips table already exists with RLS and the `auto_add_trip_owner` trigger handles auto-inserting the creator as owner — so no manual `trip_members` insert is needed on create.

Note: The DB schema doesn't have an `emoji` column on `trips`. We'll need a migration to add it.

### Database migration

Add `emoji` column to `trips` table:
```sql
ALTER TABLE public.trips ADD COLUMN emoji text DEFAULT '✈️';
```

### New files

| File | Purpose |
|------|---------|
| `src/pages/TripList.tsx` | `/app/trips` — fetches trips via `trip_members` join, shows cards or empty state, FAB button |
| `src/pages/TripNew.tsx` | `/app/trips/new` — form with name, dates, emoji picker. Inserts into `trips`, redirects to new trip |
| `src/pages/TripHome.tsx` | `/app/trips/:tripId` — header with emoji/name/dates/member count, 5 tabs with "Coming soon" placeholders, back button |

### Modified files

| File | Change |
|------|--------|
| `src/App.tsx` | Add routes: `/app/trips` (TripList), `/app/trips/new` (TripNew), `/app/trips/:tripId` (TripHome). TripNew and TripHome are protected but rendered **without** AppLayout (no bottom nav). |
| `src/integrations/supabase/types.ts` | Auto-regenerated after migration |

### Key implementation details

- **Trip list query**: `supabase.from('trip_members').select('trip_id, trips(*)').eq('user_id', user.id)` — only returns trips the user belongs to
- **Member count**: Separate query or count via `trip_members` for each trip
- **Create trip**: Insert into `trips` only — the `auto_add_trip_owner` trigger handles the `trip_members` row automatically
- **Emoji picker**: Simple grid of ~20 travel emojis (no external library needed)
- **Pull-to-refresh**: Use `react-query`'s `refetch` with a pull-down gesture handler
- **Trip not found**: If the trip query returns no rows (RLS filters it), show a friendly "Trip not found" message
- **TripHome tabs**: Use shadcn `Tabs` component with 5 tabs, each showing a placeholder
- **Date formatting**: Use `date-fns` `format` for display
- **FAB**: Fixed-position circular gradient button at bottom-right

### Route structure (updated)
```
/app/trips          → TripList (inside AppLayout)
/app/trips/new      → TripNew (inside AppLayout)
/app/trips/:tripId  → TripHome (standalone, no bottom nav)
```

### Files changed: 4 total (3 new, 1 modified) + 1 migration


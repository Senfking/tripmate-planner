

## Plan: Add Mine/Others filter toggle to Bookings tab

**File:** `src/components/bookings/BookingsTab.tsx` (only file)

### Changes

1. **New state**: `peopleFilter: "all" | "mine" | "others"`, default `"all"`.

2. **Second filter row** below type pills, above search input — three pills: "All people", "Mine", "Others". Same base style as type pills (`text-xs h-7 px-2.5`).
   - "All people" active: default variant (same as type pills)
   - "Mine" active: teal gradient (`bg-gradient-to-r from-teal-600 to-teal-500 text-white border-transparent`)
   - "Others" active: `border-teal-500 text-teal-600 bg-teal-50`

3. **Filter logic**: Apply `peopleFilter` in both `filtered` and `groupedSections` useMemo hooks — pre-filter by `created_by` before type/search. Grouped view only when `peopleFilter === "all"` and no search.

4. **Empty states** (replace generic "No results" when people filter is active):
   - Others + zero: "No bookings from other members yet"
   - Mine + zero: "You haven't added any bookings yet — upload a confirmation or share a link"




# AI Trip Results — Layla-Inspired Redesign

## Layout (top to bottom, centered ~700px column)

1. **Header**: Back button + trip title + Share button
2. **Stat pills**: "14 days · 1 city · 44 experiences · 1 hotel"
3. **Trip summary**: 2-3 sentence AI description
4. **Destination section**: Name, date range, intro text with timeline icon
5. **Accommodation card**: Google Places photo, name, stars, price, booking link
6. **Cost summary bar**: Expandable — total + per-day, category breakdown on expand
7. **Day cards** (collapsed by default): Thumbnail + "Day 1 · May 9 · 3 Experiences" + theme + chevron. On expand: full activity list + 200px embedded mini-map for that day's pins. **On expand, `scrollIntoView({ behavior: 'smooth', block: 'start' })` on the day card ref.**
8. **Sticky bottom bar**: "Add all to itinerary" + Adjust + Regenerate

## Files Changed

### `src/components/trip-results/TripResultsView.tsx` — Major rewrite
- Remove fullscreen `ResultsMap` background and floating side panel
- Single centered column: `max-w-[700px] mx-auto`, glassmorphic dark bg
- Render: header → stat pills → summary → per-destination (DestinationSection + AccommodationCard + cost bar + DaySection cards) → bottom bar
- Move Share/Adjust/Regenerate to bottom bar
- Remove IntersectionObserver / scroll-to-map-sync logic

### `src/components/trip-results/DaySection.tsx` — Redesign
- **Collapsed**: Horizontal card with 80×80 thumbnail (first activity's Google Places photo via `useGooglePlaceDetails`), teal "Day N" pill, experience count + date, theme subtitle, chevron
- **Expanded**: Full activity list + 200px `DayMiniMap`
- Add `useRef` + `useEffect` on expand to call `ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' })`

### `src/components/trip-results/DayMiniMap.tsx` — New
- Wrapper around `ResultsMap` at 200px height, receives only that day's activities

### `src/components/trip-results/AccommodationCard.tsx` — Enhance
- Add Google Places photo lookup via `useGooglePlaceDetails`
- Photo thumbnail on left, name/stars/price/booking on right

### `src/components/trip-results/DestinationSection.tsx` — Minor
- Add timeline-style location pin icon, destination name, date range

### Unchanged
- `ActivityCard.tsx`, `ResultsMap.tsx`, `useResultsState.ts`, `AlternativesSheet.tsx`, `TransportCard.tsx`, `TravelTimeConnector.tsx`


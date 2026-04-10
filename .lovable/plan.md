

# AI Trip Builder Results View

## Overview
Build a magazine-style, map-centric itinerary viewer that displays after the AI generates results. Full-screen overlay with Leaflet map, collapsible day sections, activity cards with add-to-itinerary support, and regeneration options.

## Dependencies to Install
- `leaflet` + `@types/leaflet` + `react-leaflet` — for the interactive map

## Files to Create (in `src/components/trip-results/`)

1. **`TripResultsView.tsx`** — Main container. Mobile: map (40vh) + scroll content. Desktop: split layout (55% content / 45% sticky map). Glassmorphic top bar with trip title, info pills, regenerate button. Glassmorphic bottom bar with summary + "Add all to itinerary" button. Manages scroll-spy to sync map with content. Receives AI response data + tripId + questionnaire answers (for regeneration).

2. **`ResultsMap.tsx`** — Leaflet map component. CartoDB dark_all tiles. Shows numbered category-colored pins. Overview mode (all destinations) vs day mode (zoomed to day's activities). Dashed polylines between pins. Pin click scrolls to card. Uses `react-leaflet` MapContainer, TileLayer, Marker, Polyline.

3. **`DestinationSection.tsx`** — Section header per destination: name, date range, AI intro text, photo placeholder carousel (horizontal scroll gradient cards).

4. **`DaySection.tsx`** — Collapsible day group. Header: "Day N · X Experiences · Date · Weather placeholder". Theme subtitle. First day of each destination expanded by default. Staggered card fade-in on expand.

5. **`ActivityCard.tsx`** — Individual activity card. Numbered pin, category label (11px uppercase mono), title, rating placeholder, duration, cost badge. Photo placeholder. Expandable detail: description, insider tip callout, dietary note, Google Maps link, booking link. "Add to itinerary" toggle. "Change" and "Remove" buttons.

6. **`TravelTimeConnector.tsx`** — Small inline element between activities showing walk/drive time estimate.

7. **`TransportCard.tsx`** — Between-destination transport card with origin/destination, mode icon, duration, dashed connector styling.

8. **`AccommodationCard.tsx`** — Hotel suggestion card with teal tint, name, star rating, price, booking link, change button.

9. **`AlternativesSheet.tsx`** — Bottom sheet shown when user taps "Change" on an activity. Shows 2-3 AI-suggested alternatives. User picks one to swap.

10. **`useResultsState.ts`** — Hook managing: added activity IDs (Set), scroll-spy active day index, map view mode (overview vs day), regeneration state. Also handles "Add to itinerary" via `useItinerary` hook's `addItem` / `batchAddItems`.

11. **`categoryColors.ts`** — Shared category color map and icon map used by both map pins and activity cards.

## Files to Modify

1. **`src/components/trip-builder/TripBuilderFlow.tsx`** — Instead of calling `onSuccess` + `onClose` after generation, show `TripResultsView` with the AI response data. Add a `results` state. When generating succeeds, set `results = data` and render `TripResultsView`. When user closes results or adds all, call `onClose`.

## Technical Approach

**Map**: Leaflet with CartoDB dark_all tiles (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`). Custom DivIcon markers with numbered circles colored by category. Polylines with dashed stroke connecting activities chronologically.

**Scroll Sync**: IntersectionObserver on day section headers. When a day section enters viewport, update map to zoom to that day's activity bounds. Expose refs from DaySection for observation.

**Category Colors** (shared constant):
```
food: #F97316, culture: #A855F7, nature: #22C55E, nightlife: #EC4899,
adventure: #EF4444, relaxation: #3B82F6, transport: #6B7280, accommodation: #0D9488
```

**Add to Itinerary**: Uses existing `useItinerary(tripId)` hook. Maps AI activity to itinerary_items row: `{ day_date, title, start_time, end_time (start + duration), location_text, notes (description + tips + cost), status: "planned" }`.

**Regeneration**: "Regenerate trip" re-calls edge function with same payload. "Change activity" calls edge function with `notes: "suggest 3 alternatives for [name] at [time] in [location]"` — response parsed for alternatives shown in bottom sheet.

**Typography**: IBM Plex Sans/Mono loaded via Google Fonts link in `index.html`. Category labels use `font-family: 'IBM Plex Mono'`, body uses `'IBM Plex Sans'` within results view only (scoped via CSS class).

**Glassmorphic Bars**: `bg-[rgba(15,17,21,0.8)] backdrop-blur-xl` for top and bottom sticky bars.

**Responsive**: Mobile stacks map (40vh fixed) + scrollable content. Desktop uses `flex` with `w-[55%]` content + `w-[45%] sticky top-0 h-screen` map.

**Animations**: Staggered `animate-fade-in` with `animation-delay` on cards when day expands. Map pin bounce via CSS keyframe. IntersectionObserver for section fade-in.

## Data Flow
```
TripBuilderFlow
  ├── (questionnaire steps)
  ├── GeneratingScreen (while loading)
  └── TripResultsView (after AI response)
        ├── ResultsMap (Leaflet)
        ├── DestinationSection[]
        │   ├── AccommodationCard?
        │   ├── DaySection[] (collapsible)
        │   │   ├── ActivityCard[]
        │   │   └── TravelTimeConnector[]
        │   └── TransportCard? (between destinations)
        └── AlternativesSheet (on-demand)
```


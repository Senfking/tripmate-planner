## Problems

**1. Timeline drifts during initial scroll (desktop)**
`ResultsTimeline` is `position: fixed` with `top` computed from `heroRect.bottom + 12` on every scroll. At rest the hero bottom sits ~42vh down the viewport, so the timeline starts pushed far down. As you scroll, hero's `bottom` decreases, so `top` decreases — the timeline visibly slides upward for the first ~300px of scroll before settling at the `minTop = 96` floor. It looks like the timeline is moving with the scroll.

**2. Full-page screenshot extensions capture only the first viewport**
`TripResultsView` portals into `document.body` as a `fixed inset-0` container, and scrolling happens on an inner `overflow-y-auto` element (`[data-results-scroll-root]`), not on the document. Chrome screenshot extensions (GoFullPage, Fireshot, etc.) scroll `window` / `document.documentElement` and stitch viewports — since the document itself isn't scrollable, they capture the visible viewport once and stop.

## Fix

### 1. Anchor the timeline immediately

In `src/components/trip-results/ResultsTimeline.tsx`:

- Remove the dynamic `topOffset` state and the scroll/resize listener that recomputes it from the hero's bounding rect.
- Set the timeline's `top` to a fixed value (`96px`) from the start. The "appear under the hero" behavior isn't needed — desktop users see the timeline as a persistent left-rail nav from the moment the page loads, anchored to the same spot regardless of scroll. This matches how the rail behaves once you've scrolled past the hero anyway.
- Drop the now-unused `data-results-hero` lookup in this file (the attribute can stay on the hero in `TripResultsView` — other code may reference it; leave untouched).

The class strings already use `transition-[top]` — that can also be removed since `top` is static now.

### 2. Make the results view document-scrollable

The portal + inner-scroll architecture is intentional (overlay-style results view that fully replaces the trip page), but it breaks screenshot tools and also prevents browser features like Find-in-page scrolling and middle-click autoscroll from working naturally.

In `src/components/trip-results/TripResultsView.tsx`:

- Change the outer portal container from `fixed inset-0 ... flex` to a non-fixed full-height layout that participates in document flow: `min-h-screen w-full ... flex`. It still portals to `document.body` so it overlays sibling app chrome via stacking, but scroll lives on `<html>`/`<body>` instead of the inner div.
- Change the inner itinerary column from `overflow-y-auto flex-1 h-full` to just `flex-1 min-w-0` (no internal scroll, no fixed height). Keep the `data-results-scroll-root` attribute on the same element but have callers (timeline scroll-into-view, `scrollToSection`) detect when the element isn't itself scrollable and fall back to `document.documentElement` / `window.scrollTo`.
- Update `getScrollRoot()` in both `ResultsTimeline.tsx` and the local `scrollToSection` helper in `TripResultsView.tsx` to return `document.documentElement` whenever the marked element's `scrollHeight <= clientHeight` (i.e. it isn't actually the scroller). This keeps the existing API and the map-side-panel layout working — when the map opens and re-introduces a constrained inner scroller, the same code path still finds it.
- The map slide panel (`MapSlidePanel`) currently coexists with the inner scroll in a flex row. When the itinerary column no longer has its own scroll, opening the map needs to either (a) re-enable inner scroll on the itinerary column while the map is open, or (b) keep the map in a fixed/sticky pane on the right while the document scrolls behind. Option (a) is the smaller change: when `mapState !== "closed"`, add back `overflow-y-auto h-screen` on the itinerary column and lock body scroll; when `mapState === "closed"`, document scroll is the source of truth. This preserves the existing split-view UX without rewriting `MapSlidePanel`.

### Verification

After changes, on desktop (≥1024px):
- Timeline left rail is visible and pinned at `top: 96px` from the moment the page renders. Scrolling the page does not move the rail.
- Active dot still updates as sections scroll past the header threshold (the active-section logic already supports `document.documentElement` as the scroll root).
- A Chrome full-page screenshot extension (e.g. GoFullPage) successfully captures the entire trip results view top to bottom.
- Opening the map panel still produces the existing split layout with the map on the right and a scrollable itinerary on the left.

### Files

- `src/components/trip-results/ResultsTimeline.tsx` — remove dynamic `topOffset`; pin to `top: 96px`; update `getScrollRoot()` to fall back to `document.documentElement` when the marked node isn't scrollable.
- `src/components/trip-results/TripResultsView.tsx` — change outer container to `min-h-screen` (non-fixed); remove always-on inner `overflow-y-auto`; conditionally re-enable inner scroll only when map panel is open; update local `scrollToSection` to use the same scroll-root fallback.

No backend, hook, or SSE changes. No changes to `DaySection`, `useStreamingTripGeneration`, or `StandaloneTripBuilder`.

## Two changes to the results view

### 1. Timeline clicks auto-expand the target section

Today, clicking a Day or Packing dot on the left timeline scrolls the page, but the target section stays collapsed — you land on a closed card and have to click again. The fix uses a lightweight DOM event so the timeline doesn't need to know about each section's state.

**`src/components/trip-results/ResultsTimeline.tsx`** — in the `scrollTo(id)` callback, before the scroll math runs, dispatch a window-level `CustomEvent("results:expand", { detail: { id } })`. No other timeline changes.

**`src/components/trip-results/DaySection.tsx`** — add a `useEffect` that listens for `results:expand` on `window`. If `e.detail.id === \`section-day-${day.day_number}\`` and the day isn't open, set `open` to `true`. The existing `useEffect` on `[open]` already scrolls into view, so the timeline's own scroll + the day's auto-scroll both target the same anchor — that's fine, the second smooth-scroll just settles to the same spot.

**`src/components/trip-results/TripResultsView.tsx`** — wrap the packing card the same way: add a `useEffect` keyed on `packingOpen` that listens for `results:expand` and opens the panel when `id === "section-packing"`.

The Entry card (`section-entry`) is already always-expanded inline, so it doesn't need the listener.

### 2. Make the Packing card a proper visual moment

Right now packing is a plain dropdown of bullet-pointed strings. Replace it with a card-grid that turns each string into a chip with an inferred category icon — matches the visual weight of the day cards and Visa & entry block above it.

**Categorization** — packing items come in as `string[]` with no metadata. Add a small `categorizePackingItem(text: string)` helper that lowercases the string and matches keyword groups, returning `{ icon, accent }`:

| Category | Keywords (any match) | Icon (lucide) | Accent |
|---|---|---|---|
| Clothing | shirt, pants, shorts, jacket, dress, sock, underwear, swimwear, swimsuit | `Shirt` | warm sand |
| Footwear | shoes, sneakers, boots, sandals, footwear | `Footprints` | clay |
| Weather | umbrella, rain, poncho, raincoat | `CloudRain` | ocean |
| Sun protection | sunscreen, spf, hat, sunglasses, sun | `Sun` | amber |
| Tech | charger, adapter, power bank, cable, phone, camera, headphone | `Plug` | slate |
| Documents | passport, visa, ticket, id, document, insurance | `FileCheck` | emerald |
| Toiletries | toothbrush, soap, shampoo, deodorant, toiletr, medication, medicine, first aid | `Sparkles` | blush |
| Bag | backpack, daypack, bag, tote | `Backpack` | terracotta |
| Default | (no match) | `Package` | muted primary |

All accents reference existing semantic tokens (`primary`, `accent`, `muted`) — no new colors. Icon stroke `1.75`, size `h-4 w-4`.

**Layout** — replace the current `<button>` + `<ul>` with:

- A header row: `Package` icon + "Packing essentials" title + `{count} items` chip on the right + chevron. Same hover/expand behavior, same `id="section-packing"`.
- When expanded: a `grid grid-cols-1 sm:grid-cols-2` of pill-shaped cards. Each card: 40×40 rounded-xl icon tile (tinted background using the accent), then the item text on two lines max with `text-foreground` (not muted), then a subtle category caption underneath in `text-[11px] text-muted-foreground uppercase tracking-wide`.
- Cards animate in with a 30ms stagger using inline `animationDelay` + the existing `animate-fade-in` utility, so opening the panel feels intentional.
- Container card: `rounded-2xl border border-border bg-card p-4` with a subtle gradient-tinted top edge (`bg-gradient-to-b from-primary/5 to-transparent`) — matches the visual treatment of the Visa & entry block.

**Files**

- `src/components/trip-results/TripResultsView.tsx` — replace the packing block (current lines ~806-829) with the new component invocation; add the `results:expand` listener for packing.
- `src/components/trip-results/PackingCard.tsx` — new file. Self-contained: takes `items: string[]`, `open`, `onToggle`. Includes the `categorizePackingItem` helper inline (small, only used here).
- `src/components/trip-results/ResultsTimeline.tsx` — dispatch the expand event in `scrollTo`.
- `src/components/trip-results/DaySection.tsx` — listen for the expand event, set `open` when matched.

No backend, hook, type, or routing changes. Mobile and desktop render the same component; the grid collapses to a single column under `sm`.

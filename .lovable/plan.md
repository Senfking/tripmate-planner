

## Trip Dashboard: Photo Background Cards Redesign

### Files to change

1. **`src/components/trip/SectionCard.tsx`** — Full rewrite: photo backgrounds, dark overlay, white text, Lucide icons
2. **`src/components/trip/TripDashboard.tsx`** — Pass Lucide icon components instead of emoji strings; update props
3. **`src/components/trip/TripOverviewHero.tsx`** — Update to match new hero spec (white 95% bg, refined styling)
4. **`src/pages/TripHome.tsx`** — Change page background to `#F1F5F9`, adjust spacing

No new files. No database changes. No routing changes.

---

### SectionCard.tsx — Complete rewrite

Replace the gradient card with a photo-background card:

- **Props change**: `icon` becomes a Lucide icon component (`LucideIcon` type), add `imageUrl: string`
- **Structure**: `<button>` wrapping an `<img>` with `object-fit: cover` + a gradient overlay div + content on top
- **Overlay**: `linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.1) 100%)`
- **Card**: 110px height, 16px border-radius, overflow hidden, shadow `0 4px 20px rgba(0,0,0,0.12)`, no border
- **Text**: White title (17px/600), white/75% summary (13px), 4px gap
- **Icon**: Lucide icon at 18px, white/70%, left of title
- **Arrow**: `ArrowRight` white/50%, right side, vertically centered
- **Badge**: White pill with dark text, 11px, "{n} pending"
- **Press**: `active:scale-[0.98]` transition
- **Phase 2 comment** at top of file

Remove all gradient style maps (`CARD_STYLES`), emoji icon rendering, and colored badge logic.

### TripDashboard.tsx — Icon & image props

Pass Lucide icons and Unsplash URLs to each `SectionCard`:

| Card | Icon | Image URL |
|------|------|-----------|
| Decisions | `Compass` | `photo-1488646953014-85cb44e25828?w=800&q=80` |
| Itinerary | `CalendarDays` | `photo-1530521954074-e64f6810b32d?w=800&q=80` |
| Bookings | `Plane` | `photo-1436491865332-7a61a109cc05?w=800&q=80` |
| Expenses | `Wallet` | `photo-1580048915913-4f8f5cb481c4?w=800&q=80` |
| Admin | `Users` | `photo-1529156069898-49953e39b3ac?w=800&q=80` |

Remove emoji `icon` strings. Gap between cards stays at `gap-2.5` (10px).

### TripOverviewHero.tsx — Refined hero

- `background: rgba(255,255,255,0.95)`
- `border: 1px solid rgba(255,255,255,0.8)`
- `backdrop-filter: blur(12px)`
- `box-shadow: 0 2px 12px rgba(13,148,136,0.08)`
- Date text: 14px, `#0F172A`, font-weight 500
- Status: 13px, `#64748B`
- Avatar size: 36px (h-9 w-9), 2px white border

### TripHome.tsx — Background

- Change page background from the radial gradient to flat `#F1F5F9`
- Hero-to-cards spacing: 14px (adjust `space-y` or use explicit margin)
- Keep header unchanged


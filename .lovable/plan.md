

## TripCrew PWA — Implementation Plan

### Overview
A mobile-first Progressive Web App for group trip planning with bottom tab navigation (mobile) and sidebar navigation (desktop). Clean, travel-inspired design with warm colors.

### Design System
- **Theme color**: `#E07A5F` (warm terracotta/coral — travel-inspired)
- **Background**: white
- **Accent colors**: Terracotta primary, sandy neutrals, ocean blue secondary
- **Typography**: Clean, friendly — using the existing sans-serif stack
- **Border radius**: Rounded, soft feel

### ⚠️ PWA Note
PWA features (offline support, install prompt) will **only work in the published/deployed version**, not in the Lovable editor preview. Service worker registration will be guarded against iframe/preview contexts to avoid caching issues during development.

### Files to Create
1. **`public/manifest.json`** — Web app manifest with name, colors, icons
2. **`public/icon-192.svg`** — Placeholder SVG icon (192x192)
3. **`public/icon-512.svg`** — Placeholder SVG icon (512x512)
4. **`src/service-worker.ts`** — Service worker for app shell caching
5. **`src/components/BottomNav.tsx`** — Mobile bottom navigation (5 tabs)
6. **`src/components/AppSidebar.tsx`** — Desktop sidebar navigation
7. **`src/components/AppLayout.tsx`** — Responsive layout shell (header + nav)
8. **`src/components/InstallPrompt.tsx`** — "Add to Home Screen" banner
9. **`src/pages/Trips.tsx`** — Placeholder tab screen
10. **`src/pages/Decisions.tsx`** — Placeholder tab screen
11. **`src/pages/Itinerary.tsx`** — Placeholder tab screen
12. **`src/pages/Expenses.tsx`** — Placeholder tab screen
13. **`src/pages/More.tsx`** — Placeholder tab screen

### Files to Modify
1. **`index.html`** — Add manifest link, theme-color meta, viewport meta, SW registration script
2. **`src/App.tsx`** — Add routes for all 5 tabs, wrap in layout
3. **`src/index.css`** — Update design tokens to warm travel palette
4. **`src/main.tsx`** — Add SW registration guard for preview/iframe
5. **`src/pages/Index.tsx`** — Redirect to /trips

### Navigation & Layout
- **Mobile**: Fixed bottom nav bar with 5 icon+label tabs (Trips, Decisions, Itinerary, Expenses, More). Top header with "TripCrew" branding.
- **Desktop (≥768px)**: Side navigation replaces bottom bar. Same 5 items with icons and labels.
- **Page transitions**: CSS animations for smooth tab switching (fade/slide)

### Screens
Each tab shows a centered placeholder with an icon and the tab name — styled consistently with the travel theme. No real content yet.


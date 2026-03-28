

## Rename TripCrew → Junto

### Files to change (7 files)

1. **`index.html`** — Title, meta description, author, apple-mobile-web-app-title, og:title, og:description
2. **`public/manifest.json`** — `name`, `short_name`, `description`
3. **`src/service-worker.ts`** — Cache name `tripcrew-v1` → `junto-v1`
4. **`src/components/AppLayout.tsx`** — Header logo text
5. **`src/components/AppSidebar.tsx`** — Sidebar logo text
6. **`src/components/InstallPrompt.tsx`** — "Install TripCrew" → "Install Junto"
7. **`public/icon-512.svg`** — SVG text element

### Changes
Pure string replacements only. No layout, logic, or styling changes.

- All instances of `TripCrew` → `Junto`
- `tripcrew` (lowercase in cache name) → `junto`
- Descriptions updated to remove "crew" references (e.g. "Plan trips together with your crew" → "Plan trips together")


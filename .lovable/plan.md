

# Polish Junto for Native Mobile App Feel

## Files to Change

1. **src/components/InstallPrompt.tsx** — persist dismissed state + add iOS Safari tip
2. **src/index.css** — button active scale, safe area insets, input/textarea/select font-size fix, background color fix, slide-in keyframe
3. **src/components/AppLayout.tsx** — offline/online detection banner
4. **src/components/BottomNav.tsx** — active tab scale animation + scroll-to-top on active tab tap
5. **src/pages/TripHome.tsx** — slide-in animation class + safe area padding
6. **src/pages/TripSection.tsx** — slide-in animation class + safe area padding
7. **src/pages/TripList.tsx** — skeleton loading state
8. **src/pages/Decisions.tsx** — skeleton loading state
9. **src/pages/Itinerary.tsx** — skeleton loading state
10. **src/pages/Expenses.tsx** — skeleton loading state

---

## 1. Install Experience

**InstallPrompt.tsx:**
- Verify `localStorage` persistence of dismissed state (key `junto_install_dismissed`)
- Add iOS Safari detection + bottom banner (above nav, `bottom-24`) with Share icon, "Tap Share → Add to Home Screen", X dismiss
- Store iOS dismissal in `localStorage` key `junto_ios_tip_dismissed`

## 2. Navigation Feel

**TripHome.tsx & TripSection.tsx:** Add `animate-slide-in` class to root wrapper.

**BottomNav.tsx:**
- `active:scale-90 transition-transform duration-150` on tab icon container
- If tapping already-active route: `window.scrollTo({ top: 0, behavior: "smooth" })`, prevent navigation

## 3. Offline Banner

**AppLayout.tsx:** `online`/`offline` event listeners → slim dark slate banner "You're offline — showing cached content". Auto-hides 2s after reconnecting.

## 4. Global CSS (index.css)

**Button active feedback:**
```css
button:active, [role="button"]:active {
  transform: scale(0.97);
  transition: transform 100ms ease;
}
```

**Input font-size — prevent iOS zoom (mobile only):**
```css
@media (max-width: 767px) {
  input, textarea, select {
    font-size: 16px !important;
  }
}
```

**Background color fix — eliminate gap behind iOS home indicator:**
```css
html, body, #root {
  background-color: #F1F5F9;
  min-height: 100%;
}
```

**Slide-in animation:**
```css
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
.animate-slide-in { animation: slideInRight 200ms ease-out; }
```

## 5. Safe Area Insets

**TripHome.tsx & TripSection.tsx:** Add `padding-top: env(safe-area-inset-top, 0px)` to sticky headers.

## 6. Skeleton Loading States

All skeletons use `animate-pulse` with `bg-[rgba(13,148,136,0.06)]`.

- **TripList.tsx:** 1 card at 220px + 1 at 140px, rounded-[20px]/[16px]
- **Decisions.tsx:** 3 cards, h-[72px], rounded-[14px]
- **Itinerary.tsx:** 4 rows, h-[56px], rounded-[14px]
- **Expenses.tsx:** 1 hero h-[100px] + 2 cards h-[72px], rounded-[14px]


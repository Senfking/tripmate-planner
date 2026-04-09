

## Plan: Public Landing Page at "/"

### Summary
Create a new dark-themed landing page at `/` for unauthenticated users. Authenticated users redirect to `/app/trips` as before. The `/ref` page stays untouched.

### Files to change
1. **`src/pages/Landing.tsx`** — NEW. The full landing page component with all 5 sections + footer.
2. **`src/App.tsx`** — Update routing: `/` renders `<Landing />` for unauth users (redirect to `/app/trips` for auth'd), add lazy import.
3. **`src/index.css`** — Add a small `fade-in-up` animation for scroll-triggered reveals (reuse existing keyframes where possible).

### Routing logic
- `/` route renders a wrapper component that checks `useAuth()`: if `user` exists, `<Navigate to="/app/trips" />`; otherwise, renders `<Landing />`.
- The `/ref` page is completely untouched.
- All other routes remain as-is.

### Landing page structure
- **Dark theme forced** via `className="dark"` wrapper on the page (so it's always dark regardless of system preference).
- Uses the existing dark CSS variables (`--background: 176 30% 8%`, teal gradient, etc.).
- Each section uses an `IntersectionObserver`-based fade-in-on-scroll hook for subtle entrance animations.
- No external images or stock photos — gradient backgrounds, glassmorphic cards, icon-based visuals using Lucide icons.

### Sections
1. **Hero** — Full viewport height. Large headline, subtitle, two CTAs. "Start Planning" links to `/ref` (signup flow). "See how it works" smooth-scrolls to Section 2.
2. **The Pain** — 3 cards with quotation-style frustrations, followed by the resolution line.
3. **How It Works** — 3 numbered steps, horizontal on `md:` breakpoint, stacked on mobile.
4. **Feature Highlights** — 4 cards with Lucide icons (Wallet, Vote, CalendarDays, Smartphone).
5. **Social Proof** — 3 placeholder testimonial cards with avatar circles.
6. **Final CTA** — Centered headline + big gradient button → `/ref`.
7. **Footer** — Privacy, Terms, email link, "Made with ☀️ in Dubai".

### Design details
- Cards: `bg-white/5 border border-white/10 backdrop-blur` glassmorphic style.
- Gradient accents using `--gradient-primary` (teal→sky).
- Inter font, consistent with app.
- Mobile-first responsive, max-width container `max-w-6xl`.
- Scroll animations: elements start `opacity-0 translate-y-6` and animate to `opacity-1 translate-y-0` when intersecting viewport.


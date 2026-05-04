I’m sorry — the recent iterations over-corrected the pill and made it look worse. I inspected the current `Hero.tsx` and previewed the landing page at the mobile viewport. The current issue is that the input pill is too short/narrow compared with your reference, the button is too small, and the textarea sizing/alignment hacks are fighting the pill shape.

Plan:

1. Restore the pill to a reference-like mobile shape
   - Use a taller integrated pill on mobile, roughly matching the uploaded reference: large rounded white capsule, generous horizontal padding, and an oversized circular teal action button tucked inside the right edge.
   - Keep desktop responsive behavior separate so this mobile fix doesn’t break larger layouts.

2. Replace the textarea sizing hacks with predictable layout
   - Remove the problematic `[align-content:center]` textarea centering approach.
   - Use a fixed two-line textarea height on mobile with normal line-height and padding so the placeholder wraps naturally without clipping.
   - Make the placeholder visually closer to the reference: larger, softer gray text, two lines, left-aligned.

3. Make the CTA button match the reference better
   - Increase the mobile button from the current small 44px icon button to a larger round button.
   - Keep the sparkles icon centered and white.
   - Use the existing primary teal color and a soft shadow, like the reference.

4. Fix the route used for preview checks
   - The `/index` route is a 404 in this app; the landing page is `/`.
   - I’ll verify the final result on `/` at the closest available mobile viewport.

Technical changes:

- Edit only `src/components/hero/Hero.tsx`.
- Adjust the shared pill wrapper, textarea classes, and button classes with responsive Tailwind values.
- Preserve existing submit behavior, busy state, accessibility labels, and app/public variants.
- Do not embed the uploaded screenshot; use it only as visual reference.

Target mobile layout:

```text
[  Tell Junto AI about your trip —        ( sparkles ) ]
[  destination, dates, who's coming                    ]
```

The pill should feel like one clean capsule wrapped around the big circular action button, not like a compressed form control.
Three fixes scoped to the trip builder + a global typography tightening.

## 1. Shrink input/textarea fonts globally

The previous fix added a `sm` variant but left the default at 16px (`text-base` on mobile). Most forms still use the default, so the issue persists across the app (trip builder, expenses, bookings, comments, proposals, etc.).

Change the **default** variant in `src/components/ui/textarea.tsx` and `src/components/ui/input.tsx` from `text-base md:text-sm` to `text-[14px]` throughout. Keep the `sm` variant at 12–13px for very dense modals.

Trade-off: iOS Safari only auto-zooms when font-size is `<16px`, so dropping to 14px will trigger zoom-on-focus on iOS. Given the user has twice asked us to fix oversized inputs, accept this trade-off globally — it's the standard behaviour in most modern apps (Linear, Notion, Airbnb mobile web all use 14px inputs and accept the zoom).

If we want to avoid the zoom, the alternative is keeping 16px and instead scaling the surrounding UI up — but that contradicts the established 11–13px label/utility scale.

Recommend: go with 14px default, accept iOS zoom. One coherent type scale.

## 2. Fix unreachable bottom of trip builder

`PremiumTripInput.tsx` scroll container uses `pb-32` (128px), but the fixed bottom bar contains:
- "Generate my trip" button (48px)
- Optional helper text
- "Start with a blank trip" link
- Top/bottom padding + safe-area inset

Total ≈ 150–180px on iPhone. The "Or describe your trip in your own words" disclosure gets clipped behind the bar.

Fix: bump the scroll container to `pb-48` (192px) and also reserve space for the safe-area inset by using `pb-[calc(env(safe-area-inset-bottom,0px)+12rem)]`.

## 3. Clarify "Tell us more" labelling

Currently:
- Disclosure label: "Tell us more (optional)"
- Inside, italic helper: "This is the question that makes the difference"
- Textarea (then) label below it: "What DON'T you want? Any deal-breakers?"

The label sits *after* the textarea, which is backwards, and the disclosure trigger is vague.

Fix:
- Rename trigger from "Tell us more (optional)" → **"What DON'T you want? (optional)"**
- Remove the redundant `<label>` that currently sits below the textarea
- Keep the italic helper "This is the question that makes the difference" above the textarea
- Apply the same clarity pass to the second disclosure: "Or describe your trip in your own words" stays — it's already clear

## Files

- `src/components/ui/textarea.tsx` — default variant → 14px
- `src/components/ui/input.tsx` — default variant → 14px
- `src/components/trip-builder/PremiumTripInput.tsx` — `pb-32` → `pb-48`, rename "Tell us more" disclosure, remove the misplaced label

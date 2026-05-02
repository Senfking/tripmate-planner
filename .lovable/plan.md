## Problem

On the trip detail page, the hero photo no longer fills the visible hero space. The white content card below correctly has rounded top corners and an elevated shadow (good), but the photo above it looks short / gapped. The image source itself is fine — the container is just too small relative to the screen and the title overlay overlaps too aggressively, so the photo reads as cropped/letterboxed.

### Root cause

In `src/pages/TripHome.tsx` the hero was changed to a fixed `height: 270` (pixels) while the overlapping title block uses `-mt-24` (96px) and the content card uses `-mt-4`. On taller phones, 270px ≈ 30% of viewport — much smaller than the previous `42vh / minHeight 280`. Combined with the heavy bottom dark gradient (`h-3/4`), only the top ~half of the container shows actual photo, so the user perceives "the image doesn't fill the entire space".

## Fix

Edit `src/pages/TripHome.tsx` only.

1. **Restore a viewport-relative hero height** so the photo gets meaningful real estate on all devices, while keeping the new boxed (non-rounded-bottom) style and the rounded/elevated white card below:
   - Change the hero container from `style={{ height: 270 }}` to `style={{ height: "44vh", minHeight: 300, maxHeight: 420 }}`.
   - `maxHeight` prevents the hero from dominating tablets/desktops.

2. **Tone down the bottom gradient** so more of the photo is visible:
   - Reduce the bottom gradient height from `h-3/4` to `h-1/2`.
   - Soften the stops to `rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.2) 65%, transparent 100%` (still legible for the title, less heavy).

3. **Keep title overlap consistent** with the taller hero:
   - Leave the title block at `-mt-24` and the content card at `-mt-4` — these still produce the correct overlap with a 300–420px hero.

No other files are touched. The white content card's rounded top + shadow stay exactly as they are.

## Acceptance check

After the edit, on a 390×844 viewport the trip detail hero should:
- Show the cover photo filling the full width and roughly the top 44% of the viewport.
- Have the title sitting on the lower portion of the photo with a softer dark gradient (photo still visible behind it).
- Have the rounded white card overlapping the bottom of the hero by a few pixels with the existing shadow — unchanged.
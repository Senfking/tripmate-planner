---
name: Mobile bottom drawer preference
description: On mobile, always use Drawer (bottom sheet) instead of Dialog (centered popup) for modals
type: preference
---
On mobile viewports, use `<Drawer>` (vaul) sliding up from the bottom instead of `<Dialog>` (centered popup). Use `useIsMobile()` to switch between the two. **Why:** User explicitly corrected this twice — dialogs feel wrong on mobile.
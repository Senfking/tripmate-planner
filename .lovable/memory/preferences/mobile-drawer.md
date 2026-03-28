---
name: Mobile bottom drawer preference
description: On mobile, ALWAYS use Drawer (bottom sheet) instead of Dialog/AlertDialog for ALL modals, confirmations, and popups
type: preference
---
On mobile viewports, use `<Drawer>` (vaul) sliding up from the bottom instead of `<Dialog>` or `<AlertDialog>` (centered popup). Use `useIsMobile()` to switch between the two.

**Rules:**
- NEVER use Dialog, AlertDialog, or any centered popup on mobile — always Drawer
- On desktop, use Dialog/AlertDialog as normal
- This applies to ALL modal-like UI: forms, confirmations, pickers, alerts, everything
- Pattern: `const isMobile = useIsMobile(); if (isMobile) return <Drawer>; return <Dialog>;`

**Why:** User explicitly corrected this multiple times — centered dialogs feel wrong on mobile.

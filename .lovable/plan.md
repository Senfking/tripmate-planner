

# Fix: Ensure All Modals Use Bottom Drawer on Mobile

## Analysis

After auditing every component in the codebase, all current modal-like components already use the `useIsMobile()` + Drawer/Dialog pattern correctly:

- **ProposalForm.tsx** — Drawer on mobile, Dialog on desktop
- **AddToRouteDrawer.tsx** — Drawer on mobile, Dialog on desktop
- **TripRoute.tsx** (ConfirmWrapper for lock/unlock/remove) — Drawer on mobile, Dialog on desktop
- **DecisionsFlow.tsx** (PreferencesContent) — Drawer on mobile, Dialog on desktop
- **InviteModal.tsx** — Drawer on mobile, Dialog on desktop

The screenshot shows the **old "Confirm plan" dialog** which was removed in the multi-stop route migration. The current code no longer has that component. The preview may be showing a cached version.

## What Needs to Change

**No code changes required** — the current codebase is already correct. The old "Confirm this plan" centered dialog no longer exists.

## Memory Update

I will update the project memory to strengthen the mobile-drawer rule so this pattern is never broken in future changes:

| File | Change |
|------|--------|
| `mem://index.md` | Strengthen the core rule about mobile drawers |
| `mem://preferences/mobile-drawer.md` | Update with explicit "never use Dialog on mobile" rule |


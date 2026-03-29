

## Replace `window.confirm` with AlertDialog / Drawer for delete

The delete button currently calls `onDelete` directly (no confirmation at all — the plan mentioned `window.confirm` but it was never added). We need to wrap the delete action in a proper confirmation UI.

Per the mobile-drawer memory rule: use `Drawer` on mobile, `AlertDialog` on desktop.

### Changes

**File: `src/components/bookings/AttachmentCard.tsx`**

- Add local `confirmOpen` state
- Import `useIsMobile` hook
- On mobile: wrap delete in a `Drawer` with title "Delete this item?", description with attachment title, Cancel + Delete buttons
- On desktop: wrap delete in `AlertDialog` with the same content
- Delete button sets `confirmOpen = true` instead of calling `onDelete` directly
- Confirm action calls `onDelete` and closes the dialog/drawer
- Cancel dismisses without action
- Delete button styled destructive

No other files change. The `onDelete` prop contract stays the same — the parent (`BookingsTab`) already handles the mutation.


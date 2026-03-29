---
name: Responsive modals rule
description: All modals must use bottom sheet Drawer on mobile (<768px), centered Dialog on desktop
type: preference
---
All modals/dialogs must render as bottom sheet Drawer on mobile (< 768px) and centered Dialog on desktop.
Use `ResponsiveModal` from `src/components/ui/ResponsiveModal.tsx` for new modals.
Existing components (InviteModal, ItemFormModal, ExpenseFormModal, ProposalForm, AddToRouteDrawer, TripRoute, ItineraryItemCard, AttachmentCard, SettleConfirmDrawer) already implement this pattern with `useIsMobile()`.

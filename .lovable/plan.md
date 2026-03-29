

## Share Link UI + Public Share Page

### Summary
Add a Share button to TripHome header, a ShareModal for generating/copying/revoking share links with export actions, a public ShareView page, and remove export buttons from Itinerary and Expenses tabs.

### Database
No migration needed — `trip_share_tokens` table already exists with correct columns and RLS policies. Insert policy requires admin/owner, select allows any member, update (for revoke) requires admin/owner.

**Note on RLS**: The insert policy on `trip_share_tokens` requires `is_trip_admin_or_owner`. The prompt says "Share button visible to all members" but generating a token requires admin/owner. The generate button will only work for admin/owner due to RLS — we should show the generate button only to admin/owner, while all members can view/copy an existing active link.

### Files to create

1. **`src/components/ShareModal.tsx`**
   - Props: `tripId`, `tripName`, `open`, `onOpenChange`, `isAdmin` (owner/admin)
   - Query `trip_share_tokens` for this trip where `revoked_at IS NULL` and `expires_at > now()` — expired-but-not-revoked tokens are ignored (treated as no token)
   - If no active token + isAdmin: show "Generate share link" button
   - If no active token + not admin: show "No share link yet" message
   - Generate: insert with `crypto.randomUUID()`, 30-day expiry
   - Display full URL via `getShareableAppOrigin() || window.location.origin` + `/share/${token}`
   - Copy button with clipboard API + sonner toast
   - "Expires on [date]" label
   - Revoke button (admin/owner only) — updates `revoked_at = new Date().toISOString()`
   - Secondary "Also export" section below with:
     - "Add to Calendar" (CalendarPlus icon) — calls export-trip-ics edge function
     - "Export CSV" (Download icon) — calls export-expenses-csv edge function
   - Both use `variant="outline"` small size

2. **`src/pages/ShareView.tsx`**
   - Public route, no auth required
   - On mount: POST to `public-trip-share-view` edge function with token from URL params
   - Error state: "This share link is invalid or has expired" + "Sign up to Junto" link to `/signup`
   - Success: trip name/emoji/dates, itinerary grouped by day_date (read-only cards), URL-type attachment links, "Join this trip on Junto" CTA button → `/signup`
   - NEVER makes direct database queries — edge function only

### Files to modify

3. **`src/pages/TripHome.tsx`**
   - Import `ShareModal` and `Share2` icon
   - Add `shareOpen` state
   - Add Share button (Share2 icon) in header next to Invite button — visible to all members
   - Render `<ShareModal>` with `isAdmin={canInvite}`

4. **`src/components/itinerary/ItineraryTab.tsx`**
   - Remove the "Export .ics" button block (lines 155-183)
   - Remove `Download` icon import if no longer used

5. **`src/components/expenses/ExpensesTab.tsx`**
   - Remove the "CSV" export button block (lines 169-197)
   - Remove `Download` icon import if no longer used

6. **`src/App.tsx`**
   - Replace `<div>Share placeholder</div>` on line 35 with `<ShareView />` component import

### Key behavior: expired token handling
When querying for an active token, the filter is: `revoked_at IS NULL AND expires_at > now()`. If a token is expired but not revoked, it simply won't appear — the UI shows "Generate share link" as if no token exists.




## Plan: Push Notification Opt-in and Preferences

### Files to change

1. **`src/components/PushOptInDrawer.tsx`** (new) — One-time bottom sheet prompt
2. **`src/pages/TripOnboarding.tsx`** — Show `PushOptInDrawer` after final step ("Let's go")
3. **`src/pages/JoinByCode.tsx`** — Show `PushOptInDrawer` after successful join
4. **`src/pages/InviteRedeem.tsx`** — Show `PushOptInDrawer` after successful redeem
5. **`src/pages/More.tsx`** — Update the Notifications section (lines 792-819) with the new toggle categories and remove the "coming soon" text

---

### 1. PushOptInDrawer component (new file)

A reusable Drawer (bottom sheet on mobile, Dialog on desktop via `ResponsiveModal`) with:
- Title: "Stay in sync with your group"
- Body: "Get notified about new expenses, polls, and trip updates."
- "Enable" button → calls `subscribeToPush()`, sets `localStorage.setItem("push_opt_in_shown", "true")`, closes
- "Not now" button → sets `localStorage.setItem("push_opt_in_shown", "true")`, closes
- Guard: if `localStorage.getItem("push_opt_in_shown")` is truthy, never renders

Exported as `usePushOptIn()` hook returning `{ showOptIn, PushOptInDrawer }` so consuming pages can mount it easily.

### 2. TripOnboarding — trigger after trip creation

On the "Let's go" button in Step 4, before navigating to the trip, show the push opt-in drawer. Use the `usePushOptIn` hook; on step 4's CTA click, call `showOptIn()` which opens the drawer. After dismiss (either button), navigate to the trip.

### 3. JoinByCode — trigger after joining

In `onSuccess` of the join mutation, before navigating, trigger the opt-in. Since navigation happens immediately, instead set a flag and show the drawer, navigating only after the drawer is dismissed.

### 4. InviteRedeem — trigger after redeeming

Same pattern as JoinByCode: show opt-in drawer on successful redeem before navigating to the trip.

### 5. More.tsx — Updated notification toggles

Replace the existing 5 toggles (lines 798-812) with these categories that map to `notification_preferences` JSONB keys:

| Toggle label | JSONB key |
|---|---|
| New expenses | `new_expense` |
| Polls (new + closing soon) | `decisions_reminder` |
| Trip countdown reminders | `route_confirmed` |
| New members joining | `new_member` |
| Itinerary changes | `new_activity` |

Remove the "Push notifications coming soon" text (line 815-817). Add an "Enable push notifications" button that calls `subscribeToPush()` if the browser doesn't already have a push subscription, or shows "Push notifications enabled" if it does.

### Technical notes

- `subscribeToPush()` from `src/lib/pushSubscription.ts` handles permission prompt, SW subscription, and DB persistence
- localStorage key `push_opt_in_shown` prevents repeat prompts
- Uses `ResponsiveModal` for consistent mobile drawer / desktop dialog pattern
- No database migration needed — `notification_preferences` JSONB and `push_subscriptions` table already exist


# Junto — Current User Onboarding Flow Audit

> Audited against actual source code on 2026-04-16.
> Key files: `src/App.tsx`, `src/pages/Landing.tsx`, `src/pages/ReferralLanding.tsx`,
> `src/pages/TripList.tsx`, `src/pages/TripNew.tsx`, `src/pages/TripOnboarding.tsx`,
> `src/components/trip-builder/StandaloneTripBuilder.tsx`,
> `src/components/trip-builder/PremiumTripInput.tsx`,
> `src/components/trip-builder/ConfirmationCard.tsx`

---

## Full Flowchart

```mermaid
flowchart TD

%% ─────────────────────────────────────────────
%% FLOW 1 — Anonymous user lands on /
%% ─────────────────────────────────────────────

    A([User visits /]) --> B{Auth state?}
    B -- "authenticated" --> TRIPS[/app/trips — Trip List]
    B -- "loading" --> LOADER[Full-screen spinner]
    LOADER --> B
    B -- "anonymous" --> LANDING[Landing page /\nHero + search input + CTAs]

    LANDING -- "clicks 'Log in' top-right" --> REF
    LANDING -- "clicks 'Plan with Junto AI' CTA" --> REF
    LANDING -- "clicks 'Start planning' bottom CTA" --> REF
    LANDING -- "types destination + presses Enter" --> REF
    %% ⚠️ REDUNDANT: search input on landing does nothing except redirect to /ref
    %% — destination value is lost, user must re-enter it on /ref

    REF[/ref — ReferralLanding\nSignup / Login page\nVideo background slideshow]

%% ─────────────────────────────────────────────
%% FLOW 2 — Anonymous user signs up
%% ─────────────────────────────────────────────

    REF --> AUTHCHECK{Already\nlogged in?}
    AUTHCHECK -- "yes" --> TRIPS
    AUTHCHECK -- "no" --> AUTHFORM{Auth mode?}

    AUTHFORM -- "default: signup" --> SIGNUP_FORM["Signup form
    ───────────────────
    • Display name (required, min 6 chars)
    • Email (required)
    • Password (required, min 6 chars)
    [Create account]"]

    AUTHFORM -- "toggle to sign in" --> LOGIN_FORM["Login form
    ───────────────────
    • Email (required)
    • Password (required)
    [Sign in]"]

    AUTHFORM -- "Google OAuth button" --> GOOGLE_OAUTH["Redirect to Google
    → /auth/callback?redirect=..."]

    SIGNUP_FORM -- "submit" --> SIGNUP_RESULT{Success?}
    SIGNUP_RESULT -- "error" --> SIGNUP_FORM
    SIGNUP_RESULT -- "success" --> POST_AUTH

    LOGIN_FORM -- "submit" --> LOGIN_RESULT{Success?}
    LOGIN_RESULT -- "error" --> LOGIN_FORM
    LOGIN_RESULT -- "success" --> POST_AUTH

    GOOGLE_OAUTH --> AUTH_CALLBACK[/auth/callback\nResolves referral code\nfrom localStorage]
    AUTH_CALLBACK --> POST_AUTH

    POST_AUTH{redirect param\nin URL?}
    POST_AUTH -- "yes" --> REDIRECT_TARGET[Navigate to stored\nredirect path]
    POST_AUTH -- "no" --> TRIPS
    %% Note: redirect param is validated by safeRedirect() — must start with /
    %% and not start with //

%% ─────────────────────────────────────────────
%% FLOW 3 — Logged-in user, no trips yet
%% ─────────────────────────────────────────────

    TRIPS --> TRIPS_CHECK{Has trips?}
    TRIPS_CHECK -- "loading" --> TRIPS_SKELETON[Skeleton shimmer\nloading state]
    TRIPS_SKELETON --> TRIPS_CHECK

    TRIPS_CHECK -- "yes → has trips" --> TRIPS_LIST[Trip cards list\nGrouped: Live / Countdown\n/ No-dates / Past]
    TRIPS_CHECK -- "no → empty state" --> EMPTY_STATE

    EMPTY_STATE["Empty state screen
    ───────────────────
    'Where do you want to go?'
    [Destination input] + [Generate] button
    'or plan step by step' link
    'or create trip manually' link
    ─────
    'Join an existing trip with a code'"]

    EMPTY_STATE -- "types destination + clicks Generate" --> AI_BUILDER_OPEN
    EMPTY_STATE -- "clicks 'or plan step by step'" --> AI_BUILDER_OPEN
    EMPTY_STATE -- "clicks 'or create trip manually'" --> TRIP_NEW_MANUAL[/app/trips/new?mode=manual\nManual creation form]
    EMPTY_STATE -- "clicks 'Join an existing trip'" --> JOIN_DRAWER

    TRIPS_LIST -- "clicks any trip card" --> TRIP_HOME
    TRIPS_LIST -- "header pill: New trip" --> TRIP_NEW_MANUAL
    TRIPS_LIST -- "header pill: Join" --> JOIN_DRAWER
    TRIPS_LIST -- "drafts carousel: Continue" --> AI_BUILDER_OPEN
    %% ⚠️ Drafts only appear when user has previously generated but not saved a trip

    JOIN_DRAWER["Join drawer (bottom sheet)
    ───────────────────
    • Code input (4–8 chars, uppercased)
    [Join trip]"]
    JOIN_DRAWER -- "valid code submitted" --> TRIP_HOME
    JOIN_DRAWER -- "dismiss / close" --> TRIPS

%% ─────────────────────────────────────────────
%% FLOW 4a — Manual trip creation
%% ─────────────────────────────────────────────

    TRIP_NEW_MANUAL --> MANUAL_FORM["Manual creation form /app/trips/new
    ───────────────────
    • Trip name * (required, max 60 chars)
    • Trip dates  (optional date range picker)
    • Cover photo (optional, with crop overlay)
    • Trip emoji  (optional, quick-select row)
    [Create Trip]
    ← Back to trips link"]

    MANUAL_FORM -- "selects cover photo" --> CROP_OVERLAY[CoverCropOverlay\nModal to crop image]
    CROP_OVERLAY -- "confirms crop" --> MANUAL_FORM
    CROP_OVERLAY -- "cancels" --> MANUAL_FORM

    MANUAL_FORM -- "submits (name required)" --> PUSH_OPTIN_1

    PUSH_OPTIN_1["Push opt-in drawer
    (shown once per browser)
    ───────────────────
    [Allow notifications]
    [Maybe later]"]
    PUSH_OPTIN_1 -- "allow or dismiss" --> ONBOARDING
    %% ⚠️ If push opt-in was already shown before, this step is silently skipped

    ONBOARDING[/app/trips/:tripId/onboarding\n4-step wizard — full screen page]

    ONBOARDING --> OB_STEP1["Step 1 — Invite Crew
    ───────────────────
    Shows: trip emoji + name
    Large trip code display (tap to copy)
    [Share via WhatsApp]
    [Copy invite link]
    ─────
    [Next →]
    'I'll invite them later' (skip link)
    X button (top-right) → goes to trip home"]

    OB_STEP1 -- "Next → or skip" --> OB_STEP2

    OB_STEP2["Step 2 — Quick Settings
    ───────────────────
    • Settlement currency picker (default EUR)
    • Destination text field (optional)
    ← back button
    [Next →]"]
    %% ⚠️ REDUNDANT: destination was also optional in manual form and here again
    OB_STEP2 -- "Next →" --> OB_STEP3
    OB_STEP2 -- "back" --> OB_STEP1

    OB_STEP3["Step 3 — Module Selection
    ───────────────────
    Toggle switches (all ON by default):
    • Decisions
    • Itinerary
    • Expenses
    • Bookings
    ← back button
    [Next →]"]
    OB_STEP3 -- "Next →" --> OB_STEP4
    OB_STEP3 -- "back" --> OB_STEP2

    OB_STEP4["Step 4 — Celebration
    ───────────────────
    Confetti animation
    Trip name + emoji
    Invite code reminder
    [Let's go →]"]
    OB_STEP4 -- "Let's go →" --> PUSH_OPTIN_2

    PUSH_OPTIN_2["Push opt-in drawer again
    (if not already shown/dismissed)"]
    PUSH_OPTIN_2 -- "allow or dismiss" --> TRIP_HOME
    %% ⚠️ CONFUSING: push opt-in can appear TWICE in the manual path
    %% (once after trip creation, once after onboarding step 4)
    %% In practice the localStorage flag prevents double-show,
    %% but the flow wires it up twice

    %% Refresh behaviour: onboarding step state is component-only (useState)
    %% A refresh at any step resets to Step 1

%% ─────────────────────────────────────────────
%% FLOW 4b — AI trip creation (primary path)
%% ─────────────────────────────────────────────

    AI_BUILDER_OPEN[StandaloneTripBuilder overlay\nfull-screen takeover z-100]

    AI_BUILDER_OPEN --> AI_INPUT["Phase: input — PremiumTripInput
    ───────────────────
    REQUIRED:
    • Destination text field (MapPin icon)
    • Date range picker
    ─────
    OPTIONAL (pills/toggles):
    • Travel party: Solo/Couple/Friends/Family/Group
    • Kids ages (shown only if Family selected)
    • Budget: Budget/Mid-range/Premium/Luxury
    • Vibes: up to 3 of 8 options
    ─────
    COLLAPSIBLE (hidden by default):
    • Deal-breakers textarea
    • Free-text override textarea
    ─────
    [Generate my trip ✦]  (disabled until dest + dates filled)"]

    AI_INPUT -- "destination + dates filled → Generate" --> AI_CONFIRM

    AI_CONFIRM["Phase: confirming — ConfirmationCard
    ───────────────────
    Summary sentence of collected inputs
    [Edit]  [Looks good, continue]"]
    %% ⚠️ POTENTIALLY DROPPABLE: confirmation step adds a click
    %% with no new information; user just confirmed what they typed

    AI_CONFIRM -- "Edit" --> AI_INPUT
    AI_CONFIRM -- "Looks good, continue" --> AI_GENERATING

    AI_GENERATING["Phase: generating — GeneratingScreen
    ───────────────────
    Animated 6-step checklist with timer:
    1. Finding venues (3s)
    2. Checking opening hours (7s)
    3. Clustering by neighbourhood (11s)
    4. Adding local tips (16s)
    5. Almost ready (21s)
    6. Polishing itinerary (ongoing)
    Destination name revealed after 3s
    ─────
    API call: supabase.functions.invoke('generate-trip-itinerary')
    On success → saves to ai_trip_plans (trip_id=null = draft)"]

    AI_GENERATING -- "API error" --> AI_GEN_ERROR["Error state
    with Retry button"]
    AI_GEN_ERROR -- "retry" --> AI_GENERATING

    AI_GENERATING -- "success" --> AI_RESULTS

    AI_RESULTS["Phase: results — TripResultsView (full screen)
    ───────────────────
    Trip title, summary, stats bar
    Day-by-day activity timeline
    Interactive map with activity pins
    Cost breakdown panel
    Packing suggestions (collapsible)
    ─────
    CTAs:
    [Adjust] → back to AI_INPUT
    [Regenerate] → back to AI_GENERATING
    [Save draft] → toast + closes builder → TRIPS
    [Create Trip] → creates trip record, links plan"]

    AI_RESULTS -- "Adjust" --> AI_INPUT
    AI_RESULTS -- "Regenerate" --> AI_GENERATING
    AI_RESULTS -- "Save draft" --> TRIPS
    %% Draft saved to ai_trip_plans with trip_id=null; visible in drafts carousel on trips list

    AI_RESULTS -- "Create Trip" --> AI_CREATE_TRIP["supabase insert trips
    name = trip_title
    destination = dest names joined
    dates from AI result
    ─────
    Links ai_trip_plans.trip_id = new trip id"]
    AI_CREATE_TRIP -- "success" --> TRIP_HOME
    %% ⚠️ IMPORTANT: AI path bypasses onboarding entirely
    %% No invite step, no currency setup, no module selection
    AI_CREATE_TRIP -- "error" --> AI_RESULTS

    %% Refresh behaviour: AI builder form state is component-only
    %% A refresh at any phase loses all input and resets to input phase

%% ─────────────────────────────────────────────
%% FLOW 5 — Trip home + adding AI itinerary
%% (for manually created trips that skip AI builder)
%% ─────────────────────────────────────────────

    TRIP_HOME["/app/trips/:tripId — TripHome
    ───────────────────
    Hero: cover photo, trip name, dates, emoji
    Member avatars row + attendance badge
    AI hero card (top of dashboard)
    Draggable dashboard sections"]

    TRIP_HOME --> AI_HERO_CHECK{Trip has\nAI plan?}

    AI_HERO_CHECK -- "yes → plan exists" --> VIEW_PLAN
    AI_HERO_CHECK -- "no → no plan" --> AI_HERO_CTA

    AI_HERO_CTA["AI hero card CTA
    'Plan my trip' button\nor 'Generate itinerary' prompt"]
    AI_HERO_CTA -- "click" --> AI_BUILDER_OPEN

    VIEW_PLAN["/app/trips/:tripId/plan\nTripResultsView — full plan\nwith edit/add activity tools\ngroup reactions & comments"]

%% ─────────────────────────────────────────────
%% FLOW 5b — Adding members to a trip
%% ─────────────────────────────────────────────

    TRIP_HOME -- "Share button (hero)" --> SHARE_MODAL

    SHARE_MODAL["ShareInviteModal
    ───────────────────
    Trip code display + copy
    Invite URL + copy/WhatsApp
    Toggle: include expenses in share view
    [Revoke] share token button
    ─────
    Accessible to: admins + members
    (if share_permission allows)"]

    SHARE_MODAL -- "Copy code / WhatsApp / Copy link" --> SHARE_DISMISS
    SHARE_MODAL -- "dismiss" --> TRIP_HOME
    SHARE_DISMISS["Recipient gets code or link\n→ /join/:code or /i/:token"]

    SHARE_DISMISS --> INVITE_RECIPIENT{Recipient\nlogged in?}
    INVITE_RECIPIENT -- "yes" --> JOIN_RPC["join_by_code RPC\nor redeem_invite RPC\n→ adds to trip_members"]
    INVITE_RECIPIENT -- "no" --> INVITE_AUTH["Redirected to /ref\nwith redirect param\nCode/token stored in sessionStorage"]
    INVITE_AUTH -- "signs up or logs in" --> JOIN_RPC
    JOIN_RPC -- "success" --> ATTENDANCE_OVERLAY

    ATTENDANCE_OVERLAY["AttendanceInviteOverlay
    ───────────────────
    Peeks from bottom of screen
    Shows: trip name, dates, member count
    [You're going ✓]  [Maybe ~]  [Can't make it ✗]
    ─────
    Shown when attendance_status = 'pending'"]
    ATTENDANCE_OVERLAY -- "selects status" --> TRIP_HOME

    %% ⚠️ Admin tab (/app/trips/:tripId/admin) is the other place
    %% to manage members (roles, remove, attendance) but requires
    %% navigating into settings — not prominently surfaced

%% ─────────────────────────────────────────────
%% FLOW 6 — Returning user accesses existing trip
%% ─────────────────────────────────────────────

    TRIPS_LIST -- "taps trip card" --> TRIP_HOME

    TRIP_HOME -- "/plan tab" --> VIEW_PLAN
    TRIP_HOME -- "/itinerary tab" --> ITINERARY_TAB[ItineraryTab\nDay-by-day items]
    TRIP_HOME -- "/decisions tab" --> DECISIONS_TAB[DecisionsFlow\nGroup voting polls]
    TRIP_HOME -- "/expenses tab" --> EXPENSES_TAB[ExpensesTab\nSplit costs tracker]
    TRIP_HOME -- "/bookings tab" --> BOOKINGS_TAB[BookingsTab\nShared docs]
    TRIP_HOME -- "/admin tab" --> ADMIN_TAB[AdminTab\nMembers, roles, modules, delete]
    TRIP_HOME -- "← back" --> TRIPS_LIST

%% ─────────────────────────────────────────────
%% PROTECTED ROUTE CATCH-ALL
%% ─────────────────────────────────────────────

    ANON_PROTECTED{Anonymous user\ntries /app/* route}
    ANON_PROTECTED --> REF_REDIRECT["/ref?redirect=/original/path\nProtectedRoute guard"]
    REF_REDIRECT --> REF

%% ─────────────────────────────────────────────
%% STYLE CLASSES
%% ─────────────────────────────────────────────

    classDef screen fill:#1e3a5f,stroke:#3b82f6,color:#fff
    classDef form fill:#1e4a3a,stroke:#10b981,color:#fff
    classDef decision fill:#4a2c1e,stroke:#f97316,color:#fff
    classDef warning fill:#4a3a00,stroke:#eab308,color:#fff
    classDef api fill:#3a1e4a,stroke:#a855f7,color:#fff

    class LANDING,REF,TRIPS,TRIP_HOME,ONBOARDING,VIEW_PLAN,TRIPS_LIST screen
    class SIGNUP_FORM,LOGIN_FORM,MANUAL_FORM,AI_INPUT,AI_RESULTS,SHARE_MODAL form
    class B,AUTHCHECK,AUTHFORM,TRIPS_CHECK,AI_HERO_CHECK,INVITE_RECIPIENT,SIGNUP_RESULT,LOGIN_RESULT,POST_AUTH decision
    class AI_GENERATING,JOIN_RPC api
```

---

## Summary Metrics

### Click count: Landing → AI-generated itinerary (fastest path)

| Step | Screen | Action | Clicks |
|------|--------|--------|--------|
| 1 | `/` Landing | Click "Plan with Junto AI" | 1 |
| 2 | `/ref` Signup | Fill 3 fields + click "Create account" | 1 |
| 3 | `/app/trips` Empty state | Type destination + click "Generate" | 1 |
| 4 | AI Builder: Input | Fill dates (destination pre-filled) + click "Generate my trip" | 1 |
| 5 | AI Builder: Confirm | Click "Looks good, continue" | 1 |
| 6 | AI Builder: Generating | Wait (no click) | 0 |
| 7 | AI Builder: Results | Click "Create Trip" | 1 |

**Total: 6 clicks** (+ typing in ~5 fields)

**Via Google OAuth** (fastest possible): 5 clicks (OAuth replaces 3-field signup with 1 click).

### Click count: Landing → AI itinerary (manual trip path)

| Step | Screen | Action | Clicks |
|------|--------|--------|--------|
| 1 | `/` Landing | Click CTA | 1 |
| 2 | `/ref` Signup | Fill + submit | 1 |
| 3 | `/app/trips` Empty state | Click "create trip manually" | 1 |
| 4 | `/app/trips/new` Form | Fill name + submit | 1 |
| 5 | Push opt-in drawer | Dismiss | 1 |
| 6 | Onboarding Step 1 | Click "Next" | 1 |
| 7 | Onboarding Step 2 | Click "Next" | 1 |
| 8 | Onboarding Step 3 | Click "Next" | 1 |
| 9 | Onboarding Step 4 | Click "Let's go" | 1 |
| 10 | Push opt-in drawer | Dismiss (2nd time wired, skipped by flag) | 0 |
| 11 | Trip home | Click "Plan my trip" on AI hero card | 1 |
| 12 | AI Builder: Input | Fill destination + dates + "Generate my trip" | 1 |
| 13 | AI Builder: Confirm | Click "Looks good, continue" | 1 |
| 14 | AI Builder: Generating | Wait | 0 |
| 15 | AI Builder: Results | Click "Create Trip" | 1 |

**Total: 13 clicks** (+ typing in ~6 fields)

### Required form fields across the full flow

| Screen | Required fields | Optional fields |
|--------|----------------|-----------------|
| Signup | display_name, email, password (3) | — |
| Manual trip creation | name (1) | dates, cover photo, emoji |
| AI builder input | destination, date range (2) | party, budget, vibes, deal-breakers, free text |
| Onboarding Step 2 | — | currency (pre-filled), destination |
| Onboarding Step 3 | — | module toggles (all pre-enabled) |

**Minimum required fields, AI path:** 5 (3 signup + 2 AI input)
**Minimum required fields, manual path:** 4 (3 signup + 1 trip name)

---

## Issues Found

### Dead ends
- None found — every screen has a forward path or a back/close action.

### Dialogs opening dialogs
- None in the direct onboarding path. The `CoverCropOverlay` on the manual trip form is a full-screen overlay that returns to the form — fine.

### Back-button issues
- **Onboarding Steps 2–3** have a custom `goBack()` button but no browser-native back guard. Pressing the browser back button from the onboarding URL navigates away from the 4-step flow entirely, back to wherever the user came from (trip home or trips list).
- **AI Builder** has no back button at the input phase — the only exit is the `X` close button which abandons the whole flow.

### Places the user can lose work by navigating away

| Location | What is lost | Persistence mechanism |
|----------|-------------|----------------------|
| Manual trip creation form (`/app/trips/new`) | Trip name, dates, cover photo | None — full loss on navigate |
| AI builder input phase | Destination, dates, all preferences | None — full loss on refresh/navigate |
| AI builder confirm/generating phases | Same as above | None |
| Onboarding steps 2–4 | Currency and module selections typed so far | Steps 2 & 3 save to DB **on Next click**; if user closes between steps the DB is partially updated but they restart at step 1 |
| Expense form modal | Full expense form | Saved to localStorage with 10-min TTL — survives dismiss and refresh |

### Redundant / potentially droppable steps

1. **⚠️ Landing page search input** (`src/pages/Landing.tsx`): typing a destination and pressing Enter just redirects to `/ref` — the destination value is silently discarded. Either wire it through or remove it.

2. **⚠️ AI ConfirmationCard** (`src/components/trip-builder/ConfirmationCard.tsx`): adds a full extra click with no new user decision. The "summary sentence" can be shown inline on the input form. Potentially droppable.

3. **⚠️ Destination field in Onboarding Step 2** (`src/pages/TripOnboarding.tsx:253`): for manually created trips the destination was already optional in `TripNew`. Asking again in onboarding is redundant for users who filled it; confusing for users who didn't.

4. **⚠️ Push opt-in wired twice** (`src/pages/TripNew.tsx:60`, `src/pages/TripOnboarding.tsx:63`): both `TripNew` and `TripOnboarding` call `usePushOptIn()`. The localStorage flag prevents double-display in practice, but the architecture is confusing and fragile.

5. **⚠️ AI path skips onboarding entirely**: users who create a trip via the AI builder land directly at `/app/trips/:tripId` with no currency setup, no module selection, and no invite prompt. This is an inconsistency that likely results in lower member-invite rates for AI-created trips.

6. **⚠️ Three separate "create" entry points** for users with no trips (Generate button, "plan step by step", "create trip manually") all lead to variations of the same thing. The hierarchy is unclear — the most prominent action (Generate) leads to the AI path, but the two secondary links are easy to miss and inconsistently labelled.

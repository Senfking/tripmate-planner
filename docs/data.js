// Auto-generated 2026-04-27 — verified against codebase main @ 263e048
// Tags supported: Claude Code, Lovable, SQL, OPS, Bug, Legal, Manual, WIP

DONE_GROUPS.push({
  title: "Frontend — UI & layout",
  items: [
    { title: "Core: trips, itinerary, decisions, expenses, realtime, admin, share/invite, PWA", tags: [] },
    { title: "PWA polish: iOS install tip, transitions, offline banner, skeleton states, safe-area insets", tags: ["Lovable"] },
    { title: "My Account screen + schema additions + Google OAuth invite loop fix", tags: ["Lovable","Claude Code"] },
    { title: "UI redesign: trip dashboard hero, My Trips editorial cards, expenses bank-app style, itinerary calendar", tags: ["Lovable"] },
    { title: "Vibe Board V2 — visual redesign, premium pill layout", tags: ["Lovable"], note: "Standalone Vibe Board has since been deprecated as a tab; preferences captured inline by AI Trip Builder." },
    { title: "Share & invite modal: join code prominent, WhatsApp + copy", tags: ["Lovable"] },
    { title: "Join trip: dashed row on home + bottom drawer with monospaced input", tags: ["Lovable"] },
    { title: "Onboarding: 4-step wizard, enabled_modules + destination columns", tags: ["Lovable","SQL"] },
    { title: "Desktop optimisation: top header nav, max-width containers, 2-col grids", tags: ["Lovable"] },
    { title: "Feedback widget: floating button, AI response, screenshot, DB storage", tags: ["Lovable","Claude Code"] },
    { title: "Design system page at /design-system", tags: ["Lovable"] },
    { title: "Tab restructure — Trips | Itinerary | Ideas | Expenses (BottomNav + DesktopHeader)", tags: ["Lovable"], note: "Verified in src/components/BottomNav.tsx and src/components/DesktopHeader.tsx — Decisions tab demoted as planned." },
    { title: "Trip list sections — drafts / coming up / happening now / past", tags: ["Lovable"], note: "Verified in src/pages/TripList.tsx." },
    { title: "Landing page — hero, rotating placeholder, trip input bar, sample carousel, feature cards", tags: ["Lovable"], note: "src/pages/Landing.tsx — covers Phase 5a MVP." },
    { title: "Sample trips / templates browse + detail pages", tags: ["Lovable"], note: "src/pages/Templates.tsx + TemplateDetail.tsx with category filtering and carousel." },
    { title: "Toast safe-area positioning (fixes iOS Dynamic Island overlap)", tags: ["Claude Code"], note: "src/components/ui/toast.tsx uses env(safe-area-inset-top); iOS PWA clearance enforced via JS-measured + !important CSS (commit 03e3f35)." },
    { title: "PWA update banner (ServiceWorkerUpdater)", tags: ["Lovable"], note: "src/components/ServiceWorkerUpdater.tsx — detects waiting SW and triggers reload." },
    { title: "Stream reveal animation in AI Trip Builder", tags: ["Claude Code"], note: "useStreamReveal hook + StreamRevealIndicator integrated in TripResultsView. Recent commit 93be080 added LLM-written confirmation summary with deterministic fallback." },
    { title: "Split-view map alongside AI builder results", tags: ["Lovable"], note: "TripResultsView.tsx renders activities with map context." },
    { title: "Ideas board UI", tags: ["Lovable"], note: "src/pages/Ideas.tsx wired to trip_ideas + trip_idea_votes." },
    { title: "Rich venue detail surfaces in AI builder results", tags: ["Lovable"], note: "trip-results/ActivityCard.tsx — photos, reviews, ratings, Google Maps link." },
    { title: "Privacy Notice (real content, junto.pro/privacy)", tags: ["Legal"], note: "src/pages/Privacy.tsx — 'Last updated April 9, 2026'." },
    { title: "Terms & Conditions (real content, junto.pro/terms)", tags: ["Legal"], note: "src/pages/Terms.tsx — 'Last updated April 9, 2026'." },
    { title: "Multi-quantity claim stepper UI + backend", tags: ["Lovable","Claude Code"], note: "claimed_quantity column + LineItemClaimList. UI bug 'stepper not responding' tracked separately in What's Next." },
    { title: "Drag-and-reorder dashboard sections (dnd-kit, edit-mode toggle)", tags: ["Lovable"], note: "TripDashboard with sortable sections, localStorage persistence." },
    { title: "Premium toast styling refresh", tags: ["Lovable"], note: "Recent commit de59b7f." },
    { title: "Empty state hero on Decisions", tags: ["Lovable"], note: "Recent commit e78bcf0." },
    { title: "Bookings empty state redesign", tags: ["Lovable"], note: "Recent commit 0c00c7d." }
  ]
});

DONE_GROUPS.push({
  title: "AI features",
  items: [
    { title: "AI Trip Builder — premium input flow (vibes, budget, deal-breakers, 'what don't you want')", tags: ["Lovable","Claude Code"], note: "src/components/trip-builder/* — full multi-step flow built." },
    { title: "AI Trip Builder — editorial voice system prompt (local-friend tone, timing tips, booking warnings)", tags: ["Claude Code"] },
    { title: "AI Trip Builder — confirmation card trust bridge", tags: ["Lovable"], note: "ConfirmationCard.tsx with LLM-written summary + deterministic fallback (#193)." },
    { title: "AI Trip Builder — destination-specific loading messages", tags: ["Lovable"] },
    { title: "Activity slot scaling for 10–14-day trips", tags: ["Claude Code"], note: "Recent commits #197 #198 — slot ceiling raised 28→36." },
    { title: "Receipt scanner: camera → Claude Haiku → pre-fill expense form", tags: ["Claude Code","Lovable"], note: "scan-receipt edge function + ReceiptLightbox component." },
    { title: "Concierge refactor — Google Places-first pipeline", tags: ["Claude Code"], note: "concierge-suggest edge function v2.9 with adaptive radius + Haversine + caching." },
    { title: "Concierge — event search via Brave Search API", tags: ["Claude Code"] },
    { title: "Concierge — intent-aware tiered ranking (3 tiers)", tags: ["Claude Code"] },
    { title: "Concierge — fuzzy name matching for venue reclassification", tags: ["Claude Code"] },
    { title: "Concierge Phase A MVP — chat UI + Places enrichment + group reactions", tags: ["Claude Code"], note: "ConciergePanel + ConciergeButton on dashboard. plan_activity_reactions_and_comments migration deployed." },
    { title: "AI request logging table + middleware", tags: ["Claude Code","SQL"], note: "ai_request_log table (migration 20260419100000). Used by concierge-suggest, generate-trip-itinerary." },
    { title: "AI response cache table + cleanup cron", tags: ["Claude Code","SQL"], note: "ai_response_cache table with daily 03:17 UTC cleanup job." },
    { title: "Per-user daily AI rate limits", tags: ["Claude Code"], note: "Verified in concierge-suggest (5/hour default) and generate-trip-itinerary." },
    { title: "Server-side AI feedback analysis (analyze-feedback edge function)", tags: ["Claude Code"], note: "Recent commit b4de8dc moved off-client. ai_summary / ai_fix / ai_category / ai_severity columns now populated by trigger." },
    { title: "Booking → expense + itinerary cross-link", tags: ["Lovable","Claude Code"], note: "BookingCrossLinkDrawer + extract-booking-info edge function." },
    { title: "Itinerary ↔ expense cross-link", tags: ["Lovable"], note: "ItineraryCrossLinkDrawer in expenses." },
    { title: "Idea → itinerary item cross-link", tags: ["SQL"], note: "trip_ideas.itinerary_item_id FK." }
  ]
});

DONE_GROUPS.push({
  title: "Backend / database / infrastructure",
  items: [
    { title: "Trip ideas board schema (trip_ideas + trip_idea_votes with RLS)", tags: ["SQL"] },
    { title: "Exchange rates fix — warning flash, silent stale refresh, 1:1 fallback removed", tags: ["Claude Code"] },
    { title: "pg_cron exchange-rate warm-up (daily refresh)", tags: ["SQL","OPS"], note: "refresh-exchange-rates edge function on daily cron." },
    { title: "hint_rating column on feedback table", tags: ["SQL"], note: "Verified in 20260426114007 migration." },
    { title: "feedback metadata JSONB + ai_summary / ai_fix / ai_category / ai_severity columns", tags: ["SQL"], note: "Migration 20260426114007 + server-side analysis trigger." },
    { title: "Attendance: status column, confirmation card, vibe-board gate, expense-splits default", tags: ["Lovable","SQL"], note: "trip_members.attendance_status: going / maybe / not_going." },
    { title: "Expenses sync — global tab uses shared React Query cache", tags: ["Claude Code"] },
    { title: "Expenses loading state fix — isPending + error retry", tags: ["Claude Code"] },
    { title: "Expense replica identity FULL (realtime DELETE events)", tags: ["SQL"], note: "Migration 20260421120000." },
    { title: "Performance round 1 — cache overrides removed, PullToRefresh scoped, query keys normalised, realtime invalidation reduced", tags: ["Claude Code"] },
    { title: "Push notification infrastructure — service worker + VAPID + send-push edge function", tags: ["Claude Code"], note: "src/service-worker.ts + send-push-notification + push_subscriptions table." },
    { title: "Push notification permission prompt + preferences UI", tags: ["Lovable"], note: "src/components/PushOptInDrawer.tsx." },
    { title: "Calendar sync — iCal export edge function", tags: ["Claude Code"], note: "supabase/functions/export-trip-ics." },
    { title: "Expenses CSV export edge function", tags: ["Claude Code"], note: "supabase/functions/export-expenses-csv. Empty-output bug tracked in What's Next." },
    { title: "Public trip share view edge function (read-only guest)", tags: ["Claude Code"], note: "supabase/functions/public-trip-share-view." },
    { title: "Account deletion (GDPR) edge function", tags: ["Claude Code"], note: "supabase/functions/delete-account." },
    { title: "Email queue + auth-email hook", tags: ["Claude Code"], note: "process-email-queue + auth-email-hook." },
    { title: "Admin notifications + alerts (verify_jwt + service-role bearer)", tags: ["Claude Code","SQL"], note: "Recent commits #190 #191 — secured behind vault service-role key." },
    { title: "AI generation error log table + throttled error-spike cron", tags: ["SQL"], note: "ai_generation_errors + 20260419121000 throttle migration." },
    { title: "Places cache + quota tables (shared with concierge & trip builder)", tags: ["SQL"], note: "20260411000000_place_details_cache + 20260421150000_places_cache_and_quotas." },
    { title: "Sentry observability integration (frontend, env-gated)", tags: ["Claude Code"], note: "Recent #194 #195 — VITE_SENTRY_DSN, error-boundary capture." },
    { title: "Centralised auth-retry + user-friendly error toasts", tags: ["Claude Code"], note: "Recent #188 #190 #192." },
    { title: "Resilient feedback submit with recent error context attached", tags: ["Claude Code"], note: "Recent commit b4de8dc." },
    { title: "Offline document access (IndexedDB cache mirrored by service worker)", tags: ["Claude Code"], note: "src/lib/offlineDocuments.ts." }
  ]
});

DONE_GROUPS.push({
  title: "Referral & growth",
  items: [
    { title: "Referral system — landing page + capture on signup + WhatsApp nudge", tags: ["Lovable","Claude Code"], note: "src/pages/ReferralLanding.tsx + AuthCallback handles referred_by capture." },
    { title: "Verified: trip join link captures inviter's referral_code", tags: ["Claude Code"], note: "Confirmed in AuthCallback.tsx + ReferralLanding.tsx writing referred_by." },
    { title: "Fortune Wheel easter egg in decisions/polls", tags: ["Lovable"], note: "src/components/decisions/UniverseWheel.tsx." },
    { title: "junto.pro domain — purchased, DNS configured", tags: ["OPS"] },
    { title: "URL sweep — juntotravel.lovable.app → junto.pro across codebase", tags: ["Manual"] },
    { title: "All profiles auto-receive referral_code on signup", tags: ["SQL"], note: "Trigger-backed; backfill verified zero NULLs." },
    { title: "User flow audit — docs/current-user-flow.md", tags: ["Manual"] }
  ]
});

DONE_GROUPS.push({
  title: "Recently fixed bugs",
  items: [
    { title: "Concierge wrong location (Mexico result for non-Mexico trip)", tags: ["Bug","Claude Code"], note: "Fixed in concierge pipeline refactor." },
    { title: "Expenses stuck loading indefinitely", tags: ["Bug","Claude Code"], note: "Fixed with isPending check + error state with retry button." },
    { title: "Expense row '…' placeholder, default split selection, auth-race resilience", tags: ["Bug","Claude Code"], note: "Recent #187." }
  ]
});

// ═══════════════════════════════════════════════════════════
// WHAT'S NEXT — linear, work top-to-bottom
// ═══════════════════════════════════════════════════════════

// — VERIFY FIRST: are the v11 bug entries still real? —

NEXT_TASKS.push({
  title: "Verify v11 bugs against current build (reproduce items 2–6 one by one)",
  tags: ["Bug","Claude Code"],
  section: "Verify",
  note: "v11 bug entries 2–6 below were copied through to v12 without independent reproduction. For each: open the running app, attempt the repro, confirm whether it's still reproducible, partial, or already fixed. Drop fixed items; demote unverified-cosmetic ones; promote anything that turns out to be worse than v11 captured.",
  why: "Working a phantom bug burns the same time as a real one. CLAUDE.md mandates 'Diagnosis First' — this is that gate for the next sprint.",
  detail: "<strong>Refresh / direct-nav crash (item 3 below)</strong> has the strongest counter-signal: CLAUDE.md says 'Every route component must independently fetch its data… use useParams() to extract tripId and query Supabase directly.' If that pattern is in place, the crash is already fixed and the item should be dropped.<br><br><strong>Expense hero math (item 4)</strong> — recent commit f0163d8 fixed adjacent expense logic; check whether the YOU PAID / YOUR SHARE numbers actually mismatch in a multi-member multi-currency trip before re-prompting Claude Code.<br><br><strong>CSV export empty (item 5)</strong> — invoke the export-expenses-csv edge function manually; if the file is non-empty, the bug is stale.<br><br><strong>Edit/Delete confusion (item 6)</strong> — pure visual check on itinerary cards on iPhone Safari.<br><br><strong>Trip dates not saving (item 2)</strong> — create a fresh trip with explicit picker dates; check the trips row in DB."
});

// — Trust-critical bugs first (acquisition: every one of these breaks first impression) —

NEXT_TASKS.push({
  title: "Trip dates not saving correctly from date picker",
  tags: ["Bug","Claude Code"],
  section: "Bugs",
  note: "User-selected dates (e.g. May 22–31) are not being saved. App displays a generic window (e.g. Apr–May, 30 days) — likely defaulting rather than persisting picker state.",
  why: "Dates are foundational — every itinerary, expense default, and 'happening now' bucket downstream depends on this being right."
});

NEXT_TASKS.push({
  title: "Refresh / direct navigation crashes all trip sub-pages",
  tags: ["Bug","Claude Code"],
  section: "Bugs",
  note: "/itinerary, /expenses, /bookings crash with React Error Boundary on refresh or direct link. Sub-pages rely on parent context. /decisions seems immune.",
  why: "Users naturally refresh and share deep links — both broken. Block on launch."
});

NEXT_TASKS.push({
  title: "Expense hero YOU PAID / YOUR SHARE discrepancy",
  tags: ["Bug","Claude Code"],
  section: "Bugs",
  note: "Hero numbers don't add up. Trace calculation against raw DB data for a multi-member multi-currency trip.",
  why: "Trust-critical for a money app — wrong numbers here destroy credibility on first session."
});

NEXT_TASKS.push({
  title: "Expenses CSV export is empty (0 bytes)",
  tags: ["Bug","Claude Code"],
  section: "Bugs",
  note: "export-expenses-csv edge function downloads junto-expenses.csv but file is always empty. Data extraction failing silently.",
  why: "Edge function exists but is broken — quick diagnose, low risk to fix."
});

NEXT_TASKS.push({
  title: "Edit button on itinerary cards triggers Delete",
  tags: ["Bug","Lovable"],
  section: "Bugs",
  note: "Two icon buttons visually indistinguishable. Make Delete red + trash-2 icon, optionally move it inside Edit modal as secondary action.",
  why: "Direct data-loss path — high blast radius, low effort to fix."
});

NEXT_TASKS.push({
  title: "Claim stepper button not responding to taps",
  tags: ["Bug","Claude Code"],
  section: "Bugs",
  note: "Multi-quantity claim stepper backend + UI shipped but interaction is broken. Pre-existing, undiagnosed.",
  why: "Feature is currently dead-on-arrival — claim stepper is the headline expense feature."
});

NEXT_TASKS.push({
  title: "Concierge venue names show as 'undefined' in mixed events+venues results",
  tags: ["Bug","Claude Code"],
  section: "Bugs",
  note: "Concierge v2.4 deployed but mixed result rendering not verified.",
  why: "User-visible breakage in an AI feature already shown on dashboard."
});

NEXT_TASKS.push({
  title: "Push notification toggles all OFF by default",
  tags: ["Bug","Lovable"],
  section: "Bugs",
  note: "Profile Settings: most push toggles default off. Flip new-expense, new-member, poll-created, trip-countdown to opt-out, not opt-in.",
  why: "Push infra is built; defaulting it off neutralises the retention feature it was meant to enable."
});

NEXT_TASKS.push({
  title: "Feedback modal blocked by iOS keyboard",
  tags: ["Bug","Claude Code"],
  section: "Bugs",
  note: "Bottom-sheet covered by keyboard on textarea focus. Wire visualViewport API to adjust modal bottom offset.",
  why: "Feedback widget is the primary loop for catching the rest of the bugs — must work on iOS."
});

NEXT_TASKS.push({
  title: "Mobile UI batch fix — comment overflow, nav blur, background gap, T&Cs link visibility",
  tags: ["Bug","Lovable"],
  section: "Bugs",
  note: "Four CSS/layout fixes batched: itinerary card comment overflow; bottom-nav blur on iPhone; body background gap at home-indicator; Privacy/T&Cs link visibility on mobile.",
  why: "Pure layout fixes, no logic — all four can land in one Lovable pass."
});

NEXT_TASKS.push({
  title: "Low-contrast teal borders app-wide",
  tags: ["Bug","Lovable"],
  section: "Bugs",
  note: "Teal border colour fails contrast across the app. Bump alpha on --teal-border / equivalent.",
  why: "Single-token change with broad visual win; easy to ship."
});

NEXT_TASKS.push({
  title: "Duplicate Privacy + Terms links in profile footer",
  tags: ["Lovable"],
  section: "Bugs",
  note: "Profile/account page footer shows Privacy and Terms twice side by side. Remove the duplicate set.",
  why: "Trivial cleanup, visible on every account screen visit."
});

NEXT_TASKS.push({
  title: "Edge Function deployment requires Lovable workaround",
  tags: ["WIP","OPS"],
  section: "Bugs",
  note: "Claude Code changes to Edge Functions don't auto-deploy. Pipeline needs a fix or a documented manual step.",
  why: "Process bug — every AI-feature bug above takes 2× longer to ship while this lingers."
});

// — UX issues found in QA (first-impression friction) —

NEXT_TASKS.push({
  title: "Itinerary scroll-of-death — auto-scroll to first day with activities",
  tags: ["Lovable"],
  section: "UX",
  note: "Itinerary opens at first trip date; if dates are wrong (above bug) users scroll past empty days. Auto-scroll to the first day with at least one activity; show empty state if none yet.",
  why: "Mitigates the trip-date bug above and stands on its own as a polish win."
});

NEXT_TASKS.push({
  title: "Move profile avatar from top-left to top-right",
  tags: ["Lovable"],
  section: "UX",
  note: "Top-left is the universal back-button slot. Users don't recognise the avatar as tappable. Move avatar to top-right; swap with whatever's there.",
  why: "Discoverability fix — everything in profile (notifications, account) is currently invisible to first-time users."
});

NEXT_TASKS.push({
  title: "Split the overloaded Share & Invite modal",
  tags: ["Lovable"],
  section: "UX",
  note: "One modal currently does invite, view-only link, expense visibility, revoke, CSV/ICS export. Split into 'Invite Members' (default), 'Share View-Only Link', and move exports to trip Settings → Export.",
  why: "Invite is the highest-leverage referral surface; simplifying it directly raises the join-rate."
});

NEXT_TASKS.push({
  title: "Hide split/balance UI on solo (1-member) trips",
  tags: ["Lovable"],
  section: "UX",
  note: "Solo trips currently show 'YOU PAID €0 / YOUR SHARE €0' and '1 of 1 members voted'. Replace with 'Invite friends to split expenses / vote on ideas' CTA.",
  why: "Solo is the default state for new users — current UI screams 'broken'."
});

NEXT_TASKS.push({
  title: "Decisions: explain Lock buttons, add placeholder examples to Preferences",
  tags: ["Lovable"],
  section: "UX",
  note: "Add tooltip 'Locking prevents changes — only admin can unlock' to Lock buttons; add placeholder examples ('e.g. Dietary, Early bird vs night owl') to empty Preferences section.",
  why: "Both are zero-risk copy fixes; Decisions has an empty-state hero already, this finishes the polish."
});

NEXT_TASKS.push({
  title: "Itinerary statuses, Not-Going attendance, calendar Apply behaviour",
  tags: ["Lovable"],
  section: "UX",
  note: "Three fixes in one Lovable pass: (1) Default AI-imported items to 'Suggested' with a legend; (2) Add 'Not Going' to attendance with counts ('3 going, 1 not going'); (3) Calendar Apply must close the picker.",
  why: "Three small UX scars on the highest-traffic screen; batchable into one prompt."
});

NEXT_TASKS.push({
  title: "Expense form: hide %/Custom split behind 'Advanced', smarten default date",
  tags: ["Lovable"],
  section: "UX",
  note: "Default to Equal split visible only; %/Custom under an Advanced toggle. Default date = today if within trip window, else trip start date.",
  why: "Reduces cognitive load on the most-used create-flow; raises completion rate."
});

// — Tier 1 launch readiness gaps —

NEXT_TASKS.push({
  title: "Concierge desktop layout — responsive grid",
  tags: ["Lovable"],
  section: "Launch readiness",
  note: "Concierge panel is mobile-tuned; desktop needs a multi-column grid for activity cards.",
  why: "Desktop is the default for first-time signup-from-link traffic; current layout looks sparse."
});

NEXT_TASKS.push({
  title: "Performance round 2 — consolidated trip data loader",
  tags: ["Claude Code"],
  section: "Launch readiness",
  note: "Round 1 normalised query keys and scoped pull-to-refresh. Round 2: consolidate trip-page initial fetches into a single loader to remove the cascade of parallel queries on dashboard load.",
  why: "Time-to-interactive on the trip dashboard is the moment users decide to invite the group; one consolidated load is the highest-leverage perf win left."
});

NEXT_TASKS.push({
  title: "Anonymous trip generation — generate without login, signup wall on save",
  tags: ["Claude Code","Lovable"],
  section: "Launch readiness",
  note: "Currently the AI builder requires auth. Allow anonymous trip generation from Landing; require signup only at 'Save trip'. Cache anonymous generations server-side keyed on IP/session.",
  why: "Single biggest acquisition unlock — every competitor (Wanderlog, Layla) lets you preview before signup; this also fuels SEO destination pages later."
});

NEXT_TASKS.push({
  title: "Verify stream reveal works end-to-end + map split-view on real generations",
  tags: ["Verify","Claude Code"],
  section: "Launch readiness",
  note: "Components exist (useStreamReveal, StreamRevealIndicator, TripResultsView map). Run a fresh generation on iPhone Safari + desktop and confirm the reveal animation and map sync.",
  why: "Stream-reveal + map-split is the marketing screenshot for landing — must look polished."
});

// — AI cost safety net (cheap, blocks scaling) —

NEXT_TASKS.push({
  title: "Set Anthropic Console hard spending cap — $50/month",
  tags: ["OPS"],
  section: "AI cost control",
  note: "Hard cap in console.anthropic.com. Email alerts at $25 (50%) and $45 (90%). Verify the API key in Supabase Edge Functions matches this billing account.",
  why: "Rate limiting is in place but the hard cap is the irreversible safety net before any push notification fires."
});

// — Cross-linking gaps (retention) —

NEXT_TASKS.push({
  title: "Receipt scan → suggest add to itinerary",
  tags: ["Claude Code","Lovable"],
  section: "Cross-linking",
  note: "After receipt scan creates an expense, prompt 'Add [venue name] to your itinerary for [date]?' if the receipt has venue + date. Itinerary→expense already wired; this closes the inverse direction.",
  why: "The headline 'one input, multiple outputs' magic moment; the other directions are already built so this finishes the loop."
});

NEXT_TASKS.push({
  title: "Itinerary item with cost in notes → suggest expense",
  tags: ["Lovable"],
  section: "Cross-linking",
  note: "Regex-detect '€25', '$40', '150 EUR' in notes. Show 'Create an expense for €25?' under the saved item. No AI — pure regex.",
  why: "Low-effort, completes the cross-linking matrix (receipt↔expense↔itinerary↔booking)."
});

NEXT_TASKS.push({
  title: "Default-shared receipts/documents + Private toggle",
  tags: ["Claude Code","Lovable"],
  section: "Cross-linking",
  note: "Verify RLS on receipt-images bucket: receipts must be visible to all trip members, not only the uploader. Add 'Private' boolean column on attachments + UI toggle (default off).",
  why: "Group app — if receipts are uploader-only the cross-linking magic is invisible to the rest of the trip."
});

// — Referral feature gaps (acquisition) —

NEXT_TASKS.push({
  title: "Add 'Invite' pill to home-screen header row",
  tags: ["Lovable"],
  section: "Referral",
  note: "Third pill alongside '1 live' and 'Join'. Tapping opens the referral share sheet with personal link + WhatsApp CTA.",
  why: "Highest-frequency referral surface in the app — seen every session."
});

NEXT_TASKS.push({
  title: "Post-trip 'Loved Junto?' invite nudge",
  tags: ["Lovable"],
  section: "Referral",
  note: "Once per completed trip with 2+ members, after end_date passes, show a one-time card on My Trips: 'You just planned [Trip] — share Junto with someone planning their next trip.' Persist dismissal.",
  why: "Highest-intent referral moment — user just had a positive experience and the affordance is right there."
});

NEXT_TASKS.push({
  title: "Show referral counter in My Account",
  tags: ["Lovable"],
  section: "Referral",
  note: "'X friends joined with your link' on the user-facing account page. Data is already in profiles.referred_by — just needs surfacing (currently only visible in admin module).",
  why: "Gamification + social proof at zero data cost."
});

// — Pre-launch ops / content —

NEXT_TASKS.push({
  title: "Sign up for affiliate programs (Booking.com, Viator, GetYourGuide)",
  tags: ["OPS"],
  section: "Launch ops",
  note: "All free, instant approval. Booking.com 4–5%, Viator 8%, GetYourGuide 8%. Sign up now so links are ready when Maps integration is built.",
  why: "Zero-cost setup that unblocks affiliate booking CTAs in the itinerary later."
});

NEXT_TASKS.push({
  title: "Record 60-second demo video",
  tags: ["OPS"],
  section: "Launch ops",
  note: "iPhone screen recording: trip create → invite → itinerary item → expense → balance. Captions, no voiceover. Export 1080×1920 + 1920×1080.",
  why: "Single asset reused across Product Hunt, Reddit, WhatsApp outreach — high leverage."
});

NEXT_TASKS.push({
  title: "Create accounts: Reddit, Product Hunt, Indie Hackers, LinkedIn",
  tags: ["OPS"],
  section: "Launch ops",
  note: "Set up before Week 1. Same avatar/branding across all four. Don't post about Junto on Reddit yet — observe + lurk first.",
  why: "Cold accounts can't post on launch day; warm them now."
});

NEXT_TASKS.push({
  title: "Full end-to-end test as a new user (iPhone Safari)",
  tags: ["Manual"],
  section: "Launch ops",
  note: "Fresh email → referral link → signup → onboarding → create trip → invite 2 real people → itinerary item → expense → check balances → install as PWA → reopen.",
  why: "Covers every fix above in one pass; finds the bugs Claude Code can't see."
});

NEXT_TASKS.push({
  title: "Personally message 20–30 friends for beta",
  tags: ["OPS"],
  section: "Launch ops",
  note: "Individual WhatsApp messages, not broadcast. Target friends with trips in next 60 days. Offer to set up their trip yourself. Goal: 3 active groups with 3+ members each.",
  why: "First real cohort — without seeded usage every other launch task lands on empty soil."
});

NEXT_TASKS.push({
  title: "Delete test trip 'Carine's Wedding — Brazil May 2025'",
  tags: ["SQL"],
  section: "Launch ops",
  note: "SELECT id, name FROM trips WHERE name ILIKE '%carine%'; then DELETE WHERE id = '<id>'.",
  why: "Trivial cleanup; safer to do before any analytics pull."
});

// — Step 16 — Lock exchange rates at expense creation —

NEXT_TASKS.push({
  title: "Step 16a · Add eur_amount + exchange_rate_used columns to expenses",
  tags: ["SQL"],
  section: "Step 16 — Lock rates",
  note: "ALTER TABLE expenses ADD COLUMN eur_amount numeric, exchange_rate_used numeric. Backfill EUR rows with eur_amount = amount, rate = 1.0.",
  why: "Foundation for the next two steps — store-once means balances never drift with live rates."
});

NEXT_TASKS.push({
  title: "Step 16b · addExpense stores eur_amount + locked rate at creation",
  tags: ["Lovable"],
  section: "Step 16 — Lock rates",
  note: "On expense creation: fetch live EUR rate, persist both fields. Balance maths reads eur_amount only — never recomputes from live rates.",
  why: "Closes a category of trust bugs: balances will no longer change retroactively."
});

NEXT_TASKS.push({
  title: "Step 16c · Show locked rate in BalanceAuditSheet",
  tags: ["Lovable"],
  section: "Step 16 — Lock rates",
  note: "'Rate locked at creation: 1 AED = €0.2727' — turns a back-end correctness fix into a visible trust signal.",
  why: "Makes the correctness story legible; otherwise users never see why balances stay stable."
});

// — Quick wins (small, ship in batches) —

NEXT_TASKS.push({
  title: "Route stop date editing — use DateRangePicker from confirmation panel",
  tags: ["Lovable"],
  section: "Quick wins",
  note: "Currently inconsistent. Reuse the same DateRangePicker used elsewhere.",
  why: "Consistency win; tiny patch."
});

NEXT_TASKS.push({
  title: "Collapsed Vibe Board summary in header",
  tags: ["Lovable"],
  section: "Quick wins",
  note: "Show top 2–3 picks as a single line when collapsed.",
  why: "Vibe Board content is captured but invisible after the wizard — surface it back in context."
});

NEXT_TASKS.push({
  title: "Invite-link redemption count on share sheet",
  tags: ["Lovable"],
  section: "Quick wins",
  note: "'X people joined with this link' beneath the WhatsApp/copy buttons. Data is already in invites table.",
  why: "Mild gamification + social proof at zero data cost."
});

NEXT_TASKS.push({
  title: "Past-trips toggle on Itinerary",
  tags: ["Lovable"],
  section: "Quick wins",
  note: "Default: hide trips where end_date < today.",
  why: "De-clutters the global Itinerary view as users complete trips."
});

NEXT_TASKS.push({
  title: "Bookings & Docs search + filter pills",
  tags: ["Lovable"],
  section: "Quick wins",
  note: "Full-text search input + category pills (flights / hotels / activities / documents). Currently flat unfiltered list.",
  why: "Once a trip has 10+ docs the current flat list breaks down."
});

NEXT_TASKS.push({
  title: "Full emoji picker for trip names",
  tags: ["Lovable"],
  section: "Quick wins",
  note: "Replace basic emoji field with @emoji-mart/react — search, recents, categories.",
  why: "Tiny delight win; users currently default to no emoji."
});

// — Packing list (small feature, ships alongside push) —

NEXT_TASKS.push({
  title: "Build collaborative packing list per trip",
  tags: ["Lovable","SQL"],
  section: "Packing",
  note: "New table packing_items (id, trip_id, title, assigned_to, is_checked, created_by, created_at) with RLS. UI as toggleable section in TripDashboard via enabled_modules. Real-time sync via existing useTripRealtime.",
  why: "PackPoint shows the demand; AI Trip Builder already produces packing_suggestions but there's nowhere to put them yet."
});

// — Group preference engine (Phase 2 — differentiation) —

NEXT_TASKS.push({
  title: "Group Preference Engine — quiz UI + data model",
  tags: ["Lovable","Claude Code","SQL"],
  section: "Group preference",
  note: "30-second quiz on join: budget comfort (anonymous), pace, interests, dietary, accessibility, schedule. New tables trip_member_preferences (extended schema) + trip_group_profiles. Budget min/max readable only by service-role.",
  why: "Existing trip_member_preferences schema is the Vibe Board's; the engine needs the new fields and the anonymous-budget RLS."
});

NEXT_TASKS.push({
  title: "Group Preference Engine — AI reconciliation Edge Function",
  tags: ["Claude Code"],
  section: "Group preference",
  note: "Sonnet input: all members' preferences. Output: overlap_summary, compromises, budget_sweet_spot ({min,max,currency}). Cache per trip; invalidate when a member's prefs change. ~$0.02 per reconciliation.",
  why: "This is the moat — no competitor does group-optimised AI planning. Depends on the quiz above."
});

NEXT_TASKS.push({
  title: "Wire AI Trip Builder to read group profile",
  tags: ["Claude Code"],
  section: "Group preference",
  note: "generate-trip-itinerary reads trip_group_profiles when present and conditions suggestions on overlap_summary + budget_sweet_spot.",
  why: "The reconciliation is wasted unless the builder consumes it."
});

// — Templates / discovery Phase 5b–c —

NEXT_TASKS.push({
  title: "Create trip_templates + template_ratings tables",
  tags: ["Claude Code","SQL"],
  section: "Templates",
  note: "Snapshot data tables, separate from live trips. RLS, ratings (1–5) constraint, avg_rating trigger.",
  why: "Foundation for the next two — templates currently render from hardcoded TS arrays."
});

NEXT_TASKS.push({
  title: "Generate 10–15 AI seed templates",
  tags: ["Claude Code","Lovable"],
  section: "Templates",
  note: "Use AI Trip Builder for popular destinations: Bali, Barcelona, Thailand, Dubai-Oman, Georgia, Japan, Lisbon, NYC, Iceland, Tokyo. Insert as seed data with cover photos.",
  why: "Landing-page social proof — empty templates page kills the discovery loop."
});

NEXT_TASKS.push({
  title: "Template browse UI + 'Use this trip' clone flow",
  tags: ["Lovable"],
  section: "Templates",
  note: "Grid of template cards, filters, sort. 'Use this trip' clones into a new trip owned by the user. Rate 1–5 stars after trip ends.",
  why: "The acquisition pull-through — anonymous visitors clone a real trip and become users."
});

NEXT_TASKS.push({
  title: "Community trip publishing + discovery (Phase 5c)",
  tags: ["Claude Code","Lovable"],
  section: "Templates",
  note: "Users opt-in to publish completed trips. Search, 'Recommended for you', featured/trending. template_ratings + reviews. Creator profile pages.",
  why: "Network-effects layer; only meaningful once 500+ users exist."
});

// — Maps & calendar (Phase 3) —

NEXT_TASKS.push({
  title: "Diagnose itinerary data structure for Maps integration",
  tags: ["Claude Code"],
  section: "Maps",
  note: "Pre-build check: do itinerary_items have lat/lng or structured location? What Places data is already cached in place_details_cache? Where would a Map view live in the new tab structure?",
  why: "Cheap diagnostic; informs the build below."
});

NEXT_TASKS.push({
  title: "Add Google Maps view to itinerary",
  tags: ["Claude Code","Lovable"],
  section: "Maps",
  note: "Map pins per day colour-coded, route lines, walking/driving estimates. Places autocomplete on item creation. Reuse place_details_cache.",
  why: "Itinerary without map is the #1 review complaint across travel apps; Wanderlog has it as the entire surface."
});

// — Concierge later phases —

NEXT_TASKS.push({
  title: "Concierge Phase B — multi-turn conversational + web search for live events",
  tags: ["Claude Code"],
  section: "Concierge",
  note: "Multi-turn follow-ups with conversation history per trip. Web search via Claude tool use for live events. Brave Search already wired.",
  why: "Phase A MVP shipped; Phase B is the next visible step-up before Phase C cron infra."
});

NEXT_TASKS.push({
  title: "Concierge Phase C — proactive: morning suggestions, weather-aware, time-aware",
  tags: ["Claude Code","OPS"],
  section: "Concierge",
  note: "Cron Edge Function runs at trip-local morning. Filters by weather. Auto evening suggestions at 5pm. Push delivery via existing send-push-notification.",
  why: "Triggers the retention flywheel during the trip itself; depends on Phase B context model."
});

NEXT_TASKS.push({
  title: "Concierge Phase D — location-aware ('near me', walking distance, 'on the way')",
  tags: ["Claude Code"],
  section: "Concierge",
  note: "Device GPS opt-in. Distance calculations. 'On the way' suggestions between planned activities. Map view integration.",
  why: "Requires Maps integration above; Phase D is the eventual peak experience."
});

// — Step 2a — AI Trip Builder remaining —

NEXT_TASKS.push({
  title: "Real-time collaboration on AI suggestions",
  tags: ["Claude Code","Lovable"],
  section: "AI builder",
  note: "Realtime sync over generated plan. Thumbs up/down voting, comments, presence indicators. plan_activity_reactions_and_comments table already exists.",
  why: "Reactions/comments table shipped — the UI and presence layer is what's missing."
});

NEXT_TASKS.push({
  title: "Lightweight AI suggestions on itinerary view",
  tags: ["Lovable"],
  section: "AI builder",
  note: "Swipeable suggestion cards on the global itinerary view. Reuse concierge-suggest. Distinct from the full Trip Builder.",
  why: "Brings the AI surface to the in-trip context, not just the create flow."
});

// — Trip recap / activity feed / comments / arrivals —

NEXT_TASKS.push({
  title: "Auto-generate Trip Recap card when trip ends",
  tags: ["Lovable","Claude Code"],
  section: "Recap & feed",
  note: "Shareable card: destinations, total spend, top activities, member avatars. 'Planned on Junto' watermark. Native share sheet to Instagram/WhatsApp Stories.",
  why: "Highest-leverage viral surface — every share is an implicit invite at the moment of peak satisfaction."
});

NEXT_TASKS.push({
  title: "Trip activity feed on dashboard",
  tags: ["Lovable"],
  section: "Recap & feed",
  note: "Chronological feed of all trip events from existing tables. 'New since last visit' badges. Section on dashboard, not a separate tab.",
  why: "Re-engagement signal for returning members; piggybacks on existing tables (no new schema)."
});

NEXT_TASKS.push({
  title: "Contextual comments on itinerary items",
  tags: ["Lovable"],
  section: "Recap & feed",
  note: "Comments table already exists (20260412120000). Wire a comment thread per itinerary item with Realtime; trigger push notifications via existing infra.",
  why: "Schema is done; UI is the only blocker — small lift, big collaboration unlock."
});

NEXT_TASKS.push({
  title: "Arrival time UI — group avatars by time slot on day 1 / last day",
  tags: ["Lovable"],
  section: "Arrivals",
  note: "'Oliver lands 14:00 · JuntoB lands 17:30' as grouped avatars on the first/last itinerary day. Pulsing indicator if arrival is within 2 hours.",
  why: "Concrete coordination win that no competitor surfaces; pure UI work over existing data."
});

NEXT_TASKS.push({
  title: "Arrival push notifications",
  tags: ["Claude Code"],
  section: "Arrivals",
  note: "Scheduled Edge Function. Push 2 hours before arrival and on landing. Reuses send-push-notification.",
  why: "Pairs with the UI above; triggers the 'group is landing' moment."
});

// — Receipt scanner enhancements —

NEXT_TASKS.push({
  title: "Extend scanner to multiple document types (hotel, flight, voucher, restaurant)",
  tags: ["Claude Code"],
  section: "Document scanning",
  note: "Today scan-receipt handles receipts; extract-booking-info handles bookings. Unify under one edge function with a type detector. Haiku, ~$0.01/scan.",
  why: "One scanner is the marketing claim ('snap anything'); two functions is the current reality."
});

NEXT_TASKS.push({
  title: "Enhanced scanner UI with type-specific preview cards",
  tags: ["Lovable"],
  section: "Document scanning",
  note: "Per-type preview card with cross-link action buttons (Add to itinerary / Create expense / Add to bookings).",
  why: "Surfaces the cross-link prompts where users already are after a scan."
});

// — Phase 6 architectural pivot (after launch retention validates demand) —

NEXT_TASKS.push({
  title: "Phase 6a · Logged-in home screen with generator bar",
  tags: ["Claude Code","Lovable"],
  section: "Phase 6 — AI-first",
  note: "Logged-in home (TripList) gains the same generator bar as Landing. Generating + 'Create trip' creates trip + links plan in one action.",
  why: "Currently Landing has the generator and TripList does not — inconsistent. Cheapest Phase 6 step."
});

NEXT_TASKS.push({
  title: "Phase 6b · Merge plan and itinerary",
  tags: ["Claude Code","SQL"],
  section: "Phase 6 — AI-first",
  note: "Trip main view = plan view. Drop the Itinerary tab. Activity status enum: idea / planned / booked / confirmed (already in DB). Keep legacy support during migration.",
  why: "Removes a tab from the nav and reflects the AI-first pivot decided in v11."
});

NEXT_TASKS.push({
  title: "Phase 6c · Auto-create Decision when activities are contested",
  tags: ["Claude Code","SQL"],
  section: "Phase 6 — AI-first",
  note: "Contested activity → auto-create a poll. Admin can approve or members vote to confirm. Status indicators visible in plan view.",
  why: "Routes group friction into Decisions automatically — fixes the 'why are we polling about X?' confusion."
});

NEXT_TASKS.push({
  title: "Phase 6d · Cleanup — remove old wizard, migrate itinerary_items → ai_trip_plans",
  tags: ["Claude Code","SQL","Manual"],
  section: "Phase 6 — AI-first",
  note: "Remove TripNew page, retire onboarding wizard as a gate, migrate legacy itinerary_items into ai_trip_plans. Soft-deprecate the old table for one release.",
  why: "Last Phase 6 step; ships the AI-first model end-to-end."
});

// — Founder Command Center (Step 17 — admin tooling) —

NEXT_TASKS.push({
  title: "Step 17a · Feedback inbox with AI summaries and 'Send to Lovable' button",
  tags: ["Lovable"],
  section: "Step 17 — Admin",
  note: "List feedback. Filter by category/status/severity. Mark done. Show ai_summary + ai_fix from analyze-feedback. Button to copy a targeted Lovable fix prompt.",
  why: "The current admin dashboard reads feedback rows but doesn't surface AI fields — closing this loop is the cheapest dev-velocity win."
});

NEXT_TASKS.push({
  title: "Step 17b · Analytics dashboard (users, trips, retention, activation)",
  tags: ["Lovable"],
  section: "Step 17 — Admin",
  note: "Track activation: trip + 2 joins within 7 days. Adoption per feature. Retention by cohort. All from existing tables.",
  why: "Without this you're flying blind during soft launch."
});

NEXT_TASKS.push({
  title: "Step 17c · Cluster similar feedback + auto-generate Lovable prompt",
  tags: ["Lovable"],
  section: "Step 17 — Admin",
  note: "Group similar feedback rows. Button pre-fills a targeted Lovable fix prompt from the AI analysis.",
  why: "Pairs the inbox with the cluster view; only useful once 17a is in place."
});

NEXT_TASKS.push({
  title: "Step 17d · Health monitoring tile (rate freshness, AI cost today, DB size, edge function health)",
  tags: ["Lovable"],
  section: "Step 17 — Admin",
  note: "Status indicators with auto-refresh every 5 minutes.",
  why: "Sentry covers errors; this covers the slow burns (cost, freshness, capacity)."
});

NEXT_TASKS.push({
  title: "Step 17e · Weekly digest email (Monday 9am Dubai)",
  tags: ["Lovable","SQL"],
  section: "Step 17 — Admin",
  note: "SendGrid via process-email-queue. pg_cron at 05:00 UTC. Last 7 days stats + top feedback.",
  why: "Forces a weekly review cadence; also exercises the email pipeline at low risk."
});

// — Marketing pipeline (Step 5) —

NEXT_TASKS.push({
  title: "Clone marketingskills repo and create Junto product-marketing-context",
  tags: ["Claude Code"],
  section: "Marketing",
  note: "github.com/coreyhaines31/marketingskills. Create context with positioning, audience, tone, competitors. Reused across every marketing task below.",
  why: "Setup once, used by every subsequent marketing skill — pure leverage."
});

NEXT_TASKS.push({
  title: "Landing page copy pass (under-5-second value prop)",
  tags: ["WIP"],
  section: "Marketing",
  note: "Hero headline, subheadings, feature descriptions via copywriting skill. Target: under 5 seconds to communicate value.",
  why: "Landing UI is built; copy is the variable that decides conversion."
});

NEXT_TASKS.push({
  title: "3–5 SEO blog posts ('best group trip planning apps 2026' etc.)",
  tags: ["WIP"],
  section: "Marketing",
  note: "Use content skill. Topics: best group trip planning apps 2026, split expenses on group trip, AI trip planner comparison.",
  why: "Indexable surface area is the cheapest acquisition channel; takes weeks to rank, start now."
});

NEXT_TASKS.push({
  title: "2-week social content calendar (Instagram, TikTok, Reddit)",
  tags: ["WIP"],
  section: "Marketing",
  note: "Use social skill. Calendar covers launch week and the week after.",
  why: "Empty social during launch week kills the perception of momentum."
});

NEXT_TASKS.push({
  title: "Product Hunt launch prep — tagline, description, hunter, screenshots",
  tags: ["WIP"],
  section: "Marketing",
  note: "Use launch skill. Realistic outcome: 10–150 signups + DA91 backlink. Maker comment ready, hunter recruited.",
  why: "PH backlink alone is worth the work even at low signup numbers."
});

NEXT_TASKS.push({
  title: "20 personalised travel-blogger outreach emails",
  tags: ["WIP"],
  section: "Marketing",
  note: "Use cold-email skill. Target micro-influencers (10k–100k) over megas.",
  why: "Conversion rate on micros >> megas; this is the realistic top-of-funnel."
});

NEXT_TASKS.push({
  title: "Comparison pages — Junto vs Splitwise / Wanderlog / Layla / Mindtrip",
  tags: ["WIP"],
  section: "Marketing",
  note: "Use competitor skill. SEO-rich tables for high-intent search.",
  why: "Captures bottom-of-funnel comparison searchers who already want a tool like Junto."
});

NEXT_TASKS.push({
  title: "SEO audit of junto.pro once live",
  tags: ["WIP"],
  section: "Marketing",
  note: "Use seo-audit skill. Meta tags, page speed, structured data, sitemap, canonical URLs.",
  why: "One-shot pass that catches indexing breakers before launch traffic arrives."
});

NEXT_TASKS.push({
  title: "Publish: blog posts → 48h indexing → PH live → social → blogger outreach",
  tags: ["OPS"],
  section: "Marketing",
  note: "Don't publish all at once. Sequence is what builds the perception of a moment.",
  why: "Sequencing is everything for soft launches."
});

// — Affiliate revenue —

NEXT_TASKS.push({
  title: "Add affiliate booking CTAs to itinerary items",
  tags: ["Lovable"],
  section: "Affiliates",
  note: "Subtle 'Book on Booking.com' / 'Find activities on Viator' beneath items with a location. Helpful, not ad. Depends on affiliate sign-ups completing.",
  why: "Free revenue once Maps + affiliate sign-ups land; user value (not just monetisation)."
});

// — Junto Pro / Stripe (Phase 4) —

NEXT_TASKS.push({
  title: "Plan Stripe integration — DB and Edge Function audit",
  tags: ["Claude Code"],
  section: "Pro / monetisation",
  note: "stripe_customer_id exists. Identify additional columns, edge functions, RLS, and the 'one Pro user → group is Pro' rule.",
  why: "Plan-only step; no build until 500+ users validate demand."
});

NEXT_TASKS.push({
  title: "Build Stripe checkout + subscription management",
  tags: ["Claude Code","Lovable"],
  section: "Pro / monetisation",
  note: "Only after the plan above is reviewed. Checkout, webhook, customer portal edge functions + UI gates.",
  why: "Premature monetisation kills early acquisition; build only at scale."
});

// — Native app + post-launch —

NEXT_TASKS.push({
  title: "Wrap PWA in Capacitor (iOS + Android)",
  tags: ["Claude Code"],
  section: "Native app",
  note: "App ID pro.junto.app. Wraps existing React/Vite build. iOS + Android from same codebase.",
  why: "Push reliability + share-sheet + app store SEO; only worth it once retention is proven."
});

NEXT_TASKS.push({
  title: "Set up Capgo for OTA updates",
  tags: ["OPS"],
  section: "Native app",
  note: "Capgo enables instant OTA updates post-App Store launch. Set up day one of native.",
  why: "Without OTA every native bug needs an App Store review cycle."
});

NEXT_TASKS.push({
  title: "iOS lock-screen widget (hire iOS dev for 2-day job)",
  tags: ["Manual"],
  section: "Native app",
  note: "WidgetKit + SwiftUI + App Group. Days to trip, next item, balance.",
  why: "Distinctive iOS surface that no competitor has; only worth it post-native wrapper."
});

// — Friend search / live location / discovery (Phase 4) —

NEXT_TASKS.push({
  title: "Friend search — diagnose schema before building",
  tags: ["Claude Code"],
  section: "Friends & discovery",
  note: "Check: profiles searchable username field, existing user search RPC, current invite flow, pending invite data model.",
  why: "Diagnose-only step; cheap and informs the build later."
});

NEXT_TASKS.push({
  title: "Live location — diagnose Maps overlays + Realtime presence",
  tags: ["Claude Code","Lovable"],
  section: "Friends & discovery",
  note: "Check Maps marker overlays, Realtime presence channels, Capacitor background-geolocation plugins, ephemeral location data model.",
  why: "Pre-build investigation; live location depends on Maps + Native."
});

NEXT_TASKS.push({
  title: "Live location — UI + session controls",
  tags: ["Lovable"],
  section: "Friends & discovery",
  note: "'Share my location' button → session picker (30min/1hr/until stop). Pulsing avatar, countdown, member display.",
  why: "Surface for the data plane below."
});

NEXT_TASKS.push({
  title: "Live location — Realtime channel + ephemeral storage + auto-delete",
  tags: ["Claude Code"],
  section: "Friends & discovery",
  note: "live_locations table with expires_at. Realtime subscription. Auto-delete cron. Start/stop session RPC.",
  why: "Privacy-by-design: ephemeral by default, never historical."
});

NEXT_TASKS.push({
  title: "'Find my group' — distance + ETA",
  tags: ["Claude Code","Lovable"],
  section: "Friends & discovery",
  note: "Zoom map to all sharing members. Walking/driving distance + ETA via Directions API. Graceful fallback when offline.",
  why: "The moment-of-arrival use case that justifies live location."
});

NEXT_TASKS.push({
  title: "Capacitor background-geolocation plugin",
  tags: ["Claude Code"],
  section: "Friends & discovery",
  note: "@capacitor-community/background-geolocation. Significant-change updates only. iOS/Android permission handling.",
  why: "Required for live location to work when the app is backgrounded."
});

NEXT_TASKS.push({
  title: "Trip discovery — run Deep Research session before building",
  tags: ["Manual"],
  section: "Friends & discovery",
  note: "Trust & safety patterns, competitor analysis (Tripr, Fairytrail, Couchsurfing), moderation, legal liability before designing.",
  why: "Stranger-matching surface; high legal/T&S risk — research before code."
});

// — Enterprise & infra hardening (post-launch / on-demand) —

NEXT_TASKS.push({
  title: "GDPR data export (Article 20)",
  tags: ["Claude Code"],
  section: "Enterprise & GDPR",
  note: "Export profile, trips, expenses, itineraries as JSON/ZIP via authenticated edge function. Required for EU at scale.",
  why: "Required at scale; not blocking 0→100 but required before any real EU push."
});

NEXT_TASKS.push({
  title: "Org / team accounts (corporate travel)",
  tags: ["Lovable"],
  section: "Enterprise & GDPR",
  note: "Companies manage multiple trips with centralised billing. Build only with corporate demand.",
  why: "Demand-driven; do not build speculatively."
});

NEXT_TASKS.push({
  title: "Self-healing pipeline · Build E2E test suite first",
  tags: ["Claude Code"],
  section: "Self-healing",
  note: "Playwright suite covering: signup, create trip, expenses, invite. Pre-requisite for any auto-fix pipeline.",
  why: "Without tests there is no signal to gate auto-deploy on."
});

NEXT_TASKS.push({
  title: "Self-healing pipeline · Feedback → fix → deploy",
  tags: ["Claude Code"],
  section: "Self-healing",
  note: "High-confidence ticket → Claude Code generates PR → tests run → admin approval. Human in the loop.",
  why: "Compounding velocity once tests exist; do not skip the human gate."
});

// — Verifications & misc —

NEXT_TASKS.push({
  title: "Verify post-creation 'Invite your crew' moment is wired",
  tags: ["Verify","Lovable"],
  section: "Viral moments",
  note: "After trip creation, immediate invite screen with WhatsApp share. Verify deep-link opens the correct join URL on iOS + Android.",
  why: "Highest-leverage viral moment — must work."
});

NEXT_TASKS.push({
  title: "Expense entry — prompt to invite missing members when split count > member count",
  tags: ["Lovable"],
  section: "Viral moments",
  note: "If split is across more people than the trip has members, surface 'Invite missing members' instead of silently capping.",
  why: "Strong incentive to drag the rest of the group on-app at the moment of money-talk."
});

NEXT_TASKS.push({
  title: "Verify poll-closing-soon push notifications fire",
  tags: ["Verify","Claude Code"],
  section: "Viral moments",
  note: "Push notification when poll closing soon and member hasn't voted. Push infra is built; verify the trigger end-to-end.",
  why: "Polls without push are silent; the whole feature is wasted otherwise."
});

NEXT_TASKS.push({
  title: "Settle-up frictionless — deep links to Venmo / PayPal / bank per debt",
  tags: ["Lovable"],
  section: "Viral moments",
  note: "Show balance breakdown. Deep links keyed to currency / region. Person owed shares the request themselves.",
  why: "Settle-up is the natural exit-to-payment-app moment; making it one tap raises conversion."
});

NEXT_TASKS.push({
  title: "Trip list anonymous-draft persistence (cross-device)",
  tags: ["Claude Code"],
  section: "Acquisition polish",
  note: "Anonymous AI-generated drafts currently live client-side. Persist to a server-side draft store keyed by signup email so signup carries the draft over.",
  why: "Pairs with anonymous trip generation; without it the conversion to signup loses the work."
});

// ═══════════════════════════════════════════════════════════
// DEPRECATED / ON HOLD
// ═══════════════════════════════════════════════════════════

DEPRECATED.push({
  title: "Standalone Vibe Board page/tab",
  tags: ["Lovable"],
  note: "v11 Decision 1 — replaced by the AI Trip Builder input flow which captures vibes, budget, pace, and deal-breakers inline. Underlying preference data still feeds the builder; only the standalone surface is retired."
});

DEPRECATED.push({
  title: "Standalone Decisions / Polls top-level tab",
  tags: ["Lovable"],
  note: "v11 Decision 2 — demoted to contextual: created from itinerary or Ideas, surfaced as badges on trip home. Tab restructure (Trips | Itinerary | Ideas | Expenses) shipped; Decisions tab no longer in nav."
});

DEPRECATED.push({
  title: "TripNew page as a separate creation path",
  tags: ["Claude Code"],
  note: "v11 Decision 5 — AI Trip Builder is the single creation flow with manual mode as an option inside it. TripNew.tsx still exists in the codebase; final removal lives in Phase 6d above."
});

DEPRECATED.push({
  title: "Onboarding wizard as a gatekeeper",
  tags: ["Lovable"],
  note: "v11 Decision 4 — setup is contextual now (currency on first expense, invite from button, all tabs visible). The 4-step wizard remains as opt-in preference capture, not a gate. Gate-removal lives in Phase 6d."
});

DEPRECATED.push({
  title: "AI Copilot (agentic chat) — full build",
  tags: ["Claude Code"],
  note: "Spec written in v11 but post-launch only. Concierge phases A–D cover the conversational use cases without the autonomy/risk surface of a full agent."
});

DEPRECATED.push({
  title: "'Save from Social' (Instagram/TikTok import)",
  tags: ["Manual"],
  note: "Blocked on native app — requires share-sheet integration that PWAs don't have. Revisit after Capacitor wrap."
});

DEPRECATED.push({
  title: "Flexible group dates (find a window everyone can do)",
  tags: ["Claude Code"],
  note: "Listed as Tier 3 in v11; needs deep research before design — UX patterns are unproven. Re-open if a clear competitor pattern emerges."
});

DEPRECATED.push({
  title: "Content-creator video assets",
  tags: ["OPS"],
  note: "Post-launch marketing; covered by the cheaper 60-second demo video task in Launch ops."
});

DEPRECATED.push({
  title: "Trip Recommendations Phase 4 (community published trips)",
  tags: ["Lovable","Claude Code"],
  note: "Subsumed by the Templates Phase 5c task — same data model, single build."
});

DEPRECATED.push({
  title: "Phase 6 conceptual user-flow descriptions (9 numbered steps)",
  tags: ["Manual"],
  note: "Reference content rather than tasks. The implementable parts are captured as Phase 6a–6d above; the conceptual flow stays in docs/current-user-flow.md."
});

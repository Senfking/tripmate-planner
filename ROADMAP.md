# Junto — Product Roadmap

## Phase 1 — Foundation (Current)
Core trip planning features: trip dashboard, itinerary, expenses, bookings, decisions, AI concierge, Google Places integration, collaborative realtime editing.

## Phase 2 — Native App Wrapper
Ship iOS and Android apps via Capacitor. App Store and Play Store approval. Replace PWA install prompts with native download CTAs.

## Phase 2 — Junto AI Copilot (Pro Feature — Highest Impact)

> **DO NOT build this now.** Spec only. Build after launch once user feedback confirms which actions people actually want AI to take.

**PRIORITY:** Immediate post-launch, before Save from Social Media.
**BLOCKED BY:** Nothing technically. Validate core product first.
**COMPLEXITY:** Complex — 2–3 weeks with vibe coding.

### Vision

A persistent AI chat accessible from any screen. Unlike the existing concierge (venue discovery only), the Copilot reads app state and executes actions: modify itineraries, log expenses, answer questions about the trip, search for places, manage settings. It's Cursor for trip planning.

This is **THE Pro upsell feature.** Free users get a taste (limited actions/day). Pro users get unlimited. The value prop is clear: "Your AI trip assistant that actually does things, not just talks."

### Architecture

- **Pattern:** Function calling / tool use (not prompt engineering)
- **Tool set:** Defined tools that map to existing Supabase queries and mutations
- **Mutations:** Every mutation requires user confirmation before executing
- **Model tiers** based on query complexity:

| Tier | Use Case | Model | Est. Cost | Free | Pro |
|------|----------|-------|-----------|------|-----|
| 1 | Read-only queries | Haiku | ~$0.005/query | Unlimited | Unlimited |
| 2 | Single action with tools | Haiku + tools | ~$0.03/query | 10/day | Unlimited |
| 3 | Multi-step agentic | Sonnet | ~$0.15/query | 3/day | 20/day |

### Tool Set (Phased)

**v1 — Launch tools:**
- `get_itinerary`, `add_itinerary_item`, `move_itinerary_item`, `remove_itinerary_item`
- `get_expenses`, `add_expense`
- `get_trip_summary`
- `search_places` (reuses concierge pipeline)

**v2 — After validation:**
- `update_trip_settings`, `invite_member`, `create_poll`, `add_idea`, `get_balances`

**v3 — Power users:**
- `modify_expense`, `settle_up`, full itinerary restructuring

### UX Pattern

- Floating chat button (bottom-right) accessible from every screen
- Chat slides up as a **bottom sheet on mobile**, **side panel on desktop**
- **Context-aware:** Copilot knows which trip/day/expense the user is currently viewing
- **Mutation preview:** shows what it will do before doing it, with Accept/Edit/Cancel
- Conversation history persists per trip
- Quick action chips above the input: "Add expense", "Find restaurants", "What's the plan today?"

### Confirmation Flow for Mutations

```
User:    "Add a $50 dinner expense, I paid, split equally"

Copilot: ┌─────────────────────────────────┐
         │ Type:        Expense            │
         │ Amount:      $50.00 USD         │
         │ Description: Dinner             │
         │ Paid by:     You                │
         │ Split:       Equal (all members)│
         │                                 │
         │ [Confirm]  [Edit]  [Cancel]     │
         └─────────────────────────────────┘

User:    taps Confirm

Copilot: "Done. Your group's total spend is now $847."
```

### Cost Controls

- Auto-classify query tier before calling the model
- Cache frequent read queries (trip summary, balances) for 30 seconds
- Rate limit Tier 3 queries per user per day in Supabase (RLS + counter table)
- Show remaining quota to free users: "2 of 3 smart actions remaining today. Upgrade for unlimited."

### Implementation Notes

- **System prompts** stored as constants, not inline strings (per CLAUDE.md hard rules)
- **All LLM responses** validated against a schema before use
- **All AI calls** wrapped in try/catch with user-facing toast errors
- **Tool use support:** Check if Lovable's `ai.gateway` supports function calling; if not, call Anthropic API directly from Edge Functions
- Reuse existing concierge infrastructure for `search_places`
- Reuse existing expense/itinerary CRUD hooks for all mutation tools

### Dependencies

- Existing concierge infrastructure (`search_places`)
- Existing expense/itinerary CRUD hooks
- Anthropic API with tool use (Claude Haiku 4.5 for Tier 1/2, Claude Sonnet 4.6 for Tier 3)

---

## Phase 3 — Post-Native Features

### Save from Social Media

**PROBLEM:**
Users discover travel inspiration on Instagram, TikTok, Pinterest, and Reddit — cool cafes, hidden viewpoints, restaurants. Today they screenshot, copy-paste links, or forget about it. No travel app captures this inspiration flow. Whoever solves it owns the front of the trip planning funnel.

**USER FLOW:**
1. User sees a venue post on Instagram/TikTok
2. Taps Share → selects Junto from native share sheet
3. Junto extracts venue info (name, location, image) from the post
4. User picks: save to "Saved Spots" (general bucket), add to a specific trip, or add to a specific day
5. Pin appears on map, item appears in itinerary if assigned

**DEPENDENCIES:**
- Native iOS/Android app wrapper (Capacitor) must be live first. The Web Share Target API doesn't work on iOS Safari, and most travel inspiration is on iOS. Shipping web-only would leave the core use case broken.
- Google Places integration (already built) for venue verification

**TECHNICAL APPROACH:**

v1 — Saved Spots (after native wrapper):
- Register Junto as a share target in iOS and Android native wrappers
- Edge Function takes shared URL, fetches the page, extracts metadata
- Parsing pipeline:
  - Open Graph tags first (most posts have og:title, og:image, og:description)
  - Haiku to extract venue name + location from caption text
  - If geo-tag present, use it directly
  - Image OCR via vision model if venue only visible in image (storefront sign, etc)
  - Fallback: show raw post, let user type venue name manually
- Google Places lookup to verify and get canonical name, address, photo, rating
- Save to per-user "Saved Spots" table (works across all trips)
- "Add to trip" picker if user has multiple active trips

v2 — Smart enhancements:
- TikTok video frame extraction (vision model on key frames)
- Auto-suggest which trip to add to based on location matching (e.g. if saved venue is in Tokyo and user has a Tokyo trip, default to that)
- Detect duplicates ("you already saved this")
- Browser extension as alternative entry point for desktop users

v3 — AI-powered curation:
- "I saved 12 cafes for my Tokyo trip — build me a coffee crawl itinerary"
- Smart day assignment based on geographic clustering
- Auto-categorize saved spots (cafe, restaurant, viewpoint, activity, shopping)

**DATA MODEL:**

saved_spots table:
- id, user_id, source_url, source_platform (instagram/tiktok/pinterest/etc)
- google_place_id (nullable — manual entries may not match)
- venue_name, venue_address, venue_coordinates
- post_image_url, post_caption_excerpt
- user_note (optional)
- tags (array — auto-categorized)
- trip_id (nullable — can be saved without a trip)
- itinerary_day_id (nullable — can be assigned to specific day)
- created_at

**POSITIONING:**
This feature is a major competitive wedge. No major travel app (Layla, Wanderlog, Tripper, Google Travel) handles this well. It captures users at the inspiration moment, before they've even decided to plan a trip. Long-term: this feature could become Junto's primary acquisition channel.

**PRIORITY:** High — but blocked on native app wrapper. Schedule build immediately after Capacitor wrapper ships and is approved on App Stores.

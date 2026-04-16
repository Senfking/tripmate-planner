# Junto — Product Roadmap

## Phase 1 — Foundation (Current)
Core trip planning features: trip dashboard, itinerary, expenses, bookings, decisions, AI concierge, Google Places integration, collaborative realtime editing.

## Phase 2 — Native App Wrapper
Ship iOS and Android apps via Capacitor. App Store and Play Store approval. Replace PWA install prompts with native download CTAs.

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

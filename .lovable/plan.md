

## Unified Share & Invite Modal

### Overview
Merge `ShareModal` and `InviteModal` into a single `ShareInviteModal` component. Replace the two header buttons in `TripHome` with one "Share & Invite" button. Update `index.html` with generic Junto OG meta tags. Generate a branded OG image.

### Files to change
1. **`src/components/ShareInviteModal.tsx`** — New file, combines all logic
2. **`src/pages/TripHome.tsx`** — Single button + single modal
3. **`src/components/ShareModal.tsx`** — Delete
4. **`src/components/InviteModal.tsx`** — Delete
5. **`index.html`** — Update OG meta tags
6. **`public/og-default.png`** — Generate branded image (1200×630)

### ShareInviteModal design

Single `ResponsiveModal` with title "Share & Invite". Props: `tripId`, `tripName`, `open`, `onOpenChange`, `isAdmin`, `trip` (for dates/emoji).

**Data queries** (all from existing patterns):
- Active invite token (auto-create on open, same as current InviteModal)
- Active share token (auto-create on open)
- Trip code
- Route stops: `trip_route_stops` ordered by `start_date` — for WhatsApp message route line
- Member first names: `trip_members` → `profiles` (display_name), take first word, "Member" fallback — for WhatsApp message

**Section 1 — Invite to trip**
- Label: "INVITE TO TRIP" (uppercase tracking-wider, xs, muted)
- Subtext: "Add people as trip members"
- Truncated invite link input + copy icon button
- "Code: [trip_code]" muted text
- "Share invite via WhatsApp" — full-width green (#25D366) button
- "Revoke link" — small red text button (admin only)

**Separator**

**Section 2 — Share trip plan**
- Label: "SHARE TRIP PLAN" (same style)
- Subtext: "Share a view-only summary — no login needed"
- Switch: "Include expense summary" with description
- Truncated share link input + copy icon button
- "Expires on [date]" muted xs text
- "Share plan via WhatsApp" — full-width green button
- "Revoke link" — small red text button (admin only)

**Separator**

**Section 3 — Also export**
- Label: "ALSO EXPORT"
- Two equal-width outline buttons: Add to Calendar, Export CSV
- Same download logic as current ShareModal

### WhatsApp messages

Helper `buildMembersLine(names[], count)`:
- 0: omit
- 1: "Name is going"
- 2: "Name1 and Name2 are going"
- 3+: "Name1, Name2 and N others are going"

Helper `buildRouteLine(stops[])`:
- stops.length > 0: `"Route: " + stops.map(s => s.destination).join(" → ")`
- else: omit

**Invite message:**
```
Hey! Come plan [Trip Name] with us on Junto ✈️
[start] – [end]
[route line]
[members line]

Join the trip here:
[invite URL]

Or open Junto and enter code: [trip_code]
```

**Share plan message:**
```
[emoji] [Trip Name]
[start] – [end] · [N days]
[route line]
[members line]

See the full trip plan:
[share URL]

Want to join us?
[invite URL]

Planned with Junto 🗺️ juntotravel.lovable.app
```

Both messages: filter empty lines (no double newlines when route/members omitted).

### TripHome changes
- Remove `inviteOpen`, `shareOpen` states → single `shareInviteOpen`
- Remove `canInvite` gating on button visibility (any member can share/invite)
- Single button: `Share2` icon + "Share" text in the header pill
- Remove imports of `InviteModal`, `ShareModal`; import `ShareInviteModal`
- Pass `isAdmin={myRole === 'owner' || myRole === 'admin'}` for revoke-only gating

### index.html OG meta tags
Replace existing OG tags with:
```html
<meta property="og:title" content="Junto — Plan Trips Together" />
<meta property="og:description" content="Vote on destinations, build itineraries, and split expenses with your group." />
<meta property="og:image" content="/og-default.png" />
<meta property="og:type" content="website" />
```
Keep existing twitter:card tags, update twitter:image to `/og-default.png`.

### OG image
Generate `public/og-default.png`: 1200×630, teal gradient (#0D9488 → #0EA5E9), "Junto" white wordmark centered, "Plan trips together" tagline below.


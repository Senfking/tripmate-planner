

## Real-Time Enhancements: Highlight, Toasts, Live Indicator

Three additions to the realtime system, building on the `useTripRealtime` hook (to be created per the approved plan).

### Files to change

1. **`tailwind.config.ts`** — Add `realtime-flash` keyframe (teal bg fading out over 1.5s)
2. **New: `src/hooks/useTripRealtime.ts`** — Extend with insert tracking, activity toasts, and connection status
3. **New: `src/hooks/useRealtimeHighlight.ts`** — Tiny hook returning a Set of recently-inserted record IDs; cards check membership to apply flash class
4. **`src/components/itinerary/ItineraryItemCard.tsx`** — Accept `isNew` prop, apply `animate-realtime-flash` class
5. **`src/components/expenses/ExpenseCard.tsx`** — Same `isNew` prop + flash class
6. **`src/components/bookings/AttachmentCard.tsx`** — Same pattern
7. **`src/components/itinerary/ItemComments.tsx`** — Flash on new comment rows
8. **`src/pages/TripSection.tsx`** — Add live connection indicator in header
9. **`src/components/itinerary/ItineraryTab.tsx`** — Pass `newItemIds` down to cards
10. **`src/components/expenses/ExpensesTab.tsx`** — Pass `newItemIds` down to cards
11. **`src/components/bookings/BookingsTab.tsx`** — Pass `newItemIds` down to cards

---

### 1. Tailwind keyframe — `realtime-flash`

```
"realtime-flash": {
  "0%": { backgroundColor: "rgba(13, 148, 136, 0.15)" },
  "100%": { backgroundColor: "transparent" }
}
```
Animation: `"realtime-flash": "realtime-flash 1.5s ease-out forwards"`

### 2. `useTripRealtime` hook design

The hook (from the approved realtime plan) will be extended with three additional responsibilities:

**A. Insert tracking for highlights**
- Maintain a `newIds` Set (via React state) of record IDs from INSERT events where `payload.new.user_id !== currentUserId` (or no user_id column — skip highlight)
- After 2s, remove each ID from the set (auto-cleanup via setTimeout)
- Expose `newItemIds: Set<string>` from the hook

**B. Activity toasts**
- On INSERT from another user on `itinerary_items`, `attachments`, `expenses`, `trip_route_stops`, `votes`:
  - Throttle: max one toast per 5 seconds (track `lastToastAt` timestamp)
  - Fetch display_name from profiles cache (use queryClient's cached profiles data, or a quick `.from('profiles').select('display_name').eq('id', userId).single()`)
  - Show toast: `"[Name] added an activity"` / `"added a booking"` / `"added an expense"` / `"confirmed a stop"` / `"cast a vote"`
  - Use the existing `toast()` from `@/hooks/use-toast`

**C. Connection status**
- Track Supabase channel status via the `.subscribe((status) => ...)` callback
- Map to three states: `"connected"` | `"reconnecting"` | `"disconnected"`
- Supabase client handles reconnection with backoff internally; we just reflect the status
- Expose `connectionStatus` from the hook

### 3. Live indicator in TripSection header

After the section title in the header, render a small status pill:
- **Connected**: 6px green dot (`#10B981`) with `animate-pulse` + "Live" text (text-xs, text-muted-foreground)
- **Reconnecting**: 6px amber dot (`#F59E0B`) + "Reconnecting..." 
- **Disconnected**: 6px grey dot (`#94A3B8`) + "Offline"

Positioned inline after the h1, right-aligned using `ml-auto`.

### 4. Card highlight pattern

Each card component gets an optional `isNew?: boolean` prop. When true, the outer container div gets an additional `animate-realtime-flash` class. The parent tab components receive `newItemIds` from the realtime hook and pass `isNew={newItemIds.has(item.id)}` to each card.

### Data flow

```text
useTripRealtime(tripId)
  ├── newItemIds: Set<string>     → passed to Tab components → cards
  ├── connectionStatus: string    → used in TripSection header
  └── (internal) toast triggers   → fires toast() directly
```

### Database change

None — realtime publication is handled by the parent realtime plan's migration.


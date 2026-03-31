

# My Account Screen Redesign

## Overview
Six changes to the My Account screen plus fixing 5 edge function TypeScript build errors (`'err' is of type 'unknown'`).

## Build Error Fixes (prerequisite)

Cast `err` to `Error` in catch blocks across 5 edge functions:
- `export-expenses-csv/index.ts` line 136: `(err as Error).message`
- `export-trip-ics/index.ts` line 127: `(err as Error).message`
- `fetch-link-preview/index.ts` line 239: `(e as Error).message`
- `public-trip-share-view/index.ts` line 254: `(err as Error).message`
- `refresh-exchange-rates/index.ts` lines 59+61: `(err as Error).message` (and keep `err` in console.error on line 59)

## Database Migration

Create a `feedback` table with RLS (users insert own rows only):

```sql
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  body text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_insert_own" ON public.feedback
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "feedback_select_own" ON public.feedback
  FOR SELECT TO authenticated USING (user_id = auth.uid());
```

## Changes to `src/pages/More.tsx`

### Change 1 — Remove "Change profile photo" row + add crop UI
- Delete the `<SettingRow icon={ImageIcon} label="Change profile photo" .../>` row (line 370).
- Remove `ImageIcon` from imports.
- After file selection, instead of immediately uploading, show a crop drawer:
  - Load the selected image into an offscreen `Image`, draw onto a canvas.
  - Display a square crop preview with drag-to-pan and pinch-to-zoom (touch events + mouse drag).
  - "Save" button crops to 512×512 square, converts to JPEG blob, uploads to storage.
  - "Cancel" closes the drawer without uploading.
- New state: `cropFile`, `showCropDrawer`. New helper component `AvatarCropDrawer` rendered inline or as a subcomponent.

### Change 2 — Hide password/email for Google users
- On mount, call `supabase.auth.getUser()` and read `user.app_metadata.provider`.
- Store in state: `authProvider`.
- If `authProvider === "google"`:
  - Hide "Change password" and "Change email" `SettingRow` entries.
  - Show `<p className="text-xs text-muted-foreground mt-1">Signed in with Google</p>` below the email in the profile header.
- Otherwise show both rows as normal.

### Change 3 — Stats card
- Add a new `useEffect` that runs two queries:
  1. `supabase.from("trip_members").select("id", { count: "exact", head: true }).eq("user_id", userId)` → trip count.
  2. `supabase.from("trip_members").select("user_id, trip_id")` for all trips the user is in, then count distinct other user_ids. This requires fetching trip_ids first, then all members of those trips. Use two sequential queries.
- Display between profile header and Account Settings card:
  ```
  <Card>
    <CardContent className="p-4 flex items-center justify-around">
      <div className="text-center">
        <p className="text-lg font-bold">4</p>
        <p className="text-xs text-muted-foreground">✈️ Trips</p>
      </div>
      <div className="h-8 w-px bg-border" />
      <div className="text-center">
        <p className="text-lg font-bold">6</p>
        <p className="text-xs text-muted-foreground">👥 Travelled with</p>
      </div>
    </CardContent>
  </Card>
  ```

### Change 4 — Invite friends with WhatsApp + referral count
- Replace the referral section content:
  1. Keep referral code pill + copy button row.
  2. Add referral count: query `supabase.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", userId)`. Display "🎉 N friends joined" or "No friends joined yet".
  3. Two buttons side by side:
     - WhatsApp (green bg, white text): `window.open("https://wa.me/?text=...")`. Use the WhatsApp share URL with the user's referral code.
     - Copy link (outline): copies `https://juntotravel.app/join?ref=[CODE]`, shows "Copied!" toast.

### Change 5 — App version + feedback footer
- Below Danger Zone (and the "Join a trip" link), add:
  ```
  <p className="text-center text-xs text-muted-foreground">
    Junto · v0.1 · <button onClick={openFeedbackDrawer}>Send feedback →</button>
  </p>
  ```
- New Feedback Drawer with:
  - Textarea ("What's on your mind?")
  - Star rating (1–5) using 5 clickable star icons
  - Submit button that inserts into `feedback` table
  - State: `showFeedbackDrawer`, `feedbackBody`, `feedbackRating`, `submittingFeedback`

### Change 6 — Sign out prominence
- Move the Sign Out button out of the Danger Zone collapsible.
- Place it just above the footer version row as a full-width outline button with red text:
  ```
  <Button variant="outline" className="w-full text-destructive border-destructive/30" onClick={handleSignOut}>
    <LogOut className="h-4 w-4 mr-2" /> Sign out
  </Button>
  ```
- Remove the "Sign out" row from inside the Danger Zone (keep "Sign out all devices" and "Delete account" there).

## Files to change

| Action | File |
|--------|------|
| Rewrite | `src/pages/More.tsx` |
| Fix | `supabase/functions/export-expenses-csv/index.ts` |
| Fix | `supabase/functions/export-trip-ics/index.ts` |
| Fix | `supabase/functions/fetch-link-preview/index.ts` |
| Fix | `supabase/functions/public-trip-share-view/index.ts` |
| Fix | `supabase/functions/refresh-exchange-rates/index.ts` |
| Migration | Create `feedback` table |


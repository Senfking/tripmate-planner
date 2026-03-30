

# My Account Screen — Implementation Plan

## Overview
Replace the minimal More.tsx with a full-featured My Account page (7 sections), update AuthContext to expose extended profile fields, update the header avatar, create an avatars storage bucket, and add a delete-account edge function.

## Files to change/create

| Action | File |
|--------|------|
| Rewrite | `src/pages/More.tsx` |
| Edit | `src/contexts/AuthContext.tsx` |
| Edit | `src/components/AppLayout.tsx` |
| Create | `supabase/functions/delete-account/index.ts` |
| Migration | Create `avatars` storage bucket + RLS policies |

## Database Migration

Create public `avatars` storage bucket with owner-only write, public read:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Avatar public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Avatar owner insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatar owner update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatar owner delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
```

## 1. AuthContext Update

Extend `Profile` type to include `avatar_url`, `default_currency`, `subscription_tier`, `notification_preferences`, `referral_code`. Update the `select` query to fetch all these fields. Add a `refreshProfile()` method so the More page can re-fetch after updates.

## 2. AppLayout Header Avatar

Replace the `UserCircle` icon in the header with:
- If `profile.avatar_url` exists: circular `<img>` (22px)
- Otherwise: initials from `display_name` or email first letter, white text on white/20 bg

## 3. More.tsx — Full Rewrite

Seven sections stacked vertically on the `#F1F5F9` background:

**Section 1 — Profile Header**: 80px Avatar (image or initials fallback), camera badge for photo upload, display name, email, plan badge (Free grey / Pro teal).

**Section 2 — Account Settings**: Card with chevron rows:
- Edit display name: inline input with save, updates `profiles.display_name`
- Change profile photo: file input (images only), canvas resize to 512x512, upload to `avatars/{uid}/avatar.jpg`, update `profiles.avatar_url`
- Default currency: opens `CurrencyPicker`, saves to `profiles.default_currency`
- Change password: calls `supabase.auth.resetPasswordForEmail()`, shows toast
- Change email: bottom sheet with email input, calls `supabase.auth.updateUser({ email })`, shows toast

**Section 3 — My Plan**: Card showing tier name. "Upgrade to Pro" or "Manage subscription" button, both disabled with "Coming soon" toast.

**Section 4 — Notifications**: Card with Switch toggles for 5 notification keys, reading/writing `profiles.notification_preferences` jsonb. Note about push coming soon.

**Section 5 — My Trips**: Query `trip_members` joined with `trips` for the current user. Show up to 5 rows (emoji + name + role badge). "See all trips" link if more.

**Section 6 — Referral**: Card showing `profiles.referral_code` in monospace pill with copy button. Toast on copy.

**Section 7 — Danger Zone**: Collapsible (red label, collapsed by default).
- Sign out all devices: `supabase.auth.signOut({ scope: 'global' })`
- Sign out: existing logic
- Delete account: confirm bottom sheet. Check sole ownership via query. If clear, require email confirmation, then call `delete-account` edge function.

## 4. Edge Function: `delete-account`

`supabase/functions/delete-account/index.ts`:
- CORS headers
- Validate JWT from Authorization header
- Create service-role Supabase client
- Check if user is sole owner of any trips (query `trip_members` where role='owner' and no other owner exists)
- If sole owner: return 400 with trip names
- Otherwise: call `supabase.auth.admin.deleteUser(userId)`
- Return 200 success

## Technical Details

- Avatar resize uses an offscreen `<canvas>` element, draws image at max 512x512 maintaining aspect ratio, exports as JPEG
- Notification preferences are read/written as a JSON object on `profiles.notification_preferences` using a single `update` call with optimistic UI
- My Trips query: `supabase.from('trip_members').select('role, trips(id, name, emoji)').eq('user_id', uid).limit(6)` — show 5, use 6th to know if "See all" is needed
- All profile updates use `supabase.from('profiles').update({...}).eq('id', uid)` followed by `refreshProfile()`


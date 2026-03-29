

## Admin Tab — Add Share Permissions Setting

### Summary
Add a "Trip Settings" section to the Admin tab with a toggle controlling who can generate share/invite links. Store as a new `share_permission` column on the `trips` table.

### Database Migration
Add column to `trips`:
```sql
ALTER TABLE public.trips
ADD COLUMN share_permission text NOT NULL DEFAULT 'all';
```
Values: `'all'` (anyone) or `'admin'` (admins/owner only).

### Files to create/modify

1. **`src/components/admin/AdminTab.tsx`** (new) — Full admin tab with:
   - **Members section**: list members with profiles join, role badges, action menus (promote/demote/remove via security definer functions)
   - **Trip Settings section**: radio group or switch for share permission (`all` vs `admin`). Updates `trips.share_permission` via supabase update. Only visible to owner/admins.
   - **Trip Info section**: trip code (copy), created date, counts for items/attachments/expenses
   - **Danger Zone**: collapsible red-bordered section with Leave Trip (non-owners) and Delete Trip (owner, requires typing trip name)

2. **`src/components/admin/MemberRow.tsx`** (new) — Member row with avatar, name, role badge, dropdown actions

3. **`src/components/admin/DeleteTripDialog.tsx`** (new) — AlertDialog requiring trip name typed to confirm

4. **`src/pages/TripHome.tsx`** — Replace `tabPlaceholder("Admin")` with `<AdminTab tripId={trip.id} myRole={myRole} tripName={trip.name} />`

5. **`src/components/ShareInviteModal.tsx`** — Check `trip.share_permission`: if `'admin'` and user is not admin/owner, show a message instead of the invite/link generation UI. The `trip` prop already comes from the parent; we just need to read the new field.

### Security (DB functions via migration)

Two new `SECURITY DEFINER` functions:
- **`update_member_role(trip_id, target_user_id, new_role)`** — validates caller is owner (for admin promotion) or admin/owner (for demotion to member). Prevents demoting sole owner.
- **`remove_trip_member(trip_id, target_user_id)`** — validates caller is admin/owner, target is not owner, and caller is not removing themselves if sole owner.

These bypass the `trip_members_update_own` RLS policy which only allows users to update their own row.

### Technical details
- Share permission toggle: `supabase.from('trips').update({ share_permission: value }).eq('id', tripId)` — allowed by existing `trips_update_member` RLS
- Member list query: `trip_members` select with manual profile lookup (separate query on `profiles` by user IDs)
- Delete trip: `supabase.from('trips').delete().eq('id', tripId)` — protected by `trips_delete_admin` RLS (admin/owner only)
- Leave trip: call `remove_trip_member` function on self, or direct delete on own `trip_members` row (allowed by existing delete policy for admins, needs a self-leave function for regular members)


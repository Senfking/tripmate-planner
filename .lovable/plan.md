

## Authentication for Junto

### Database migration

1. **Create `profiles` table** with `id` (UUID, FK to auth.users ON DELETE CASCADE), `display_name` (text), `created_at`, `updated_at`
2. **RLS**: authenticated users can SELECT all profiles, UPDATE own profile only
3. **Trigger**: auto-create profile row on signup (display_name from `raw_user_meta_data->>'display_name'`)

### New files

| File | Purpose |
|------|---------|
| `src/contexts/AuthContext.tsx` | Auth provider wrapping the app — exposes `user`, `profile`, `loading`, `signIn`, `signUp`, `signOut` via context. Uses `onAuthStateChange` + `getSession`. Fetches profile from `profiles` table. |
| `src/components/ProtectedRoute.tsx` | Wrapper that redirects to `/login` if not authenticated (checks context, not localStorage). |
| `src/pages/Login.tsx` | Email + password form, link to `/signup`, error messages, loading spinner. |
| `src/pages/Signup.tsx` | Email + password + display name form, link to `/login`. Passes `display_name` in `options.data` on `signUp`. |

### Modified files

| File | Change |
|------|--------|
| `src/App.tsx` | Wrap with `AuthProvider`. Move app pages under `/app/*` with `ProtectedRoute`. Add public routes `/login`, `/signup`. Redirect `/` to `/app/trips`. |
| `src/components/AppLayout.tsx` | Show user display name in header. |
| `src/components/AppSidebar.tsx` | Update nav links to `/app/*` paths. |
| `src/components/BottomNav.tsx` | Update nav links to `/app/*` paths. |
| `src/pages/More.tsx` | Show display name + logout button (calls `signOut`, navigates to `/login`). |

### Auth configuration

- Call `cloud--configure_auth` to **enable auto-confirm** so users can sign in immediately after signup (no email verification friction during development). *(User can turn this off later for production.)*

### Route structure

```text
/login          — public
/signup         — public
/share/:token   — public (placeholder)
/app/trips      — protected (via ProtectedRoute)
/app/decisions  — protected
/app/itinerary  — protected
/app/expenses   — protected
/app/more       — protected
/               — redirect to /app/trips
```

### Key details

- `signUp` passes `{ data: { display_name } }` so the trigger can read it from `raw_user_meta_data`
- No localStorage for auth gating — purely `supabase.auth.onAuthStateChange` + session
- Navigation after login/signup uses `react-router-dom` `useNavigate` (no full reload)
- Forms use the existing teal gradient button styling
- 10 files total changed/created


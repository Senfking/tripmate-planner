

# Founder Admin Dashboard — Implementation Plan

## Critical Architecture Decision: RLS Bypass

Most tables (trips, expenses, itinerary_items, trip_members, feedback, analytics_events) have RLS policies that restrict reads to trip members or own rows only. The admin dashboard needs aggregate access to ALL data. 

**Solution**: Create a single Edge Function `admin-query` that uses the **service role key** to bypass RLS. It accepts a `query_type` parameter and returns pre-computed aggregates. The frontend calls this function for every data need. The Edge Function itself validates that the caller's user ID matches `ADMIN_USER_ID` (stored as a secret).

This is more secure than adding broad RLS policies — the admin bypass is isolated to one function with explicit authorization.

---

## Database Migration

Add two columns needed for admin notes:

```sql
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_notes text;
```

---

## Edge Function: `admin-query`

Single function handling ~20 query types. Validates caller is admin via a secret `ADMIN_USER_ID`. Returns JSON for each query type:

- `dashboard_kpis` — aggregated counts for all 8 KPI cards
- `user_growth_chart` — daily signups for period
- `recent_activity` — union of recent profiles/trips/feedback/ai events
- `acquisition_stats` — landing views, conversions, UTM breakdown
- `acquisition_funnel` — stage counts for funnel
- `ai_usage_summary` — per-feature call counts, success rates, unique users
- `ai_usage_daily` — daily stacked data
- `ai_power_users` — top 10 users by AI calls
- `all_users` — paginated user list with search/sort
- `user_detail` — single user full profile + stats
- `retention_activation` — activation rates
- `retention_cohorts` — weekly cohort data
- `retention_dormant` — users with no trips after 14d
- `referral_leaderboard` — top referrers
- `referral_chain` — all referred users
- `engagement_dau_wau_mau` — activity-based active user counts
- `engagement_activity_chart` — daily activity by type
- `engagement_top_trips` — most active trips
- `engagement_distribution` — user trip count histogram
- `feature_adoption` — per-trip feature adoption rates
- `feedback_list` — all feedback with user info
- `feedback_update` — update status/admin_notes (write operation)
- `profile_update_notes` — update profiles.admin_notes (write operation)
- `system_status` — exchange rate freshness, backlog counts
- `weekly_digest` — all data for digest generation

Each query accepts a `period` parameter (7d/30d/90d/all).

---

## New Secret

Store `ADMIN_USER_ID` as a Supabase secret so the Edge Function can verify the caller.

---

## Environment Variable

Add `VITE_ADMIN_USER_ID` to `.env` for client-side route gating (visual only — real security is in the Edge Function).

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/admin-query/index.ts` | Edge Function — all admin data queries |
| `src/pages/Admin.tsx` | Route wrapper with auth gate + sidebar + content router |
| `src/hooks/useAdminQuery.ts` | Hook wrapping Edge Function calls with React Query |
| `src/components/admin-dashboard/AdminSidebar.tsx` | Fixed left sidebar navigation |
| `src/components/admin-dashboard/AdminShell.tsx` | Layout shell (sidebar + content) |
| `src/components/admin-dashboard/DashboardOverview.tsx` | KPI cards + growth chart + activity feed |
| `src/components/admin-dashboard/AcquisitionModule.tsx` | Funnel, UTM breakdown, referral chart |
| `src/components/admin-dashboard/AIUsageModule.tsx` | AI feature table, daily chart, power users, cost estimator |
| `src/components/admin-dashboard/AllUsersModule.tsx` | User table + detail drawer |
| `src/components/admin-dashboard/RetentionModule.tsx` | Activation rates, cohorts, dormant users |
| `src/components/admin-dashboard/ReferralsModule.tsx` | Leaderboard + chain + chart |
| `src/components/admin-dashboard/EngagementModule.tsx` | DAU/WAU/MAU, activity chart, top trips, distribution |
| `src/components/admin-dashboard/FeatureAdoptionModule.tsx` | Adoption progress bars + module toggles |
| `src/components/admin-dashboard/FeedbackInbox.tsx` | Inbox list + detail panel |
| `src/components/admin-dashboard/SystemStatus.tsx` | Status cards with auto-refresh |
| `src/components/admin-dashboard/WeeklyDigest.tsx` | Auto-generated prose report |
| `src/components/admin-dashboard/shared.tsx` | Shared components: StatCard, DateRangeFilter, StatusPill, AdminSkeleton |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add lazy `/admin` route (protected, outside AppLayout) |
| `index.html` | Add IBM Plex Mono + IBM Plex Sans Google Fonts link |

---

## Implementation Approach

1. **Migration** — add `admin_notes` columns to feedback and profiles
2. **Secret** — set `ADMIN_USER_ID` secret
3. **Edge Function** — build `admin-query` with all query types using service role SQL
4. **Shared components** — StatCard, DateRangeFilter, StatusPill with the dark command-center design tokens (inline styles/classes, not modifying Tailwind config)
5. **Hook** — `useAdminQuery` wrapping `supabase.functions.invoke("admin-query", { body: { type, period, ... } })`
6. **Modules** — build each of the 11 modules as standalone components
7. **Shell + routing** — AdminSidebar + content area with internal state-based routing (no nested React Router — just a `activeModule` state)
8. **App.tsx** — add the `/admin` route

The dark design system will use inline Tailwind classes with arbitrary values (e.g. `bg-[#0b0e0e]`, `text-[#e8f0ef]`) to avoid polluting the main app's design tokens. IBM Plex fonts loaded via Google Fonts `<link>` in index.html.

All charts use recharts (already available). Empty states rendered for all modules. Loading skeletons shown during data fetches.


-- =============================================================================
-- seed_demo_trip — diagnostic queries
--
-- Drop these into the Lovable Cloud SQL panel one block at a time to verify
-- what's actually in the DB after running seed_demo_trip(). Each block is a
-- standalone SELECT — they don't mutate anything.
--
-- Substitute the trip_id below if you're checking a different trip.
-- =============================================================================

-- 0. The trip itself + key fields the seed depends on
SELECT
  id,
  trip_name,
  status,
  settlement_currency,
  tentative_start_date,
  tentative_end_date
FROM public.trips
WHERE id = 'c6362e4f-2a76-41a7-aed1-5518795447e5';


-- 1. Members on the trip (should include the 3 demo personas after seeding)
SELECT
  tm.role,
  tm.attendance_status,
  tm.user_id,
  p.display_name,
  CASE WHEN au.id IS NULL THEN 'MISSING auth.users row' ELSE 'ok' END AS auth_user_status
FROM public.trip_members tm
LEFT JOIN public.profiles p ON p.id = tm.user_id
LEFT JOIN auth.users au ON au.id = tm.user_id
WHERE tm.trip_id = 'c6362e4f-2a76-41a7-aed1-5518795447e5'
ORDER BY tm.role, tm.joined_at;


-- 2. Demo personas — confirm auth.users + profiles exist for the 3 deterministic UUIDs
SELECT
  au.id,
  au.email,
  p.display_name,
  p.avatar_url,
  CASE WHEN p.id IS NULL THEN 'NO PROFILE' ELSE 'ok' END AS profile_status
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE au.id IN (
  '11111111-1111-4111-8111-aaaaaaaaaaa1',  -- Aisha
  '22222222-2222-4222-8222-aaaaaaaaaaa2',  -- Marcus
  '33333333-3333-4333-8333-aaaaaaaaaaa3'   -- Priya
);


-- 3. ai_trip_plans rows for the trip (this is what the Group Activity panel
--    is keyed by; the seed loops over every row here)
SELECT id, created_at, created_by
FROM public.ai_trip_plans
WHERE trip_id = 'c6362e4f-2a76-41a7-aed1-5518795447e5'
ORDER BY created_at DESC;


-- 4. Group Activity panel data — comments + reactions across ALL plans for the trip
--    (the panel filters by the planId in the URL; this aggregates across plans
--    so you can see if some plans have data and others don't)
SELECT
  ap.id AS plan_id,
  count(c.id) FILTER (WHERE c.activity_key = 'trip-general') AS general_comments,
  count(c.id) FILTER (WHERE c.activity_key <> 'trip-general') AS activity_comments,
  count(r.id) AS reactions
FROM public.ai_trip_plans ap
LEFT JOIN public.plan_activity_comments  c ON c.plan_id = ap.id
LEFT JOIN public.plan_activity_reactions r ON r.plan_id = ap.id
WHERE ap.trip_id = 'c6362e4f-2a76-41a7-aed1-5518795447e5'
GROUP BY ap.id
ORDER BY ap.id;


-- 5. Attachments on the trip (Bookings tab reads this; should show the 7 demo rows)
SELECT
  a.id,
  a.type,
  a.title,
  a.is_private,
  a.created_by,
  p.display_name AS uploaded_by,
  a.file_path,
  a.url,
  a.booking_data IS NOT NULL AS has_booking_data,
  a.created_at
FROM public.attachments a
LEFT JOIN public.profiles p ON p.id = a.created_by
WHERE a.trip_id = 'c6362e4f-2a76-41a7-aed1-5518795447e5'
ORDER BY a.created_at DESC;


-- 6. Trip ideas + vote counts (Ideas tab; should show the 8 demo ideas with non-zero votes)
SELECT
  i.id,
  i.title,
  i.category,
  i.created_by,
  p.display_name AS proposed_by,
  count(v.id) AS vote_count
FROM public.trip_ideas i
LEFT JOIN public.profiles p ON p.id = i.created_by
LEFT JOIN public.trip_idea_votes v ON v.idea_id = i.id
WHERE i.trip_id = 'c6362e4f-2a76-41a7-aed1-5518795447e5'
GROUP BY i.id, p.display_name
ORDER BY vote_count DESC, i.created_at;


-- 7. Expenses on the trip (should show the 7 demo expenses)
SELECT
  e.id,
  e.title,
  e.amount,
  e.currency,
  e.category,
  e.split_type,
  e.payer_id,
  p.display_name AS paid_by,
  e.incurred_on
FROM public.expenses e
LEFT JOIN public.profiles p ON p.id = e.payer_id
WHERE e.trip_id = 'c6362e4f-2a76-41a7-aed1-5518795447e5'
ORDER BY e.incurred_on, e.created_at;


-- 8. Polls on the trip (should show the demo brunch poll + 3 votes)
SELECT
  po.title AS poll_title,
  po.type,
  po.status,
  opt.label AS option_label,
  count(v.id) AS votes
FROM public.polls po
LEFT JOIN public.poll_options opt ON opt.poll_id = po.id
LEFT JOIN public.votes v ON v.poll_option_id = opt.id
WHERE po.trip_id = 'c6362e4f-2a76-41a7-aed1-5518795447e5'
GROUP BY po.id, po.title, po.type, po.status, opt.id, opt.label, opt.sort_order
ORDER BY po.created_at, opt.sort_order;


-- 9. Sanity: which version of the seed function is currently installed?
--    Look for v4 markers in the function body. If "FOR _plan_id IN" appears,
--    you have the per-plan loop fix; if it doesn't, you have v2/v3 (single-plan).
SELECT
  position('FOR _plan_id IN' IN pg_get_functiondef(p.oid)) > 0 AS has_per_plan_loop,
  position('booking_data' IN pg_get_functiondef(p.oid)) > 0   AS inserts_attachments,
  octet_length(pg_get_functiondef(p.oid))                     AS function_body_bytes
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'seed_demo_trip';

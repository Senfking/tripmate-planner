-- Enable REPLICA IDENTITY FULL across all realtime-subscribed tables.
--
-- Without REPLICA IDENTITY FULL, Postgres only broadcasts the primary key on
-- DELETE events. Two failure modes result:
--
--   1. Filtered subscriptions (filter: trip_id=eq.X or plan_id=eq.X): the
--      filter column is absent from the DELETE payload, so Supabase never
--      delivers the event to subscribers. Remote deletes become invisible
--      until the next query refetch (e.g. tab focus).
--
--   2. Unfiltered subscriptions: DELETE events are delivered but oldRecord
--      only contains the primary key. Any code that reads user_id /
--      created_by / payer_id from oldRecord for toast attribution gets null,
--      so "Someone removed…" toasts don't fire.
--
-- itinerary_items and itinerary_attendance were already fixed in migration
-- 20260330163524. This migration covers every remaining subscribed table.
--
-- Filtered-subscription tables (failure mode 1 — silent event drop):
ALTER TABLE public.expenses           REPLICA IDENTITY FULL;
ALTER TABLE public.attachments        REPLICA IDENTITY FULL;
ALTER TABLE public.vibe_responses     REPLICA IDENTITY FULL;
ALTER TABLE public.comments           REPLICA IDENTITY FULL;
ALTER TABLE public.trip_route_stops   REPLICA IDENTITY FULL;
ALTER TABLE public.trip_members       REPLICA IDENTITY FULL;
ALTER TABLE public.shared_items       REPLICA IDENTITY FULL;
ALTER TABLE public.plan_activity_comments   REPLICA IDENTITY FULL;
ALTER TABLE public.plan_activity_reactions  REPLICA IDENTITY FULL;

-- Unfiltered-subscription tables (failure mode 2 — broken toast attribution):
ALTER TABLE public.expense_splits     REPLICA IDENTITY FULL;
ALTER TABLE public.votes              REPLICA IDENTITY FULL;
ALTER TABLE public.date_option_votes  REPLICA IDENTITY FULL;
ALTER TABLE public.proposal_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.concierge_reactions REPLICA IDENTITY FULL;

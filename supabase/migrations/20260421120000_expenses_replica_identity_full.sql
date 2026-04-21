-- Enable REPLICA IDENTITY FULL on tables that use trip_id-filtered realtime
-- subscriptions, so DELETE events broadcast the full old row (including
-- trip_id). Without this, Postgres only broadcasts the primary key on DELETE,
-- meaning the filter `trip_id=eq.<id>` in useTripRealtime never matches and
-- remote deletes are silently dropped.
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.attachments REPLICA IDENTITY FULL;

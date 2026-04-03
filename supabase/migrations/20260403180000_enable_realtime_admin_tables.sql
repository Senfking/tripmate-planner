-- Enable Supabase Realtime for admin_notifications and feedback tables
-- so the admin dashboard can receive instant updates via realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.admin_notifications,
  public.feedback;

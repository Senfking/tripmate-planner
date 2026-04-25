-- Loosen the expenses INSERT policy that was tightened in
-- 20260402170000_security_hardening.sql.
--
-- The hardened policy required the inserter to be the payer (or admin/owner),
-- which broke the standard "Alice paid, split with the group" flow: any non-
-- admin trip member trying to record an expense paid by someone else was
-- rejected with "new row violates row-level security policy for table expenses".
--
-- The expense form already lets any trip member pick any other member as the
-- payer, and splits (not the payer field) are the source of truth for who owes
-- whom. Restrict to: caller is a trip member AND named payer is also a trip
-- member. UPDATE/DELETE keep the stricter policy from the hardening migration.

DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;

CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND public.is_trip_member(trip_id, payer_id)
  );

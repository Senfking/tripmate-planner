-- 1. Tighten RLS on expenses: only payer or trip admin/owner can update/delete
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;

CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE TO authenticated
  USING (
    public.is_trip_member(trip_id, auth.uid())
    AND (payer_id = auth.uid() OR public.is_trip_admin_or_owner(trip_id, auth.uid()))
  );

CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE TO authenticated
  USING (
    public.is_trip_member(trip_id, auth.uid())
    AND (payer_id = auth.uid() OR public.is_trip_admin_or_owner(trip_id, auth.uid()))
  );

-- Insert: you can only add expenses where you are the payer (unless admin/owner)
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND (payer_id = auth.uid() OR public.is_trip_admin_or_owner(trip_id, auth.uid()))
  );

-- 2. Add CHECK constraints on expense amounts
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0);

ALTER TABLE public.expense_splits
  ADD CONSTRAINT expense_splits_share_nonnegative CHECK (share_amount >= 0);

-- 3. Atomic expense split replacement function
-- This replaces the delete-then-insert pattern with a single transaction
CREATE OR REPLACE FUNCTION public.replace_expense_splits(
  _expense_id uuid,
  _splits jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller owns this expense or is admin/owner of the trip
  IF NOT EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = _expense_id
      AND public.is_trip_member(e.trip_id, auth.uid())
      AND (e.payer_id = auth.uid() OR public.is_trip_admin_or_owner(e.trip_id, auth.uid()))
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.expense_splits WHERE expense_id = _expense_id;

  INSERT INTO public.expense_splits (expense_id, user_id, share_amount)
  SELECT
    _expense_id,
    (s->>'user_id')::uuid,
    (s->>'share_amount')::numeric
  FROM jsonb_array_elements(_splits) AS s;
END;
$$;

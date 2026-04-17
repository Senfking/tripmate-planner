-- Allow any trip member to manage claims for any user on line items within
-- their trips. Previously INSERT/UPDATE/DELETE required user_id = auth.uid(),
-- which prevented assigning claims on behalf of other members.

DROP POLICY IF EXISTS "claims_insert" ON public.expense_line_item_claims;
DROP POLICY IF EXISTS "claims_update" ON public.expense_line_item_claims;
DROP POLICY IF EXISTS "claims_delete" ON public.expense_line_item_claims;

-- Any authenticated trip member may insert a claim for any user on a line item
-- belonging to an expense in that trip.
CREATE POLICY "claims_insert" ON public.expense_line_item_claims FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.expense_line_items li
    JOIN public.expenses e ON e.id = li.expense_id
    WHERE li.id = expense_line_item_claims.line_item_id
      AND public.is_trip_member(e.trip_id, auth.uid())
  ));

-- Any trip member may update any claim on a line item in their trip.
CREATE POLICY "claims_update" ON public.expense_line_item_claims FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.expense_line_items li
    JOIN public.expenses e ON e.id = li.expense_id
    WHERE li.id = expense_line_item_claims.line_item_id
      AND public.is_trip_member(e.trip_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.expense_line_items li
    JOIN public.expenses e ON e.id = li.expense_id
    WHERE li.id = expense_line_item_claims.line_item_id
      AND public.is_trip_member(e.trip_id, auth.uid())
  ));

-- Any trip member may delete any claim on a line item in their trip.
CREATE POLICY "claims_delete" ON public.expense_line_item_claims FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.expense_line_items li
    JOIN public.expenses e ON e.id = li.expense_id
    WHERE li.id = expense_line_item_claims.line_item_id
      AND public.is_trip_member(e.trip_id, auth.uid())
  ));

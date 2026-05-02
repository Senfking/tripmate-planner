ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS split_type text NOT NULL DEFAULT 'equal'
    CHECK (split_type IN ('equal', 'custom', 'byItem'));

COMMENT ON COLUMN public.expenses.split_type IS
  'How share_amounts on expense_splits were derived. byItem also implies expense_line_items rows exist (enforced by trg_expenses_enforce_byitem on UPDATE).';

DO $$
BEGIN
  UPDATE public.expenses e
  SET split_type = 'byItem'
  WHERE e.split_type <> 'byItem'
    AND EXISTS (
      SELECT 1 FROM public.expense_line_items li WHERE li.expense_id = e.id
    );

  UPDATE public.expenses e
  SET split_type = 'custom'
  WHERE e.split_type = 'equal'
    AND e.id IN (
      SELECT s.expense_id
      FROM public.expense_splits s
      GROUP BY s.expense_id
      HAVING COUNT(*) > 1
        AND MIN(s.share_amount) <> MAX(s.share_amount)
    );

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'expense split_type backfill failed: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_byitem_has_line_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.split_type = 'byItem' AND OLD.split_type IS DISTINCT FROM 'byItem' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.expense_line_items WHERE expense_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot set split_type to byItem: expense has no line items'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_enforce_byitem ON public.expenses;
CREATE TRIGGER trg_expenses_enforce_byitem
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_byitem_has_line_items();

CREATE OR REPLACE FUNCTION public.delete_expense_line_items_and_claims(_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trip_id uuid;
  _payer_id uuid;
BEGIN
  SELECT trip_id, payer_id INTO _trip_id, _payer_id
    FROM public.expenses WHERE id = _expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (_payer_id = auth.uid() OR public.is_trip_admin_or_owner(_trip_id, auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized to delete line items for this expense'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.expense_line_item_claims
    WHERE line_item_id IN (
      SELECT id FROM public.expense_line_items WHERE expense_id = _expense_id
    );
  DELETE FROM public.expense_line_items WHERE expense_id = _expense_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expense_line_items_and_claims(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_expense_line_items_and_claims(uuid) TO authenticated;
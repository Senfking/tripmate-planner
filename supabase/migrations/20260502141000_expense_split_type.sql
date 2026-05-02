-- =============================================================================
-- Persist split_type as a first-class column on expenses
--
-- Background: the UI used to *infer* split mode from the data shape
--   - rows in expense_line_items   -> 'byItem'
--   - all expense_splits.share_amount equal -> 'equal'
--   - else                                  -> 'custom'
-- Two surfaces (the form modal and the inline header) ran the inference
-- separately and could disagree. The byItem -> equal Edit flow showed the
-- worst symptom: the form pre-selected only the participants who happened
-- to have non-zero shares (often a single person), so toggling to "Equal"
-- divided the total across that single person. See `simon_bug 2` in the
-- audit (2026-05-02) for full reproducer.
--
-- Fix: store split_type on the row. Both surfaces read the same column;
-- both surfaces handle 'equal' the same way (re-broaden participants to
-- all trip members). Server-side guards keep the column trustworthy:
--   - CHECK constraint enforces the three valid values.
--   - BEFORE UPDATE trigger rejects transitions INTO 'byItem' when no
--     line items exist (the form already blocks this; the trigger is
--     defense in depth).
--   - delete_expense_line_items_and_claims RPC lets the payer wipe
--     orphan line items when they switch byItem -> equal/custom. Needed
--     because expense_line_item_claims RLS only lets the claim's owner
--     delete their own row, but the payer must be able to wipe everyone
--     else's claims when they change the mode of their expense.
-- =============================================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS split_type text NOT NULL DEFAULT 'equal'
    CHECK (split_type IN ('equal', 'custom', 'byItem'));

COMMENT ON COLUMN public.expenses.split_type IS
  'How share_amounts on expense_splits were derived. byItem also implies expense_line_items rows exist (enforced by trg_expenses_enforce_byitem on UPDATE).';

-- -----------------------------------------------------------------------------
-- Backfill: derive split_type for existing rows using the same inference the
-- UI used to do. Idempotent: rerunning won't reclassify already-correct rows.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- byItem: any expense with one or more line items.
  UPDATE public.expenses e
  SET split_type = 'byItem'
  WHERE e.split_type <> 'byItem'
    AND EXISTS (
      SELECT 1 FROM public.expense_line_items li WHERE li.expense_id = e.id
    );

  -- custom: 2+ split rows where share_amount values aren't all equal.
  -- Single-row or all-equal split sets stay 'equal' (column default).
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

-- -----------------------------------------------------------------------------
-- Trigger: byItem requires line items. Only fires on the transition INTO
-- byItem; UPDATEs that keep an already-byItem expense as byItem don't run
-- the check (line items can be added/deleted independently). INSERT path
-- is intentionally not gated -- the addExpense flow inserts the row first,
-- then the line items, in separate HTTP calls; deferred constraints don't
-- help across separate transactions, and the form already enforces the
-- invariant client-side.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- RPC: cleanup line items + claims when transitioning away from byItem.
-- SECURITY DEFINER because the payer needs to wipe every member's claim
-- rows, not just their own (which is all expense_line_item_claims RLS
-- allows). Authorization mirrors the line_items_delete RLS policy: the
-- expense's payer or any trip admin/owner.
-- -----------------------------------------------------------------------------
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

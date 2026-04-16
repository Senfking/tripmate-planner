-- Add claimed_quantity column to support partial quantity claims on multi-unit line items.
-- Default 1 preserves existing binary claim semantics.
ALTER TABLE public.expense_line_item_claims
  ADD COLUMN claimed_quantity integer NOT NULL DEFAULT 1;

-- Ensure claimed_quantity is at least 1
ALTER TABLE public.expense_line_item_claims
  ADD CONSTRAINT claimed_quantity_positive CHECK (claimed_quantity >= 1);

-- Add UPDATE policy so users can change their own claim quantities
CREATE POLICY "claims_update" ON public.expense_line_item_claims FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Replace the RPC to accept optional per-assignment quantities
CREATE OR REPLACE FUNCTION public.create_expense_line_items_with_claims(
  _expense_id uuid,
  _items jsonb,
  _assignments jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expense_trip_id uuid;
  _expense_payer_id uuid;
  _item jsonb;
  _line_item_id uuid;
  _idx integer;
  _quantity numeric;
  _total_price numeric;
  _unit_price numeric;
  _is_shared boolean;
  _assignment_entry jsonb;
  _assigned_user_id uuid;
  _assigned_qty integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT e.trip_id, e.payer_id
  INTO _expense_trip_id, _expense_payer_id
  FROM public.expenses e
  WHERE e.id = _expense_id;

  IF _expense_trip_id IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF _expense_payer_id <> auth.uid() AND NOT public.is_trip_admin_or_owner(_expense_trip_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to save line items for this expense';
  END IF;

  IF jsonb_typeof(COALESCE(_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Items payload must be an array';
  END IF;

  IF jsonb_typeof(COALESCE(_assignments, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Assignments payload must be an object';
  END IF;

  IF jsonb_array_length(COALESCE(_items, '[]'::jsonb)) = 0 THEN
    RETURN;
  END IF;

  FOR _idx IN 0 .. jsonb_array_length(_items) - 1 LOOP
    _item := _items -> _idx;
    _quantity := GREATEST(COALESCE(NULLIF(_item ->> 'quantity', '')::numeric, 1), 1);
    _total_price := COALESCE(NULLIF(_item ->> 'total_price', '')::numeric, 0);
    _unit_price := COALESCE(
      NULLIF(_item ->> 'unit_price', '')::numeric,
      _total_price / _quantity
    );
    _is_shared := COALESCE(NULLIF(_item ->> 'is_shared', '')::boolean, false);

    INSERT INTO public.expense_line_items (
      expense_id,
      name,
      quantity,
      unit_price,
      total_price,
      is_shared
    )
    VALUES (
      _expense_id,
      COALESCE(NULLIF(_item ->> 'name', ''), 'Item'),
      _quantity,
      _unit_price,
      _total_price,
      _is_shared
    )
    RETURNING id INTO _line_item_id;

    -- Assignments can be either:
    --   Array of strings (user IDs) → each gets claimed_quantity = 1 (backward compatible)
    --   Array of objects { "user_id": "...", "quantity": N }
    FOR _assignment_entry IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(_assignments -> (_idx::text), '[]'::jsonb)) AS value
    LOOP
      IF jsonb_typeof(_assignment_entry) = 'string' THEN
        _assigned_user_id := (_assignment_entry #>> '{}')::uuid;
        _assigned_qty := 1;
      ELSE
        _assigned_user_id := (_assignment_entry ->> 'user_id')::uuid;
        _assigned_qty := GREATEST(COALESCE((_assignment_entry ->> 'quantity')::integer, 1), 1);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.trip_members tm
        WHERE tm.trip_id = _expense_trip_id
          AND tm.user_id = _assigned_user_id
      ) THEN
        RAISE EXCEPTION 'Assigned user % is not a trip member', _assigned_user_id;
      END IF;

      INSERT INTO public.expense_line_item_claims (line_item_id, user_id, claimed_quantity)
      VALUES (_line_item_id, _assigned_user_id, _assigned_qty);
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_expense_line_items_with_claims(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_expense_line_items_with_claims(uuid, jsonb, jsonb) TO authenticated;

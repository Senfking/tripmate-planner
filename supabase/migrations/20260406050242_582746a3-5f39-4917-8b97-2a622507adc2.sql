
-- Line items from scanned receipts
CREATE TABLE public.expense_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_items_select" ON public.expense_line_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = expense_line_items.expense_id
      AND public.is_trip_member(e.trip_id, auth.uid())
  ));

CREATE POLICY "line_items_insert" ON public.expense_line_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = expense_line_items.expense_id
      AND public.is_trip_member(e.trip_id, auth.uid())
  ));

CREATE POLICY "line_items_delete" ON public.expense_line_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = expense_line_items.expense_id
      AND (e.payer_id = auth.uid() OR public.is_trip_admin_or_owner(e.trip_id, auth.uid()))
  ));

-- Claims: which member claimed which line item
CREATE TABLE public.expense_line_item_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id uuid NOT NULL REFERENCES public.expense_line_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(line_item_id, user_id)
);

ALTER TABLE public.expense_line_item_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "claims_select" ON public.expense_line_item_claims FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.expense_line_items li
    JOIN public.expenses e ON e.id = li.expense_id
    WHERE li.id = expense_line_item_claims.line_item_id
      AND public.is_trip_member(e.trip_id, auth.uid())
  ));

CREATE POLICY "claims_insert" ON public.expense_line_item_claims FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.expense_line_items li
      JOIN public.expenses e ON e.id = li.expense_id
      WHERE li.id = expense_line_item_claims.line_item_id
        AND public.is_trip_member(e.trip_id, auth.uid())
    )
  );

CREATE POLICY "claims_delete" ON public.expense_line_item_claims FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX idx_line_items_expense ON public.expense_line_items(expense_id);
CREATE INDEX idx_claims_line_item ON public.expense_line_item_claims(line_item_id);

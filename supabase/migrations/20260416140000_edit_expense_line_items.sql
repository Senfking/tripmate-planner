-- Add UPDATE RLS policy: any trip member may edit name, quantity, unit_price,
-- total_price, or is_shared on a line item belonging to their trip.
CREATE POLICY "line_items_update" ON public.expense_line_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = expense_line_items.expense_id
      AND public.is_trip_member(e.trip_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.id = expense_line_items.expense_id
      AND public.is_trip_member(e.trip_id, auth.uid())
  ));

-- Trigger: keep total_price = quantity × unit_price consistent on every update
-- that touches either column. The frontend does not need to recompute this value.
CREATE OR REPLACE FUNCTION public.recalc_line_item_total_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN
    NEW.total_price := NEW.quantity * NEW.unit_price;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_line_item_total_price
  BEFORE UPDATE ON public.expense_line_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_line_item_total_price();

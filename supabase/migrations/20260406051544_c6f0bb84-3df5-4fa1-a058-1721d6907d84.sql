ALTER TABLE public.expense_line_items
  ADD COLUMN is_shared boolean NOT NULL DEFAULT false;
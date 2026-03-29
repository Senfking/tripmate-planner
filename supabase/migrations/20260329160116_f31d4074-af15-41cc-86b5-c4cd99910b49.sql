-- Add category and itinerary_item_id to expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS itinerary_item_id uuid REFERENCES public.itinerary_items(id) ON DELETE SET NULL;

-- Add settlement_currency to trips
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS settlement_currency text NOT NULL DEFAULT 'EUR';
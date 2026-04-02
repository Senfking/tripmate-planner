ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_notes text;
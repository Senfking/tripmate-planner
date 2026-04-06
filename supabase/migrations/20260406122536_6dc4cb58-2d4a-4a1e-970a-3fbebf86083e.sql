-- Add receipt image path column to expenses
ALTER TABLE public.expenses ADD COLUMN receipt_image_path text;

-- Create private storage bucket for receipt images
INSERT INTO storage.buckets (id, name, public) VALUES ('receipt-images', 'receipt-images', false);

-- Trip members can upload receipts (path: {trip_id}/{filename})
CREATE POLICY "Trip members can upload receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipt-images'
  AND public.is_trip_member((storage.foldername(name))[1]::uuid, auth.uid())
);

-- Trip members can view receipts for their trips
CREATE POLICY "Trip members can view receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipt-images'
  AND public.is_trip_member((storage.foldername(name))[1]::uuid, auth.uid())
);

-- Payers and admins can delete receipts
CREATE POLICY "Trip members can delete receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'receipt-images'
  AND public.is_trip_member((storage.foldername(name))[1]::uuid, auth.uid())
);
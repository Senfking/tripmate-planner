-- Expand attachments.type CHECK constraint to allow new document categories:
-- visa, insurance, transport, payment
ALTER TABLE public.attachments DROP CONSTRAINT attachments_type_check;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_type_check
  CHECK (type IN ('flight', 'hotel', 'activity', 'other', 'link', 'visa', 'insurance', 'transport', 'payment'));

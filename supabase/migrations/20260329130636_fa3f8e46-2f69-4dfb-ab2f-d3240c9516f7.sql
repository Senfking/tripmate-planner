ALTER TABLE public.attachments
ADD CONSTRAINT attachments_created_by_fkey
FOREIGN KEY (created_by) REFERENCES public.profiles(id);
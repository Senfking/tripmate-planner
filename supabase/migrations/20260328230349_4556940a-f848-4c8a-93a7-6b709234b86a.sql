ALTER TABLE public.polls DROP CONSTRAINT polls_type_check;
ALTER TABLE public.polls ADD CONSTRAINT polls_type_check CHECK (type = ANY (ARRAY['date'::text, 'destination'::text, 'preference'::text]));
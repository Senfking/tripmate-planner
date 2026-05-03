DROP TABLE IF EXISTS public._smoketest_results;
CREATE TABLE public._smoketest_results (id serial primary key, label text, payload jsonb, created_at timestamptz default now());
INSERT INTO public._smoketest_results (label, payload) VALUES ('push_auth_run1', public._smoketest_push_auth());
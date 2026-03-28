
-- Add vibe board columns to trips
ALTER TABLE public.trips
  ADD COLUMN vibe_board_active boolean NOT NULL DEFAULT false,
  ADD COLUMN vibe_board_locked boolean NOT NULL DEFAULT false;

-- Create vibe_responses table
CREATE TABLE public.vibe_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question_key text NOT NULL,
  answer_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index: one answer per question per user (except musthave)
CREATE UNIQUE INDEX vibe_responses_unique_non_musthave
  ON public.vibe_responses (trip_id, user_id, question_key)
  WHERE question_key != 'musthave';

-- Trigger: enforce max 2 musthave rows per user per trip
CREATE OR REPLACE FUNCTION public.enforce_musthave_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _count int;
BEGIN
  IF NEW.question_key = 'musthave' THEN
    SELECT count(*) INTO _count
    FROM public.vibe_responses
    WHERE trip_id = NEW.trip_id
      AND user_id = NEW.user_id
      AND question_key = 'musthave'
      AND id IS DISTINCT FROM NEW.id;
    IF _count >= 2 THEN
      RAISE EXCEPTION 'Maximum 2 must-have selections allowed per member';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_musthave_limit
  BEFORE INSERT OR UPDATE ON public.vibe_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_musthave_limit();

-- Enable RLS
ALTER TABLE public.vibe_responses ENABLE ROW LEVEL SECURITY;

-- RLS: select own rows only
CREATE POLICY vibe_responses_select ON public.vibe_responses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND is_trip_member(trip_id, auth.uid()));

-- RLS: insert own rows
CREATE POLICY vibe_responses_insert ON public.vibe_responses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_trip_member(trip_id, auth.uid()));

-- RLS: update own rows
CREATE POLICY vibe_responses_update ON public.vibe_responses
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND is_trip_member(trip_id, auth.uid()));

-- RLS: delete own rows
CREATE POLICY vibe_responses_delete ON public.vibe_responses
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND is_trip_member(trip_id, auth.uid()));

-- Security-definer function: aggregate counts (no user_ids exposed)
CREATE OR REPLACE FUNCTION public.get_vibe_aggregates(_trip_id uuid)
RETURNS TABLE (question_key text, answer_value text, response_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vr.question_key, vr.answer_value, count(*) as response_count
  FROM public.vibe_responses vr
  WHERE vr.trip_id = _trip_id
    AND public.is_trip_member(_trip_id, auth.uid())
  GROUP BY vr.question_key, vr.answer_value;
$$;

-- Security-definer function: count of distinct respondents
CREATE OR REPLACE FUNCTION public.get_vibe_respondent_count(_trip_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT vr.user_id)
  FROM public.vibe_responses vr
  WHERE vr.trip_id = _trip_id
    AND public.is_trip_member(_trip_id, auth.uid());
$$;

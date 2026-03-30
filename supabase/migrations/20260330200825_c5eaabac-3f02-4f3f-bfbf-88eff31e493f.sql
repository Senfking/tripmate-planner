
-- Add future-proofing columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_currency text DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"new_activity":true,"new_expense":true,"new_member":true,"route_confirmed":true,"decisions_reminder":true}',
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id);

-- Auto-generate referral codes for new users
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  _code text;
  _exists boolean;
BEGIN
  LOOP
    _code := '';
    FOR i IN 1..8 LOOP
      _code := _code || substr(_chars, floor(random() * length(_chars) + 1)::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = _code) INTO _exists;
    IF NOT _exists THEN
      NEW.referral_code := _code;
      RETURN NEW;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE TRIGGER trg_generate_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.referral_code IS NULL)
  EXECUTE FUNCTION public.generate_referral_code();

-- Push notification subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  keys jsonb NOT NULL,
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_own" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Feature flag helper function
CREATE OR REPLACE FUNCTION public.user_has_feature(_user_id uuid, _feature text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (feature_flags ->> _feature)::boolean,
    CASE WHEN subscription_tier = 'pro' THEN true ELSE false END
  )
  FROM public.profiles WHERE id = _user_id;
$$;

-- Subscription tier check
CREATE OR REPLACE FUNCTION public.user_tier(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(subscription_tier, 'free') FROM public.profiles WHERE id = _user_id;
$$;

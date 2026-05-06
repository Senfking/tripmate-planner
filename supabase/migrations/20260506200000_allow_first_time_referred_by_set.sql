-- =============================================================================
-- enforce_profiles_privileged_fields: allow first-time referred_by set
-- =============================================================================
-- The previous version of this trigger (migration 20260506192747) blocked any
-- change to profiles.referred_by for non-service_role callers, which broke
-- referral attribution. Both signup paths
--   - src/pages/ReferralLanding.tsx (email signup)
--   - src/pages/AuthCallback.tsx    (Google / Apple OAuth)
-- run the attribution as the just-signed-in user via
--   supabase.from("profiles").update({ referred_by }).eq("id", user.id)
-- so they hit the privileged-fields check and silently fail (the clients don't
-- inspect the error). Result: friends who used a referral code after the
-- trigger landed have referred_by = NULL and are invisible to the /ref counter
-- and the admin referral leaderboard.
--
-- This migration relaxes the trigger to permit a one-time first-time set of
-- referred_by (NULL -> uuid). Reassignment, clearing, and self-referral remain
-- blocked, so the column is still effectively immutable once attributed.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enforce_profiles_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role to bypass (e.g. Stripe webhook updating subscription)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.feature_flags IS DISTINCT FROM OLD.feature_flags
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
  THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields'
      USING ERRCODE = '42501';
  END IF;

  -- referred_by: allow first-time set only. Block reassignment, clearing, and self-referral.
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    IF OLD.referred_by IS NOT NULL THEN
      RAISE EXCEPTION 'referred_by is already set and cannot be changed'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.referred_by IS NULL THEN
      RAISE EXCEPTION 'referred_by cannot be cleared'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.referred_by = NEW.id THEN
      RAISE EXCEPTION 'cannot refer yourself'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

import { supabase } from "@/integrations/supabase/client";
import { captureSupabaseFailure } from "@/lib/sentry";

const REFERRAL_STORAGE_KEY = "junto_referral_code";
const REFERRAL_TIMEOUT_MS = 8000;

export function getStoredReferralCode(): string | null {
  try {
    return localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredReferralCode(): void {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch { /* noop */ }
}

function withTimeout<T>(p: PromiseLike<T>, op: string): Promise<T | { __timeout: true; op: string }> {
  return Promise.race<T | { __timeout: true; op: string }>([
    Promise.resolve(p),
    new Promise((resolve) =>
      setTimeout(() => resolve({ __timeout: true, op }), REFERRAL_TIMEOUT_MS),
    ),
  ]);
}

// Fire-and-forget referral attribution. Signup must never block on this:
// the RPC + profile update have hit Supabase gateway 504s during cold
// starts, hanging the post-signup redirect. Caller does not await.
export function attributeReferralInBackground(userId: string, code: string): void {
  if (!userId || !code) {
    clearStoredReferralCode();
    return;
  }

  const run = async () => {
    try {
      const rpcResult = await withTimeout(
        supabase.rpc("resolve_referral_code", { _code: code }),
        "resolve_referral_code",
      );

      if ("__timeout" in rpcResult) {
        captureSupabaseFailure(new Error("referral_rpc_timeout"), {
          op: rpcResult.op,
          user_id: userId,
        });
        return;
      }

      if (rpcResult.error) {
        captureSupabaseFailure(rpcResult.error, {
          op: "resolve_referral_code",
          user_id: userId,
        });
        return;
      }

      const referrerId = rpcResult.data as string | null;
      if (!referrerId) return;

      const updateResult = await withTimeout(
        supabase
          .from("profiles")
          .update({ referred_by: referrerId })
          .eq("id", userId),
        "profiles.update.referred_by",
      );

      if ("__timeout" in updateResult) {
        captureSupabaseFailure(new Error("referral_update_timeout"), {
          op: updateResult.op,
          user_id: userId,
        });
        return;
      }

      if (updateResult.error) {
        captureSupabaseFailure(updateResult.error, {
          op: "profiles.update.referred_by",
          user_id: userId,
        });
      }
    } catch (err) {
      captureSupabaseFailure(err, {
        op: "attributeReferralInBackground",
        user_id: userId,
      });
    } finally {
      clearStoredReferralCode();
    }
  };

  void run();
}

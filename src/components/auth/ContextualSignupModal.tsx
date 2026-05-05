import { useEffect, useState } from "react";
import { Loader2, Sparkles, CalendarRange, Users, Wallet, Bookmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { lovable } from "@/integrations/lovable/index";
import { friendlyError } from "@/lib/friendlyError";
import { peekAnonSessionId, clearAnonSessionId } from "@/lib/anonSession";
import { trackEvent } from "@/lib/analytics";

export type SignupTrigger = "save" | "regenerate" | "rate_limit";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: SignupTrigger;
  /** Where to send the user after auth succeeds AND any anon trip is claimed.
   *  If a claim happens, we route to /app/trips/[claimed_id] instead. */
  fallbackRedirect?: string;
}

const COPY: Record<SignupTrigger, { headline: string; sub: string }> = {
  save: {
    headline: "Save your trip — sign up in 10 seconds",
    sub: "Create a free account to keep this trip and invite friends.",
  },
  regenerate: {
    headline: "Sign up to refine and regenerate this trip",
    sub: "Tweak vibes, swap activities, and try again with a free account.",
  },
  rate_limit: {
    headline: "You've used your free Junto preview",
    sub: "Sign up to plan unlimited group trips with AI.",
  },
};

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM260.9 79.7c25.7-30.5 23.4-58.3 22.6-68.3-22.7 1.3-49 15.4-64 32.8-16.5 18.7-26.2 41.8-24.1 67.8 24.5 1.9 46.9-10.7 65.5-32.3z" />
    </svg>
  );
}

/**
 * Tries to claim any anonymous trips for the current localStorage session id.
 * On success returns the first claimed trip id (newest); otherwise null.
 */
async function claimAnonTrips(): Promise<string | null> {
  const sessionId = peekAnonSessionId();
  if (!sessionId) return null;
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return null;
    const res = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/claim-anonymous-trip`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          apikey,
        },
        body: JSON.stringify({ anon_session_id: sessionId }),
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const ids = Array.isArray(json?.claimed_trip_ids) ? json.claimed_trip_ids : [];
    if (ids.length > 0) {
      // Clear after a successful claim so a subsequent generation starts fresh.
      clearAnonSessionId();
      return ids[ids.length - 1] as string;
    }
    return null;
  } catch (e) {
    console.error("[ContextualSignupModal] claim failed:", e);
    return null;
  }
}

function SignupBody({ trigger, onClose, fallbackRedirect }: { trigger: SignupTrigger; onClose: () => void; fallbackRedirect: string }) {
  const navigate = useNavigate();
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [showEmail, setShowEmail] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const copy = COPY[trigger];

  useEffect(() => {
    trackEvent("contextual_signup_shown", { trigger });
  }, [trigger]);

  async function handleAfterAuth() {
    const claimed = await claimAnonTrips();
    onClose();
    if (claimed) {
      navigate(`/app/trips/${claimed}`, { replace: true });
    } else {
      navigate(fallbackRedirect, { replace: true });
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    const callback = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent("/trips/new?claim=1")}`;
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: callback });
    setGoogleLoading(false);
    if (result.error) {
      setError(friendlyError(String(result.error)));
      return;
    }
    if (!result.redirected) await handleAfterAuth();
  }

  async function handleApple() {
    setError(null);
    setAppleLoading(true);
    const callback = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent("/trips/new?claim=1")}`;
    const result = await lovable.auth.signInWithOAuth("apple", { redirect_uri: callback });
    setAppleLoading(false);
    if (result.error) {
      setError(friendlyError(String(result.error)));
      return;
    }
    if (!result.redirected) await handleAfterAuth();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === "signup") {
      const { error: err } = await signUp(email, password, displayName || email.split("@")[0]);
      setLoading(false);
      if (err) {
        setError(friendlyError(err.message));
        return;
      }
      await handleAfterAuth();
    } else {
      const { error: err } = await signIn(email, password);
      setLoading(false);
      if (err) {
        setError(friendlyError(err.message));
        return;
      }
      await handleAfterAuth();
    }
  }

  return (
    <div
      className="px-6 pt-2 pb-6 text-white"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, rgba(13,148,136,0.22) 0%, rgba(13,148,136,0) 55%), #0a0a0a",
      }}
    >
      <div className="text-center pt-4 pb-5">
        {trigger === "rate_limit" && (
          <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-400/30 to-teal-600/20 ring-1 ring-teal-300/30">
            <Sparkles className="h-5 w-5 text-teal-300" />
          </div>
        )}
        <h2 className="text-[22px] font-bold leading-tight tracking-tight">
          {copy.headline}
        </h2>
        <p className="mt-2 text-sm text-white/70">{copy.sub}</p>
      </div>

      {trigger === "rate_limit" && (
        <ul className="mb-5 space-y-2.5 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-4">
          {[
            { Icon: CalendarRange, text: "Plan unlimited trips" },
            { Icon: Users, text: "Invite friends to vote and collaborate" },
            { Icon: Wallet, text: "Split expenses automatically across the group" },
            { Icon: Bookmark, text: "Save and edit trips anytime" },
          ].map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-[13.5px] text-white/85">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 ring-1 ring-teal-400/25">
                <Icon className="h-3.5 w-3.5 text-teal-300" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mb-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(220,38,38,0.15)", color: "#fca5a5" }}>
          {error}
        </p>
      )}

      <div className="space-y-3">
        <button
          type="button"
          disabled={googleLoading}
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-2 font-medium rounded-2xl active:opacity-80"
          style={{ height: 50, fontSize: 15, background: "rgba(255,255,255,0.95)", color: "#1f1f1f" }}
        >
          {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
          Continue with Google
        </button>
        <button
          type="button"
          disabled={appleLoading}
          onClick={handleApple}
          className="w-full flex items-center justify-center gap-2 font-medium rounded-2xl active:opacity-80"
          style={{ height: 50, fontSize: 15, background: "#000", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {appleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleIcon />}
          Continue with Apple
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowEmail((v) => !v)}
        className="mt-4 mx-auto block text-[13px] text-teal-300 hover:text-teal-200 transition-colors"
      >
        {showEmail ? "Hide email signup" : "Or sign up with email"}
      </button>

      {showEmail && (
        <form onSubmit={handleSubmit} className="space-y-3 mt-3">
          {mode === "signup" && (
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              className="w-full rounded-xl px-4 text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-white/30"
              style={{ height: 46, fontSize: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl px-4 text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-white/30"
            style={{ height: 46, fontSize: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl px-4 text-white placeholder:text-white/40 outline-none focus:ring-1 focus:ring-white/30"
            style={{ height: 46, fontSize: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 text-white font-semibold rounded-2xl active:opacity-80"
            style={{ height: 50, fontSize: 15, background: "linear-gradient(135deg,#0D9488 0%,#0F766E 100%)" }}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-[12px] text-white/45">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button type="button" onClick={() => { setMode("signin"); setShowEmail(true); setError(null); }} className="underline underline-offset-2 text-white/65">
              Sign in
            </button>
          </>
        ) : (
          <>
            Don't have an account?{" "}
            <button type="button" onClick={() => { setMode("signup"); setError(null); }} className="underline underline-offset-2 text-white/65">
              Create account
            </button>
          </>
        )}
      </p>

      {trigger === "rate_limit" && (
        <div className="mt-4 space-y-2 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] text-white/55 hover:text-white/80 underline underline-offset-2"
          >
            Back to trip
          </button>
          <p className="text-[11px] text-white/35 px-2">
            Your previous trip is saved — you'll find it in your dashboard after signup.
          </p>
        </div>
      )}
    </div>
  );
}

export function ContextualSignupModal({ open, onOpenChange, trigger, fallbackRedirect = "/app/trips" }: Props) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className="z-[10001] bg-[#0a0a0a] border-white/10 text-white"
          style={{ zIndex: 10001 }}
        >
          <DrawerTitle className="sr-only">Sign up to Junto</DrawerTitle>
          <DrawerDescription className="sr-only">Create a free account to save your trip and keep planning with Junto.</DrawerDescription>
          <SignupBody trigger={trigger} onClose={() => onOpenChange(false)} fallbackRedirect={fallbackRedirect} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 bg-[#0a0a0a] border-white/10 overflow-hidden"
        style={{ zIndex: 10001 }}
      >
        <DialogTitle className="sr-only">Sign up to Junto</DialogTitle>
        <DialogDescription className="sr-only">Create a free account to save your trip and keep planning with Junto.</DialogDescription>
        <SignupBody trigger={trigger} onClose={() => onOpenChange(false)} fallbackRedirect={fallbackRedirect} />
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendlyError";
import { Loader2 } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase emits PASSWORD_RECOVERY when the user lands from a recovery
  // link. We also accept any existing session as proof we can call updateUser.
  useEffect(() => {
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(true);
        setReady(true);
      }
    });

    // Fallback: check existing session (e.g. user refreshed the page after
    // the recovery callback completed).
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setHasSession(true);
      setReady(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(friendlyError(err.message));
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/app/trips", { replace: true }), 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-3xl bg-card p-8 shadow-xl border border-border">
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Set a new password
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Choose a new password for your Junto account.
        </p>

        {!ready ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !hasSession ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive">
              This reset link is invalid or has expired.
            </p>
            <button
              onClick={() => navigate("/ref", { replace: true })}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold"
            >
              Back to sign in
            </button>
          </div>
        ) : done ? (
          <p className="text-sm text-foreground">
            Password updated. Redirecting…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <p className="rounded-xl px-3 py-2 text-sm bg-destructive/10 text-destructive">
                {error}
              </p>
            )}
            <input
              type="password"
              required
              minLength={6}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="w-full h-12 rounded-xl px-4 bg-muted border border-border text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="w-full h-12 rounded-xl px-4 bg-muted border border-border text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

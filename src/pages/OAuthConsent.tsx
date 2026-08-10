import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type AuthClient = { name?: string | null; client_name?: string | null } | null;

type AuthDetails = {
  client?: AuthClient;
  redirect_url?: string;
  redirect_to?: string;
} | null;

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthDetails; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthDetails; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthDetails; error: { message: string } | null }>;
};

function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthDetails>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/ref?redirect=" + encodeURIComponent(next);
        return;
      }
      const { data, error: err } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (err) {
        setError(err.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error: err } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "this app";

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.2em] text-muted-foreground">JUNTO</p>
        {error ? (
          <>
            <h1 className="mt-4 text-xl font-semibold text-foreground">Could not load this request</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </>
        ) : !details ? (
          <>
            <h1 className="mt-4 text-xl font-semibold text-foreground">Loading…</h1>
            <p className="mt-2 text-sm text-muted-foreground">Checking the authorization request.</p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-semibold text-foreground">
              Connect {clientName} to your Junto account
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {clientName} will be able to read your trips, itineraries, ideas and expenses, and add new ones,
              acting as you. You can revoke access at any time.
            </p>
            <div className="mt-6 flex gap-3">
              <Button disabled={busy} onClick={() => decide(true)} className="flex-1">
                Approve
              </Button>
              <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="flex-1">
                Deny
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

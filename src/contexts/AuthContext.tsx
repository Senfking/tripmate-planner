import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { ensureFreshSession, VISIBILITY_BUFFER_SECONDS } from "@/lib/sessionRefresh";
import { setCurrentUserId } from "@/lib/admin";

type NotificationPreferences = {
  new_activity: boolean;
  new_expense: boolean;
  new_member: boolean;
  route_confirmed: boolean;
  decisions_reminder: boolean;
};

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  default_currency: string | null;
  subscription_tier: string;
  notification_preferences: NotificationPreferences;
  referral_code: string | null;
  /**
   * Legacy multi-nationality array. Kept for backward compatibility while the
   * scalar columns roll out — read-only from this point. New writes go to
   * `nationality_iso` / `secondary_nationality_iso` from PR #233.
   */
  nationalities: string[];
  nationality_iso: string | null;
  secondary_nationality_iso: string | null;
};

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ data: any; error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PROFILE_SELECT = "id, display_name, avatar_url, default_currency, subscription_tier, notification_preferences, referral_code, nationalities, nationality_iso, secondary_nationality_iso";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const prevUserIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", userId)
      .single();
    if (data) {
      setProfile({
        ...data,
        notification_preferences: (data.notification_preferences as unknown as NotificationPreferences) ?? {
          new_activity: true,
          new_expense: true,
          new_member: true,
          route_confirmed: true,
          decisions_reminder: true,
        },
        nationalities: ((data as any).nationalities as string[] | null) ?? [],
        nationality_iso: ((data as any).nationality_iso as string | null) ?? null,
        secondary_nationality_iso: ((data as any).secondary_nationality_iso as string | null) ?? null,
      });
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentUser = user;
    if (currentUser) {
      await fetchProfile(currentUser.id);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        const newUserId = newSession?.user?.id ?? null;
        const prevUserId = prevUserIdRef.current;
        prevUserIdRef.current = newUserId;
        setCurrentUserId(newUserId);

        // Preserve the user reference when identity hasn't changed.
        // TOKEN_REFRESHED (fires on tab focus / near-expiry) hands us a NEW
        // User object with the same id — replacing it churns every useAuth()
        // consumer and cascades through ProtectedRoute → AppLayout → Outlet,
        // which unmounts the active route component (e.g. ExpensesTab).
        setUser((prev) => {
          if (newUserId && prev?.id === newUserId) return prev;
          return newSession?.user ?? null;
        });
        setSession((prev) => {
          if (newUserId && prev?.user?.id === newUserId && newSession) {
            // Same identity — keep prior reference to avoid cascading memo
            // invalidations. The access_token inside Supabase's internal state
            // is already updated; consumers that need the fresh token read it
            // via supabase.auth.getSession() or the client's own calls.
            return prev;
          }
          return newSession;
        });

        if (newSession?.user) {
          // Only refetch profile when the identity actually changed. Both
          // TOKEN_REFRESHED and spurious SIGNED_IN (Supabase v2 emits it on
          // every auto-refresh, not only on real login) carry the same userId
          // — the profile can't have changed, and the extra fetch adds a render
          // cycle on every tab focus.
          const isNewIdentity = prevUserId !== newUserId;
          if (isNewIdentity) {
            setTimeout(() => fetchProfile(newSession.user.id), 0);
          }
        } else {
          setProfile(null);
        }
        setLoading(false);

        // Only flush caches when the user genuinely changed (null → populated,
        // or user A → user B). Supabase v2 emits SIGNED_IN on every tab-return
        // auto-refresh — blanket invalidation there causes a refetch storm that
        // unmounts form children and resets their local state.
        if (event === "SIGNED_IN" && prevUserId !== newUserId) {
          queryClient.invalidateQueries();
        }
      }
    );

    // On initial load, refresh the session if the cached JWT is close to
    // expiring. Reading a stale session from storage and firing queries with
    // an expired token is what causes the expenses page to render empty on
    // first load — a subsequent tab switch re-fetches with a fresh token and
    // everything appears.
    ensureFreshSession()
      .then(() => supabase.auth.getSession())
      .then(({ data: { session: existing } }) => {
        setSession(existing);
        setUser(existing?.user ?? null);
        setCurrentUserId(existing?.user?.id ?? null);
        if (existing?.user) {
          fetchProfile(existing.user.id);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    // Refresh the JWT when the tab returns to the foreground. Browsers
    // throttle Supabase's autoRefreshToken interval while backgrounded, so a
    // mutation fired right after tab-return can hit RLS with an expired token.
    // Postgres treats that as auth.uid() = NULL — the request affects 0 rows
    // and PostgREST returns no error, so the UI silently "succeeds" (e.g.
    // trip delete confirms but the row remains). ensureFreshSession dedupes
    // via an inFlight promise so concurrent mutations awaiting the same
    // refresh share one network round-trip.
    //
    // iOS standalone PWAs are the worst case here: visibilitychange is
    // unreliable on app-switch (the WebView gets suspended whole), and
    // returning to the app sometimes fires only `focus` or `pageshow`
    // (persisted=true on bfcache restore). Listen for all three; the dedupe
    // means firing the same refresh from multiple events is cheap.
    const refreshOnReturn = () => {
      ensureFreshSession(VISIBILITY_BUFFER_SECONDS).then(async (outcome) => {
        if (outcome === "failed") {
          // Refresh attempt errored (e.g. refresh token revoked / network
          // partition that didn't recover). Sign out so ProtectedRoute sends
          // the user back to login instead of leaving them stuck with stale
          // credentials that will keep failing every mutation.
          try {
            await supabase.auth.signOut();
          } catch {
            // signOut already failed-soft; nothing else we can do here.
          }
          return;
        }
        if (outcome === "no-session") return;
        // Auth is fresh — refetch active queries so the UI updates with
        // server-side changes the user might have missed while away. This
        // bypasses the per-query staleTime, which is intentional: returning
        // to the app is a strong signal the user wants current data, and
        // refetchOnWindowFocus alone won't fire when staleTime hasn't
        // elapsed. Scoped to "active" so unmounted screens stay quiet.
        queryClient.refetchQueries({ type: "active" });
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshOnReturn();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // persisted=true means the page was restored from bfcache (Safari/iOS
      // back/forward, sometimes app-switch). persisted=false fires on every
      // initial load — refreshing then is harmless (dedupe + buffer check)
      // and cheap, so don't bother gating on it.
      void e;
      refreshOnReturn();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refreshOnReturn);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data?.user) {
      trackEvent("user_login", { method: "email" }, data.user.id);
    }
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (!error && data?.user) {
      trackEvent("user_signup", { method: "email" }, data.user.id);
    }
    return { data, error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    await supabase.auth.signOut();
    if (userId) trackEvent("user_logout", {}, userId);
    setUser(null);
    setSession(null);
    setProfile(null);
    setCurrentUserId(null);
  }, []);

  const value = useMemo(() => ({
    user, session, profile, loading, signIn, signUp, signOut, refreshProfile,
  }), [user, session, profile, loading, signIn, signUp, signOut, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
